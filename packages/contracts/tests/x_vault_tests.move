#[test_only]
module levo::x_vault_tests {
    use sui::test_scenario;
    use sui::coin;
    use sui::sui::SUI;
    use levo::x_vault::{Self, XVaultRegistry, XVault};
    use levo::test_usdc::TEST_USDC;

    const ADMIN: address = @0xAD;
    const ALICE: address = @0xA11CE;
    const BOB: address = @0xB0B;

    const USER_ID_ALICE: u64 = 1001;
    const USER_ID_BOB: u64 = 1002;

    /// Test-only object with `key + store` for rescue_object tests.
    public struct TestNFT has key, store {
        id: UID,
        value: u64,
    }

    /// One-time witness matching the module name, so tests can create
    /// a real `0x2::coin` metadata object for rescue_object coverage.
    public struct X_VAULT_TESTS has drop {}

    // ===== Test 1: derive_vault_address is deterministic =====

    #[test]
    fun test_derive_address_is_deterministic() {
        let mut scenario = test_scenario::begin(ADMIN);
        x_vault::init_for_testing(scenario.ctx());

        scenario.next_tx(ADMIN);
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            let addr1 = x_vault::derive_vault_address(&registry, USER_ID_ALICE);
            let addr2 = x_vault::derive_vault_address(&registry, USER_ID_ALICE);
            assert!(addr1 == addr2, 0);
            test_scenario::return_shared(registry);
        };
        scenario.end();
    }

    // ===== Test 2: different users get different addresses =====

    #[test]
    fun test_derive_different_users_get_different_addresses() {
        let mut scenario = test_scenario::begin(ADMIN);
        x_vault::init_for_testing(scenario.ctx());

        scenario.next_tx(ADMIN);
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            let addr_alice = x_vault::derive_vault_address(&registry, USER_ID_ALICE);
            let addr_bob = x_vault::derive_vault_address(&registry, USER_ID_BOB);
            assert!(addr_alice != addr_bob, 0);
            test_scenario::return_shared(registry);
        };
        scenario.end();
    }

    // ===== Test 3: claim_vault sets owner and x_user_id correctly =====

    #[test]
    fun test_claim_vault() {
        let mut scenario = test_scenario::begin(ADMIN);
        x_vault::init_for_testing(scenario.ctx());

        scenario.next_tx(ALICE);
        {
            let mut registry = scenario.take_shared<XVaultRegistry>();
            let vault = x_vault::claim_vault_for_testing(
                &mut registry, USER_ID_ALICE, ALICE, scenario.ctx(),
            );
            assert!(x_vault::vault_owner(&vault) == ALICE, 0);
            assert!(x_vault::vault_x_user_id(&vault) == USER_ID_ALICE, 1);
            x_vault::transfer_vault(vault, scenario.ctx());
            test_scenario::return_shared(registry);
        };
        scenario.end();
    }

    // ===== Test 4: sweep single coin into vault =====

    #[test]
    fun test_sweep_single_coin() {
        let mut scenario = test_scenario::begin(ADMIN);
        x_vault::init_for_testing(scenario.ctx());

        // Step 1: Derive the vault address and send a coin to it
        scenario.next_tx(ALICE);
        let vault_addr;
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            vault_addr = x_vault::derive_vault_address(&registry, USER_ID_ALICE);
            test_scenario::return_shared(registry);
        };

        // Step 2: Mint a coin and send it to the vault's derived address
        scenario.next_tx(ALICE);
        {
            let coin = coin::mint_for_testing<SUI>(1_000_000, scenario.ctx());
            transfer::public_transfer(coin, vault_addr);
        };

        // Step 3: Claim the vault
        scenario.next_tx(ALICE);
        {
            let mut registry = scenario.take_shared<XVaultRegistry>();
            let vault = x_vault::claim_vault_for_testing(
                &mut registry, USER_ID_ALICE, ALICE, scenario.ctx(),
            );
            x_vault::transfer_vault(vault, scenario.ctx());
            test_scenario::return_shared(registry);
        };

        // Step 4: Sweep the coin into the vault
        scenario.next_tx(ALICE);
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            let mut vault = scenario.take_from_address<XVault>(ALICE);

            // Get a receiving ticket for the coin that was sent to the vault address
            let vault_id = object::id(&vault);
            let ticket = test_scenario::most_recent_receiving_ticket<coin::Coin<SUI>>(&vault_id);

            x_vault::sweep_coin_to_vault(&registry, &mut vault, ticket);
            assert!(x_vault::vault_balance<SUI>(&vault) == 1_000_000, 0);

            test_scenario::return_shared(registry);
            test_scenario::return_to_address(ALICE, vault);
        };
        scenario.end();
    }

    // ===== Test 5: withdraw partial amount =====

    #[test]
    fun test_withdraw_partial() {
        let mut scenario = test_scenario::begin(ADMIN);
        x_vault::init_for_testing(scenario.ctx());

        // Derive address and mint coin to it
        scenario.next_tx(ALICE);
        let vault_addr;
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            vault_addr = x_vault::derive_vault_address(&registry, USER_ID_ALICE);
            test_scenario::return_shared(registry);
        };

        scenario.next_tx(ALICE);
        {
            let coin = coin::mint_for_testing<SUI>(1_000_000, scenario.ctx());
            transfer::public_transfer(coin, vault_addr);
        };

        // Claim vault
        scenario.next_tx(ALICE);
        {
            let mut registry = scenario.take_shared<XVaultRegistry>();
            let vault = x_vault::claim_vault_for_testing(
                &mut registry, USER_ID_ALICE, ALICE, scenario.ctx(),
            );
            x_vault::transfer_vault(vault, scenario.ctx());
            test_scenario::return_shared(registry);
        };

        // Sweep
        scenario.next_tx(ALICE);
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            let mut vault = scenario.take_from_address<XVault>(ALICE);
            let vault_id = object::id(&vault);
            let ticket = test_scenario::most_recent_receiving_ticket<coin::Coin<SUI>>(&vault_id);
            x_vault::sweep_coin_to_vault(&registry, &mut vault, ticket);
            test_scenario::return_shared(registry);
            test_scenario::return_to_address(ALICE, vault);
        };

        // Withdraw partial
        scenario.next_tx(ALICE);
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            let mut vault = scenario.take_from_address<XVault>(ALICE);
            let withdrawn = x_vault::withdraw<SUI>(&registry, &mut vault, 400_000, scenario.ctx());
            assert!(coin::value(&withdrawn) == 400_000, 0);
            assert!(x_vault::vault_balance<SUI>(&vault) == 600_000, 1);
            coin::burn_for_testing(withdrawn);
            test_scenario::return_shared(registry);
            test_scenario::return_to_address(ALICE, vault);
        };
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = x_vault::EZeroAmount)]
    fun test_withdraw_zero_amount() {
        let mut scenario = test_scenario::begin(ADMIN);
        x_vault::init_for_testing(scenario.ctx());

        scenario.next_tx(ALICE);
        let vault_addr;
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            vault_addr = x_vault::derive_vault_address(&registry, USER_ID_ALICE);
            test_scenario::return_shared(registry);
        };

        scenario.next_tx(ALICE);
        {
            let coin = coin::mint_for_testing<SUI>(100, scenario.ctx());
            transfer::public_transfer(coin, vault_addr);
        };

        scenario.next_tx(ALICE);
        {
            let mut registry = scenario.take_shared<XVaultRegistry>();
            let vault = x_vault::claim_vault_for_testing(
                &mut registry, USER_ID_ALICE, ALICE, scenario.ctx(),
            );
            x_vault::transfer_vault(vault, scenario.ctx());
            test_scenario::return_shared(registry);
        };

        scenario.next_tx(ALICE);
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            let mut vault = scenario.take_from_address<XVault>(ALICE);
            let vault_id = object::id(&vault);
            let ticket = test_scenario::most_recent_receiving_ticket<coin::Coin<SUI>>(&vault_id);
            x_vault::sweep_coin_to_vault(&registry, &mut vault, ticket);
            test_scenario::return_shared(registry);
            test_scenario::return_to_address(ALICE, vault);
        };

        scenario.next_tx(ALICE);
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            let mut vault = scenario.take_from_address<XVault>(ALICE);
            let withdrawn = x_vault::withdraw<SUI>(&registry, &mut vault, 0, scenario.ctx());
            coin::burn_for_testing(withdrawn);
            test_scenario::return_shared(registry);
            test_scenario::return_to_address(ALICE, vault);
        };

        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = x_vault::EInsufficientBalance)]
    fun test_withdraw_insufficient_balance() {
        let mut scenario = test_scenario::begin(ADMIN);
        x_vault::init_for_testing(scenario.ctx());

        scenario.next_tx(ALICE);
        let vault_addr;
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            vault_addr = x_vault::derive_vault_address(&registry, USER_ID_ALICE);
            test_scenario::return_shared(registry);
        };

        scenario.next_tx(ALICE);
        {
            let coin = coin::mint_for_testing<SUI>(100, scenario.ctx());
            transfer::public_transfer(coin, vault_addr);
        };

        scenario.next_tx(ALICE);
        {
            let mut registry = scenario.take_shared<XVaultRegistry>();
            let vault = x_vault::claim_vault_for_testing(
                &mut registry, USER_ID_ALICE, ALICE, scenario.ctx(),
            );
            x_vault::transfer_vault(vault, scenario.ctx());
            test_scenario::return_shared(registry);
        };

        scenario.next_tx(ALICE);
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            let mut vault = scenario.take_from_address<XVault>(ALICE);
            let vault_id = object::id(&vault);
            let ticket = test_scenario::most_recent_receiving_ticket<coin::Coin<SUI>>(&vault_id);
            x_vault::sweep_coin_to_vault(&registry, &mut vault, ticket);
            test_scenario::return_shared(registry);
            test_scenario::return_to_address(ALICE, vault);
        };

        scenario.next_tx(ALICE);
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            let mut vault = scenario.take_from_address<XVault>(ALICE);
            let withdrawn = x_vault::withdraw<SUI>(&registry, &mut vault, 101, scenario.ctx());
            coin::burn_for_testing(withdrawn);
            test_scenario::return_shared(registry);
            test_scenario::return_to_address(ALICE, vault);
        };

        scenario.end();
    }

    // ===== Test 6: exact-balance withdraw clears the stored field =====

    #[test]
    fun test_withdraw_exact_balance() {
        let mut scenario = test_scenario::begin(ADMIN);
        x_vault::init_for_testing(scenario.ctx());

        scenario.next_tx(ALICE);
        let vault_addr;
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            vault_addr = x_vault::derive_vault_address(&registry, USER_ID_ALICE);
            test_scenario::return_shared(registry);
        };

        scenario.next_tx(ALICE);
        {
            let coin = coin::mint_for_testing<SUI>(500_000, scenario.ctx());
            transfer::public_transfer(coin, vault_addr);
        };

        scenario.next_tx(ALICE);
        {
            let mut registry = scenario.take_shared<XVaultRegistry>();
            let vault = x_vault::claim_vault_for_testing(
                &mut registry, USER_ID_ALICE, ALICE, scenario.ctx(),
            );
            x_vault::transfer_vault(vault, scenario.ctx());
            test_scenario::return_shared(registry);
        };

        scenario.next_tx(ALICE);
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            let mut vault = scenario.take_from_address<XVault>(ALICE);
            let vault_id = object::id(&vault);
            let ticket = test_scenario::most_recent_receiving_ticket<coin::Coin<SUI>>(&vault_id);
            x_vault::sweep_coin_to_vault(&registry, &mut vault, ticket);
            test_scenario::return_shared(registry);
            test_scenario::return_to_address(ALICE, vault);
        };

        scenario.next_tx(ALICE);
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            let mut vault = scenario.take_from_address<XVault>(ALICE);
            let withdrawn = x_vault::withdraw<SUI>(&registry, &mut vault, 500_000, scenario.ctx());
            assert!(coin::value(&withdrawn) == 500_000, 0);
            assert!(x_vault::vault_balance<SUI>(&vault) == 0, 1);
            coin::burn_for_testing(withdrawn);
            test_scenario::return_shared(registry);
            test_scenario::return_to_address(ALICE, vault);
        };

        scenario.end();
    }

    // ===== Test 7: withdraw_all empties vault =====

    #[test]
    fun test_withdraw_all() {
        let mut scenario = test_scenario::begin(ADMIN);
        x_vault::init_for_testing(scenario.ctx());

        // Derive address and mint coin to it
        scenario.next_tx(ALICE);
        let vault_addr;
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            vault_addr = x_vault::derive_vault_address(&registry, USER_ID_ALICE);
            test_scenario::return_shared(registry);
        };

        scenario.next_tx(ALICE);
        {
            let coin = coin::mint_for_testing<SUI>(500_000, scenario.ctx());
            transfer::public_transfer(coin, vault_addr);
        };

        // Claim vault
        scenario.next_tx(ALICE);
        {
            let mut registry = scenario.take_shared<XVaultRegistry>();
            let vault = x_vault::claim_vault_for_testing(
                &mut registry, USER_ID_ALICE, ALICE, scenario.ctx(),
            );
            x_vault::transfer_vault(vault, scenario.ctx());
            test_scenario::return_shared(registry);
        };

        // Sweep
        scenario.next_tx(ALICE);
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            let mut vault = scenario.take_from_address<XVault>(ALICE);
            let vault_id = object::id(&vault);
            let ticket = test_scenario::most_recent_receiving_ticket<coin::Coin<SUI>>(&vault_id);
            x_vault::sweep_coin_to_vault(&registry, &mut vault, ticket);
            test_scenario::return_shared(registry);
            test_scenario::return_to_address(ALICE, vault);
        };

        // Withdraw all
        scenario.next_tx(ALICE);
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            let mut vault = scenario.take_from_address<XVault>(ALICE);
            let withdrawn = x_vault::withdraw_all<SUI>(&registry, &mut vault, scenario.ctx());
            assert!(coin::value(&withdrawn) == 500_000, 0);
            assert!(x_vault::vault_balance<SUI>(&vault) == 0, 1);
            coin::burn_for_testing(withdrawn);
            test_scenario::return_shared(registry);
            test_scenario::return_to_address(ALICE, vault);
        };
        scenario.end();
    }

    // ===== Test 8: missing-asset withdraw aborts with EBalanceNotFound =====

    #[test]
    #[expected_failure(abort_code = x_vault::EBalanceNotFound)]
    fun test_withdraw_missing_asset() {
        let mut scenario = test_scenario::begin(ADMIN);
        x_vault::init_for_testing(scenario.ctx());

        scenario.next_tx(ALICE);
        {
            let mut registry = scenario.take_shared<XVaultRegistry>();
            let vault = x_vault::claim_vault_for_testing(
                &mut registry, USER_ID_ALICE, ALICE, scenario.ctx(),
            );
            x_vault::transfer_vault(vault, scenario.ctx());
            test_scenario::return_shared(registry);
        };

        scenario.next_tx(ALICE);
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            let mut vault = scenario.take_from_address<XVault>(ALICE);
            let withdrawn = x_vault::withdraw<SUI>(&registry, &mut vault, 1, scenario.ctx());
            coin::burn_for_testing(withdrawn);
            test_scenario::return_shared(registry);
            test_scenario::return_to_address(ALICE, vault);
        };
        scenario.end();
    }

    // ===== Test 9: missing-asset withdraw_all aborts with EBalanceNotFound =====

    #[test]
    #[expected_failure(abort_code = x_vault::EBalanceNotFound)]
    fun test_withdraw_all_missing_asset() {
        let mut scenario = test_scenario::begin(ADMIN);
        x_vault::init_for_testing(scenario.ctx());

        scenario.next_tx(ALICE);
        {
            let mut registry = scenario.take_shared<XVaultRegistry>();
            let vault = x_vault::claim_vault_for_testing(
                &mut registry, USER_ID_ALICE, ALICE, scenario.ctx(),
            );
            x_vault::transfer_vault(vault, scenario.ctx());
            test_scenario::return_shared(registry);
        };

        scenario.next_tx(ALICE);
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            let mut vault = scenario.take_from_address<XVault>(ALICE);
            let withdrawn = x_vault::withdraw_all<SUI>(&registry, &mut vault, scenario.ctx());
            coin::burn_for_testing(withdrawn);
            test_scenario::return_shared(registry);
            test_scenario::return_to_address(ALICE, vault);
        };
        scenario.end();
    }

    // ===== Test 10: withdraw by non-owner aborts =====

    #[test]
    #[expected_failure(abort_code = x_vault::ENotVaultOwner)]
    fun test_withdraw_not_owner() {
        let mut scenario = test_scenario::begin(ADMIN);
        x_vault::init_for_testing(scenario.ctx());

        // Derive address and mint coin to it
        scenario.next_tx(ALICE);
        let vault_addr;
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            vault_addr = x_vault::derive_vault_address(&registry, USER_ID_ALICE);
            test_scenario::return_shared(registry);
        };

        scenario.next_tx(ALICE);
        {
            let coin = coin::mint_for_testing<SUI>(500_000, scenario.ctx());
            transfer::public_transfer(coin, vault_addr);
        };

        // Claim vault owned by ALICE
        scenario.next_tx(ALICE);
        {
            let mut registry = scenario.take_shared<XVaultRegistry>();
            let vault = x_vault::claim_vault_for_testing(
                &mut registry, USER_ID_ALICE, ALICE, scenario.ctx(),
            );
            x_vault::transfer_vault(vault, scenario.ctx());
            test_scenario::return_shared(registry);
        };

        // Sweep
        scenario.next_tx(ALICE);
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            let mut vault = scenario.take_from_address<XVault>(ALICE);
            let vault_id = object::id(&vault);
            let ticket = test_scenario::most_recent_receiving_ticket<coin::Coin<SUI>>(&vault_id);
            x_vault::sweep_coin_to_vault(&registry, &mut vault, ticket);
            test_scenario::return_shared(registry);
            test_scenario::return_to_address(ALICE, vault);
        };

        // BOB tries to withdraw — should abort with ENotVaultOwner
        scenario.next_tx(BOB);
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            let mut vault = scenario.take_from_address<XVault>(ALICE);
            let withdrawn = x_vault::withdraw<SUI>(&registry, &mut vault, 100_000, scenario.ctx());
            coin::burn_for_testing(withdrawn);
            test_scenario::return_shared(registry);
            test_scenario::return_to_address(ALICE, vault);
        };
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = x_vault::ENotVaultOwner)]
    fun test_withdraw_all_not_owner() {
        let mut scenario = test_scenario::begin(ADMIN);
        x_vault::init_for_testing(scenario.ctx());

        scenario.next_tx(ALICE);
        let vault_addr;
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            vault_addr = x_vault::derive_vault_address(&registry, USER_ID_ALICE);
            test_scenario::return_shared(registry);
        };

        scenario.next_tx(ALICE);
        {
            let coin = coin::mint_for_testing<SUI>(500_000, scenario.ctx());
            transfer::public_transfer(coin, vault_addr);
        };

        scenario.next_tx(ALICE);
        {
            let mut registry = scenario.take_shared<XVaultRegistry>();
            let vault = x_vault::claim_vault_for_testing(
                &mut registry, USER_ID_ALICE, ALICE, scenario.ctx(),
            );
            x_vault::transfer_vault(vault, scenario.ctx());
            test_scenario::return_shared(registry);
        };

        scenario.next_tx(ALICE);
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            let mut vault = scenario.take_from_address<XVault>(ALICE);
            let vault_id = object::id(&vault);
            let ticket = test_scenario::most_recent_receiving_ticket<coin::Coin<SUI>>(&vault_id);
            x_vault::sweep_coin_to_vault(&registry, &mut vault, ticket);
            test_scenario::return_shared(registry);
            test_scenario::return_to_address(ALICE, vault);
        };

        scenario.next_tx(BOB);
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            let mut vault = scenario.take_from_address<XVault>(ALICE);
            let withdrawn = x_vault::withdraw_all<SUI>(&registry, &mut vault, scenario.ctx());
            coin::burn_for_testing(withdrawn);
            test_scenario::return_shared(registry);
            test_scenario::return_to_address(ALICE, vault);
        };
        scenario.end();
    }

    // ===== Test 11: multi-asset sweep and withdraw =====

    #[test]
    fun test_multi_asset_sweep_and_withdraw() {
        let mut scenario = test_scenario::begin(ADMIN);
        x_vault::init_for_testing(scenario.ctx());

        // Derive vault address
        scenario.next_tx(ALICE);
        let vault_addr;
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            vault_addr = x_vault::derive_vault_address(&registry, USER_ID_ALICE);
            test_scenario::return_shared(registry);
        };

        // Send SUI and TEST_USDC to the vault address
        scenario.next_tx(ALICE);
        {
            let sui_coin = coin::mint_for_testing<SUI>(1_000_000, scenario.ctx());
            transfer::public_transfer(sui_coin, vault_addr);
        };
        scenario.next_tx(ALICE);
        {
            let usdc_coin = coin::mint_for_testing<TEST_USDC>(5_000_000, scenario.ctx());
            transfer::public_transfer(usdc_coin, vault_addr);
        };

        // Claim vault
        scenario.next_tx(ALICE);
        {
            let mut registry = scenario.take_shared<XVaultRegistry>();
            let vault = x_vault::claim_vault_for_testing(
                &mut registry, USER_ID_ALICE, ALICE, scenario.ctx(),
            );
            x_vault::transfer_vault(vault, scenario.ctx());
            test_scenario::return_shared(registry);
        };

        // Sweep SUI
        scenario.next_tx(ALICE);
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            let mut vault = scenario.take_from_address<XVault>(ALICE);
            let vault_id = object::id(&vault);
            let ticket = test_scenario::most_recent_receiving_ticket<coin::Coin<SUI>>(&vault_id);
            x_vault::sweep_coin_to_vault(&registry, &mut vault, ticket);
            assert!(x_vault::vault_balance<SUI>(&vault) == 1_000_000, 0);
            test_scenario::return_shared(registry);
            test_scenario::return_to_address(ALICE, vault);
        };

        // Sweep TEST_USDC
        scenario.next_tx(ALICE);
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            let mut vault = scenario.take_from_address<XVault>(ALICE);
            let vault_id = object::id(&vault);
            let ticket = test_scenario::most_recent_receiving_ticket<coin::Coin<TEST_USDC>>(&vault_id);
            x_vault::sweep_coin_to_vault(&registry, &mut vault, ticket);
            assert!(x_vault::vault_balance<TEST_USDC>(&vault) == 5_000_000, 1);
            // SUI balance should still be intact
            assert!(x_vault::vault_balance<SUI>(&vault) == 1_000_000, 2);
            test_scenario::return_shared(registry);
            test_scenario::return_to_address(ALICE, vault);
        };

        // Withdraw partial SUI and all TEST_USDC
        scenario.next_tx(ALICE);
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            let mut vault = scenario.take_from_address<XVault>(ALICE);
            let sui_withdrawn = x_vault::withdraw<SUI>(&registry, &mut vault, 300_000, scenario.ctx());
            assert!(coin::value(&sui_withdrawn) == 300_000, 3);
            assert!(x_vault::vault_balance<SUI>(&vault) == 700_000, 4);

            let usdc_withdrawn = x_vault::withdraw_all<TEST_USDC>(&registry, &mut vault, scenario.ctx());
            assert!(coin::value(&usdc_withdrawn) == 5_000_000, 5);
            assert!(x_vault::vault_balance<TEST_USDC>(&vault) == 0, 6);

            coin::burn_for_testing(sui_withdrawn);
            coin::burn_for_testing(usdc_withdrawn);
            test_scenario::return_shared(registry);
            test_scenario::return_to_address(ALICE, vault);
        };
        scenario.end();
    }

    #[test]
    fun test_sweep_zero_coin_is_destroyed() {
        let mut scenario = test_scenario::begin(ADMIN);
        x_vault::init_for_testing(scenario.ctx());

        scenario.next_tx(ALICE);
        let vault_addr;
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            vault_addr = x_vault::derive_vault_address(&registry, USER_ID_ALICE);
            test_scenario::return_shared(registry);
        };

        scenario.next_tx(ALICE);
        {
            let coin = coin::zero<SUI>(scenario.ctx());
            transfer::public_transfer(coin, vault_addr);
        };

        scenario.next_tx(ALICE);
        {
            let mut registry = scenario.take_shared<XVaultRegistry>();
            let vault = x_vault::claim_vault_for_testing(
                &mut registry, USER_ID_ALICE, ALICE, scenario.ctx(),
            );
            x_vault::transfer_vault(vault, scenario.ctx());
            test_scenario::return_shared(registry);
        };

        scenario.next_tx(ALICE);
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            let mut vault = scenario.take_from_address<XVault>(ALICE);
            let vault_id = object::id(&vault);
            let ticket = test_scenario::most_recent_receiving_ticket<coin::Coin<SUI>>(&vault_id);
            x_vault::sweep_coin_to_vault(&registry, &mut vault, ticket);
            assert!(x_vault::vault_balance<SUI>(&vault) == 0, 0);
            test_scenario::return_shared(registry);
            test_scenario::return_to_address(ALICE, vault);
        };

        scenario.next_tx(ALICE);
        {
            let coin = coin::mint_for_testing<SUI>(250, scenario.ctx());
            transfer::public_transfer(coin, vault_addr);
        };

        scenario.next_tx(ALICE);
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            let mut vault = scenario.take_from_address<XVault>(ALICE);
            let vault_id = object::id(&vault);
            let ticket = test_scenario::most_recent_receiving_ticket<coin::Coin<SUI>>(&vault_id);
            x_vault::sweep_coin_to_vault(&registry, &mut vault, ticket);
            assert!(x_vault::vault_balance<SUI>(&vault) == 250, 1);
            test_scenario::return_shared(registry);
            test_scenario::return_to_address(ALICE, vault);
        };

        scenario.end();
    }

    // ===== Test 12: rescue_object recovers non-coin object =====

    #[test]
    fun test_rescue_object() {
        let mut scenario = test_scenario::begin(ADMIN);
        x_vault::init_for_testing(scenario.ctx());

        // Derive vault address
        scenario.next_tx(ALICE);
        let vault_addr;
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            vault_addr = x_vault::derive_vault_address(&registry, USER_ID_ALICE);
            test_scenario::return_shared(registry);
        };

        // Send a TestNFT to the vault's derived address
        scenario.next_tx(ALICE);
        {
            let nft = TestNFT { id: object::new(scenario.ctx()), value: 42 };
            transfer::public_transfer(nft, vault_addr);
        };

        // Claim vault
        scenario.next_tx(ALICE);
        {
            let mut registry = scenario.take_shared<XVaultRegistry>();
            let vault = x_vault::claim_vault_for_testing(
                &mut registry, USER_ID_ALICE, ALICE, scenario.ctx(),
            );
            x_vault::transfer_vault(vault, scenario.ctx());
            test_scenario::return_shared(registry);
        };

        // Rescue the NFT — owner should succeed
        scenario.next_tx(ALICE);
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            let mut vault = scenario.take_from_address<XVault>(ALICE);
            let vault_id = object::id(&vault);
            let ticket = test_scenario::most_recent_receiving_ticket<TestNFT>(&vault_id);
            let nft = x_vault::rescue_object(&registry, &mut vault, ticket, scenario.ctx());
            assert!(nft.value == 42, 0);
            let TestNFT { id, value: _ } = nft;
            object::delete(id);
            test_scenario::return_shared(registry);
            test_scenario::return_to_address(ALICE, vault);
        };

        scenario.end();
    }

    #[test, allow(deprecated_usage)]
    fun test_rescue_coin_metadata() {
        let mut scenario = test_scenario::begin(ADMIN);
        x_vault::init_for_testing(scenario.ctx());

        scenario.next_tx(ALICE);
        let vault_addr;
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            vault_addr = x_vault::derive_vault_address(&registry, USER_ID_ALICE);
            test_scenario::return_shared(registry);
        };

        scenario.next_tx(ALICE);
        {
            let (treasury, metadata) = coin::create_currency(
                X_VAULT_TESTS {},
                6,
                b"RCUE",
                b"Rescue Coin",
                b"Rescue metadata test",
                option::none(),
                scenario.ctx(),
            );
            transfer::public_transfer(treasury, ALICE);
            transfer::public_transfer(metadata, vault_addr);
        };

        scenario.next_tx(ALICE);
        {
            let mut registry = scenario.take_shared<XVaultRegistry>();
            let vault = x_vault::claim_vault_for_testing(
                &mut registry, USER_ID_ALICE, ALICE, scenario.ctx(),
            );
            x_vault::transfer_vault(vault, scenario.ctx());
            test_scenario::return_shared(registry);
        };

        scenario.next_tx(ALICE);
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            let mut vault = scenario.take_from_address<XVault>(ALICE);
            let vault_id = object::id(&vault);
            let ticket =
                test_scenario::most_recent_receiving_ticket<coin::CoinMetadata<X_VAULT_TESTS>>(
                    &vault_id,
                );
            let metadata = x_vault::rescue_object(&registry, &mut vault, ticket, scenario.ctx());
            transfer::public_freeze_object(metadata);
            test_scenario::return_shared(registry);
            test_scenario::return_to_address(ALICE, vault);
        };

        scenario.end();
    }

    // ===== Test 13: rescue_object by non-owner aborts =====

    #[test]
    #[expected_failure(abort_code = x_vault::ENotVaultOwner)]
    fun test_rescue_object_not_owner() {
        let mut scenario = test_scenario::begin(ADMIN);
        x_vault::init_for_testing(scenario.ctx());

        // Derive vault address
        scenario.next_tx(ALICE);
        let vault_addr;
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            vault_addr = x_vault::derive_vault_address(&registry, USER_ID_ALICE);
            test_scenario::return_shared(registry);
        };

        // Send a TestNFT to the vault's derived address
        scenario.next_tx(ALICE);
        {
            let nft = TestNFT { id: object::new(scenario.ctx()), value: 99 };
            transfer::public_transfer(nft, vault_addr);
        };

        // Claim vault (owned by ALICE)
        scenario.next_tx(ALICE);
        {
            let mut registry = scenario.take_shared<XVaultRegistry>();
            let vault = x_vault::claim_vault_for_testing(
                &mut registry, USER_ID_ALICE, ALICE, scenario.ctx(),
            );
            x_vault::transfer_vault(vault, scenario.ctx());
            test_scenario::return_shared(registry);
        };

        // BOB tries to rescue — should abort with ENotVaultOwner
        scenario.next_tx(BOB);
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            let mut vault = scenario.take_from_address<XVault>(ALICE);
            let vault_id = object::id(&vault);
            let ticket = test_scenario::most_recent_receiving_ticket<TestNFT>(&vault_id);
            let nft = x_vault::rescue_object(&registry, &mut vault, ticket, scenario.ctx());
            let TestNFT { id, value: _ } = nft;
            object::delete(id);
            test_scenario::return_shared(registry);
            test_scenario::return_to_address(ALICE, vault);
        };

        scenario.end();
    }

    // ===== Test 14: rescue_object rejects Coin types =====

    #[test]
    #[expected_failure(abort_code = x_vault::ECoinMustUseSweep)]
    fun test_rescue_object_rejects_coin() {
        let mut scenario = test_scenario::begin(ADMIN);
        x_vault::init_for_testing(scenario.ctx());

        // Derive vault address
        scenario.next_tx(ALICE);
        let vault_addr;
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            vault_addr = x_vault::derive_vault_address(&registry, USER_ID_ALICE);
            test_scenario::return_shared(registry);
        };

        // Send a Coin<SUI> to the vault's derived address
        scenario.next_tx(ALICE);
        {
            let coin = coin::mint_for_testing<SUI>(1_000_000, scenario.ctx());
            transfer::public_transfer(coin, vault_addr);
        };

        // Claim vault
        scenario.next_tx(ALICE);
        {
            let mut registry = scenario.take_shared<XVaultRegistry>();
            let vault = x_vault::claim_vault_for_testing(
                &mut registry, USER_ID_ALICE, ALICE, scenario.ctx(),
            );
            x_vault::transfer_vault(vault, scenario.ctx());
            test_scenario::return_shared(registry);
        };

        // Owner tries to rescue a Coin — should abort with ECoinMustUseSweep
        scenario.next_tx(ALICE);
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            let mut vault = scenario.take_from_address<XVault>(ALICE);
            let vault_id = object::id(&vault);
            let ticket = test_scenario::most_recent_receiving_ticket<coin::Coin<SUI>>(&vault_id);
            let coin = x_vault::rescue_object(&registry, &mut vault, ticket, scenario.ctx());
            coin::burn_for_testing(coin);
            test_scenario::return_shared(registry);
            test_scenario::return_to_address(ALICE, vault);
        };

        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = x_vault::EPaused)]
    fun test_pause_blocks_rescue_object() {
        let mut scenario = test_scenario::begin(ADMIN);
        x_vault::init_for_testing(scenario.ctx());

        scenario.next_tx(ALICE);
        let vault_addr;
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            vault_addr = x_vault::derive_vault_address(&registry, USER_ID_ALICE);
            test_scenario::return_shared(registry);
        };

        scenario.next_tx(ALICE);
        {
            let nft = TestNFT { id: object::new(scenario.ctx()), value: 7 };
            transfer::public_transfer(nft, vault_addr);
        };

        scenario.next_tx(ALICE);
        {
            let mut registry = scenario.take_shared<XVaultRegistry>();
            let vault = x_vault::claim_vault_for_testing(
                &mut registry, USER_ID_ALICE, ALICE, scenario.ctx(),
            );
            x_vault::transfer_vault(vault, scenario.ctx());
            test_scenario::return_shared(registry);
        };

        scenario.next_tx(ADMIN);
        {
            let mut registry = scenario.take_shared<XVaultRegistry>();
            x_vault::pause(&mut registry, scenario.ctx());
            test_scenario::return_shared(registry);
        };

        scenario.next_tx(ALICE);
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            let mut vault = scenario.take_from_address<XVault>(ALICE);
            let vault_id = object::id(&vault);
            let ticket = test_scenario::most_recent_receiving_ticket<TestNFT>(&vault_id);
            let nft = x_vault::rescue_object(&registry, &mut vault, ticket, scenario.ctx());
            let TestNFT { id, value: _ } = nft;
            object::delete(id);
            test_scenario::return_shared(registry);
            test_scenario::return_to_address(ALICE, vault);
        };

        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = x_vault::EPaused)]
    fun test_pause_blocks_sweep() {
        let mut scenario = test_scenario::begin(ADMIN);
        x_vault::init_for_testing(scenario.ctx());

        scenario.next_tx(ALICE);
        let vault_addr;
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            vault_addr = x_vault::derive_vault_address(&registry, USER_ID_ALICE);
            test_scenario::return_shared(registry);
        };

        scenario.next_tx(ALICE);
        {
            let coin = coin::mint_for_testing<SUI>(100, scenario.ctx());
            transfer::public_transfer(coin, vault_addr);
        };

        scenario.next_tx(ALICE);
        {
            let mut registry = scenario.take_shared<XVaultRegistry>();
            let vault = x_vault::claim_vault_for_testing(
                &mut registry, USER_ID_ALICE, ALICE, scenario.ctx(),
            );
            x_vault::transfer_vault(vault, scenario.ctx());
            test_scenario::return_shared(registry);
        };

        scenario.next_tx(ADMIN);
        {
            let mut registry = scenario.take_shared<XVaultRegistry>();
            x_vault::pause(&mut registry, scenario.ctx());
            test_scenario::return_shared(registry);
        };

        scenario.next_tx(ALICE);
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            let mut vault = scenario.take_from_address<XVault>(ALICE);
            let vault_id = object::id(&vault);
            let ticket = test_scenario::most_recent_receiving_ticket<coin::Coin<SUI>>(&vault_id);
            x_vault::sweep_coin_to_vault(&registry, &mut vault, ticket);
            test_scenario::return_shared(registry);
            test_scenario::return_to_address(ALICE, vault);
        };

        scenario.end();
    }

    #[test]
    fun test_pause_allows_withdraw() {
        let mut scenario = test_scenario::begin(ADMIN);
        x_vault::init_for_testing(scenario.ctx());

        scenario.next_tx(ALICE);
        let vault_addr;
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            vault_addr = x_vault::derive_vault_address(&registry, USER_ID_ALICE);
            test_scenario::return_shared(registry);
        };

        scenario.next_tx(ALICE);
        {
            let coin = coin::mint_for_testing<SUI>(500, scenario.ctx());
            transfer::public_transfer(coin, vault_addr);
        };

        scenario.next_tx(ALICE);
        {
            let mut registry = scenario.take_shared<XVaultRegistry>();
            let vault = x_vault::claim_vault_for_testing(
                &mut registry, USER_ID_ALICE, ALICE, scenario.ctx(),
            );
            x_vault::transfer_vault(vault, scenario.ctx());
            test_scenario::return_shared(registry);
        };

        scenario.next_tx(ALICE);
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            let mut vault = scenario.take_from_address<XVault>(ALICE);
            let vault_id = object::id(&vault);
            let ticket = test_scenario::most_recent_receiving_ticket<coin::Coin<SUI>>(&vault_id);
            x_vault::sweep_coin_to_vault(&registry, &mut vault, ticket);
            test_scenario::return_shared(registry);
            test_scenario::return_to_address(ALICE, vault);
        };

        scenario.next_tx(ADMIN);
        {
            let mut registry = scenario.take_shared<XVaultRegistry>();
            x_vault::pause(&mut registry, scenario.ctx());
            test_scenario::return_shared(registry);
        };

        scenario.next_tx(ALICE);
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            let mut vault = scenario.take_from_address<XVault>(ALICE);
            let withdrawn = x_vault::withdraw<SUI>(&registry, &mut vault, 1, scenario.ctx());
            assert!(coin::value(&withdrawn) == 1, 0);
            assert!(x_vault::vault_balance<SUI>(&vault) == 499, 1);
            coin::burn_for_testing(withdrawn);
            test_scenario::return_shared(registry);
            test_scenario::return_to_address(ALICE, vault);
        };

        scenario.end();
    }

    #[test]
    fun test_pause_allows_withdraw_all() {
        let mut scenario = test_scenario::begin(ADMIN);
        x_vault::init_for_testing(scenario.ctx());

        scenario.next_tx(ALICE);
        let vault_addr;
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            vault_addr = x_vault::derive_vault_address(&registry, USER_ID_ALICE);
            test_scenario::return_shared(registry);
        };

        scenario.next_tx(ALICE);
        {
            let coin = coin::mint_for_testing<SUI>(500, scenario.ctx());
            transfer::public_transfer(coin, vault_addr);
        };

        scenario.next_tx(ALICE);
        {
            let mut registry = scenario.take_shared<XVaultRegistry>();
            let vault = x_vault::claim_vault_for_testing(
                &mut registry, USER_ID_ALICE, ALICE, scenario.ctx(),
            );
            x_vault::transfer_vault(vault, scenario.ctx());
            test_scenario::return_shared(registry);
        };

        scenario.next_tx(ALICE);
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            let mut vault = scenario.take_from_address<XVault>(ALICE);
            let vault_id = object::id(&vault);
            let ticket = test_scenario::most_recent_receiving_ticket<coin::Coin<SUI>>(&vault_id);
            x_vault::sweep_coin_to_vault(&registry, &mut vault, ticket);
            test_scenario::return_shared(registry);
            test_scenario::return_to_address(ALICE, vault);
        };

        scenario.next_tx(ADMIN);
        {
            let mut registry = scenario.take_shared<XVaultRegistry>();
            x_vault::pause(&mut registry, scenario.ctx());
            test_scenario::return_shared(registry);
        };

        scenario.next_tx(ALICE);
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            let mut vault = scenario.take_from_address<XVault>(ALICE);
            let withdrawn = x_vault::withdraw_all<SUI>(&registry, &mut vault, scenario.ctx());
            assert!(coin::value(&withdrawn) == 500, 0);
            assert!(x_vault::vault_balance<SUI>(&vault) == 0, 1);
            coin::burn_for_testing(withdrawn);
            test_scenario::return_shared(registry);
            test_scenario::return_to_address(ALICE, vault);
        };

        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = x_vault::EAlreadyPaused)]
    fun test_pause_rejected_when_already_paused() {
        let mut scenario = test_scenario::begin(ADMIN);
        x_vault::init_for_testing(scenario.ctx());

        scenario.next_tx(ADMIN);
        {
            let mut registry = scenario.take_shared<XVaultRegistry>();
            x_vault::pause(&mut registry, scenario.ctx());
            x_vault::pause(&mut registry, scenario.ctx());
            test_scenario::return_shared(registry);
        };

        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = x_vault::ENotPaused)]
    fun test_unpause_rejected_when_not_paused() {
        let mut scenario = test_scenario::begin(ADMIN);
        x_vault::init_for_testing(scenario.ctx());

        scenario.next_tx(ADMIN);
        {
            let mut registry = scenario.take_shared<XVaultRegistry>();
            x_vault::unpause(&mut registry, scenario.ctx());
            test_scenario::return_shared(registry);
        };

        scenario.end();
    }
}
