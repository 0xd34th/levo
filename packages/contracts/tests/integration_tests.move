#[test_only]
module levo::integration_tests {
    use sui::test_scenario;
    use sui::coin;
    use sui::derived_object;
    use sui::sui::SUI;
    use sui::clock;
    use levo::x_vault::{Self, XVaultRegistry, XVault};
    use levo::nautilus_verifier::{Self, EnclaveRegistry};
    use levo::test_vectors;

    // Real Ed25519 test vectors generated with:
    //   npm run generate:test-vectors -- 0x34401905bebdf8c04f3cd5f04f442a39372c8dc321c29edfb4f9cb30b23ab96
    // Signature covers BCS(x_user_id, sui_address, nonce, expires_at, registry_id)

    const ADMIN: address = @0xAD;

    // ===== Test 1: Full flow — send, claim, sweep, withdraw =====

    #[test]
    fun test_full_flow_send_claim_sweep_withdraw() {
        let owner = @0xA11CE;
        let x_user_id: u64 = 5001;

        let mut scenario = test_scenario::begin(ADMIN);

        // Init both modules (nautilus first so EnclaveRegistry gets the same
        // deterministic ID as in verifier-only tests)
        nautilus_verifier::init_for_testing(scenario.ctx());
        x_vault::init_for_testing(scenario.ctx());

        // Derive vault address
        scenario.next_tx(owner);
        let vault_addr;
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            vault_addr = x_vault::derive_vault_address(&registry, x_user_id);
            test_scenario::return_shared(registry);
        };

        // Send coin1 to derived address
        scenario.next_tx(owner);
        {
            let coin1 = coin::mint_for_testing<SUI>(300_000, scenario.ctx());
            transfer::public_transfer(coin1, vault_addr);
        };

        // Record coin1 ID, then send coin2
        scenario.next_tx(owner);
        let coin1_id;
        {
            let ids = test_scenario::ids_for_address<coin::Coin<SUI>>(vault_addr);
            coin1_id = ids[0];
            let coin2 = coin::mint_for_testing<SUI>(700_000, scenario.ctx());
            transfer::public_transfer(coin2, vault_addr);
        };

        // Record coin2 ID
        scenario.next_tx(owner);
        let coin2_id;
        {
            let ids = test_scenario::ids_for_address<coin::Coin<SUI>>(vault_addr);
            // One of ids is coin1_id, the other is coin2_id
            coin2_id = if (ids[0] == coin1_id) { ids[1] } else { ids[0] };
        };

        // Claim vault (test-only, no attestation)
        scenario.next_tx(owner);
        {
            let mut registry = scenario.take_shared<XVaultRegistry>();
            let vault = x_vault::claim_vault_for_testing(
                &mut registry, x_user_id, owner, scenario.ctx(),
            );
            x_vault::transfer_vault(vault, scenario.ctx());
            test_scenario::return_shared(registry);
        };

        // Sweep coin1
        scenario.next_tx(owner);
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            let mut vault = scenario.take_from_address<XVault>(owner);
            let ticket = test_scenario::receiving_ticket_by_id<coin::Coin<SUI>>(coin1_id);
            x_vault::sweep_coin_to_vault(&registry, &mut vault, ticket);
            test_scenario::return_shared(registry);
            test_scenario::return_to_address(owner, vault);
        };

        // Sweep coin2
        scenario.next_tx(owner);
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            let mut vault = scenario.take_from_address<XVault>(owner);
            let ticket = test_scenario::receiving_ticket_by_id<coin::Coin<SUI>>(coin2_id);
            x_vault::sweep_coin_to_vault(&registry, &mut vault, ticket);

            // Verify total balance = 300_000 + 700_000
            assert!(x_vault::vault_balance<SUI>(&vault) == 1_000_000, 0);
            test_scenario::return_shared(registry);
            test_scenario::return_to_address(owner, vault);
        };

        // Withdraw partial (400_000), verify remaining (600_000)
        scenario.next_tx(owner);
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            let mut vault = scenario.take_from_address<XVault>(owner);
            let withdrawn = x_vault::withdraw<SUI>(&registry, &mut vault, 400_000, scenario.ctx());
            assert!(coin::value(&withdrawn) == 400_000, 1);
            assert!(x_vault::vault_balance<SUI>(&vault) == 600_000, 2);
            coin::burn_for_testing(withdrawn);
            test_scenario::return_shared(registry);
            test_scenario::return_to_address(owner, vault);
        };

        // Withdraw all remaining
        scenario.next_tx(owner);
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            let mut vault = scenario.take_from_address<XVault>(owner);
            let withdrawn = x_vault::withdraw_all<SUI>(&registry, &mut vault, scenario.ctx());
            assert!(coin::value(&withdrawn) == 600_000, 3);
            assert!(x_vault::vault_balance<SUI>(&vault) == 0, 4);
            coin::burn_for_testing(withdrawn);
            test_scenario::return_shared(registry);
            test_scenario::return_to_address(owner, vault);
        };

        scenario.end();
    }

    // ===== Test 2: Claim with real attestation =====

    #[test]
    fun test_claim_with_attestation() {
        let mut scenario = test_scenario::begin(ADMIN);

        // Init both modules (nautilus first so EnclaveRegistry gets the same
        // deterministic ID as in verifier-only tests)
        nautilus_verifier::init_for_testing(scenario.ctx());
        x_vault::init_for_testing(scenario.ctx());

        // Register enclave pubkey (as admin)
        scenario.next_tx(ADMIN);
        {
            let mut enclave_registry = scenario.take_shared<EnclaveRegistry>();
            nautilus_verifier::register_pubkey(&mut enclave_registry, test_vectors::pubkey(), scenario.ctx());
            test_scenario::return_shared(enclave_registry);
        };

        // As the fixture Sui address, call real claim_vault with the shared test signature
        scenario.next_tx(test_vectors::sui_address());
        {
            let mut registry = scenario.take_shared<XVaultRegistry>();
            let enclave_registry = scenario.take_shared<EnclaveRegistry>();

            let mut test_clock = clock::create_for_testing(scenario.ctx());
            clock::set_for_testing(&mut test_clock, 1_000_000);

            let vault = x_vault::claim_vault(
                &mut registry,
                &enclave_registry,
                test_vectors::x_user_id(),
                test_vectors::sui_address(),
                test_vectors::nonce(),
                test_vectors::expires_at(),
                test_vectors::signature(),
                &test_clock,
                scenario.ctx(),
            );

            // Verify vault owner
            assert!(x_vault::vault_owner(&vault) == test_vectors::sui_address(), 0);
            assert!(x_vault::vault_x_user_id(&vault) == test_vectors::x_user_id(), 1);

            x_vault::transfer_vault(vault, scenario.ctx());
            clock::destroy_for_testing(test_clock);
            test_scenario::return_shared(enclave_registry);
            test_scenario::return_shared(registry);
        };

        scenario.end();
    }

    // ===== Test 3: Wrong sender is rejected =====

    #[test]
    #[expected_failure(abort_code = x_vault::ENotAuthorized)]
    fun test_claim_wrong_sender() {
        let attacker = @0xBAD;
        let mut scenario = test_scenario::begin(ADMIN);

        // Init both modules (nautilus first so EnclaveRegistry gets the same
        // deterministic ID as in verifier-only tests)
        nautilus_verifier::init_for_testing(scenario.ctx());
        x_vault::init_for_testing(scenario.ctx());

        // Register enclave pubkey
        scenario.next_tx(ADMIN);
        {
            let mut enclave_registry = scenario.take_shared<EnclaveRegistry>();
            nautilus_verifier::register_pubkey(&mut enclave_registry, test_vectors::pubkey(), scenario.ctx());
            test_scenario::return_shared(enclave_registry);
        };

        // Attacker (@0xBAD) tries to claim with attestation meant for the fixture Sui address
        scenario.next_tx(attacker);
        {
            let mut registry = scenario.take_shared<XVaultRegistry>();
            let enclave_registry = scenario.take_shared<EnclaveRegistry>();

            let mut test_clock = clock::create_for_testing(scenario.ctx());
            clock::set_for_testing(&mut test_clock, 1_000_000);

            // Should abort with ENotAuthorized because sender != the attested Sui address
            let vault = x_vault::claim_vault(
                &mut registry,
                &enclave_registry,
                test_vectors::x_user_id(),
                test_vectors::sui_address(),
                test_vectors::nonce(),
                test_vectors::expires_at(),
                test_vectors::signature(),
                &test_clock,
                scenario.ctx(),
            );

            x_vault::transfer_vault(vault, scenario.ctx());
            clock::destroy_for_testing(test_clock);
            test_scenario::return_shared(enclave_registry);
            test_scenario::return_shared(registry);
        };

        scenario.end();
    }

    #[test]
    fun test_update_owner_transfers_vault_with_attested_handoff() {
        let mut scenario = test_scenario::begin(ADMIN);

        nautilus_verifier::init_for_testing(scenario.ctx());
        x_vault::init_for_testing(scenario.ctx());

        scenario.next_tx(ADMIN);
        {
            let mut enclave_registry = scenario.take_shared<EnclaveRegistry>();
            nautilus_verifier::register_pubkey(&mut enclave_registry, test_vectors::pubkey(), scenario.ctx());
            test_scenario::return_shared(enclave_registry);
        };

        scenario.next_tx(test_vectors::sui_address());
        {
            let mut registry = scenario.take_shared<XVaultRegistry>();
            let enclave_registry = scenario.take_shared<EnclaveRegistry>();

            let mut test_clock = clock::create_for_testing(scenario.ctx());
            clock::set_for_testing(&mut test_clock, 1_000_000);

            let vault = x_vault::claim_vault(
                &mut registry,
                &enclave_registry,
                test_vectors::x_user_id(),
                test_vectors::sui_address(),
                test_vectors::nonce(),
                test_vectors::expires_at(),
                test_vectors::signature(),
                &test_clock,
                scenario.ctx(),
            );

            x_vault::transfer_vault(vault, scenario.ctx());
            clock::destroy_for_testing(test_clock);
            test_scenario::return_shared(enclave_registry);
            test_scenario::return_shared(registry);
        };

        scenario.next_tx(test_vectors::sui_address());
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            let enclave_registry = scenario.take_shared<EnclaveRegistry>();
            let vault = scenario.take_from_address<XVault>(test_vectors::sui_address());

            let mut test_clock = clock::create_for_testing(scenario.ctx());
            clock::set_for_testing(&mut test_clock, 1_000_000);

            x_vault::update_owner(
                &registry,
                &enclave_registry,
                vault,
                test_vectors::new_owner(),
                test_vectors::expires_at(),
                test_vectors::recovery_signature(),
                &test_clock,
                scenario.ctx(),
            );

            clock::destroy_for_testing(test_clock);
            test_scenario::return_shared(enclave_registry);
            test_scenario::return_shared(registry);
        };

        scenario.next_tx(test_vectors::new_owner());
        {
            let vault = scenario.take_from_address<XVault>(test_vectors::new_owner());
            assert!(x_vault::vault_owner(&vault) == test_vectors::new_owner(), 0);
            assert!(x_vault::vault_recovery_counter(&vault) == 1, 1);
            test_scenario::return_to_address(test_vectors::new_owner(), vault);
        };

        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = x_vault::EOwnerUnchanged)]
    fun test_update_owner_rejects_same_owner() {
        let mut scenario = test_scenario::begin(ADMIN);

        nautilus_verifier::init_for_testing(scenario.ctx());
        x_vault::init_for_testing(scenario.ctx());

        scenario.next_tx(ADMIN);
        {
            let mut enclave_registry = scenario.take_shared<EnclaveRegistry>();
            nautilus_verifier::register_pubkey(&mut enclave_registry, test_vectors::pubkey(), scenario.ctx());
            test_scenario::return_shared(enclave_registry);
        };

        scenario.next_tx(test_vectors::sui_address());
        {
            let mut registry = scenario.take_shared<XVaultRegistry>();
            let enclave_registry = scenario.take_shared<EnclaveRegistry>();

            let mut test_clock = clock::create_for_testing(scenario.ctx());
            clock::set_for_testing(&mut test_clock, 1_000_000);

            let vault = x_vault::claim_vault(
                &mut registry,
                &enclave_registry,
                test_vectors::x_user_id(),
                test_vectors::sui_address(),
                test_vectors::nonce(),
                test_vectors::expires_at(),
                test_vectors::signature(),
                &test_clock,
                scenario.ctx(),
            );

            x_vault::transfer_vault(vault, scenario.ctx());
            clock::destroy_for_testing(test_clock);
            test_scenario::return_shared(enclave_registry);
            test_scenario::return_shared(registry);
        };

        scenario.next_tx(test_vectors::sui_address());
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            let enclave_registry = scenario.take_shared<EnclaveRegistry>();
            let vault = scenario.take_from_address<XVault>(test_vectors::sui_address());

            let mut test_clock = clock::create_for_testing(scenario.ctx());
            clock::set_for_testing(&mut test_clock, 1_000_000);

            x_vault::update_owner(
                &registry,
                &enclave_registry,
                vault,
                test_vectors::sui_address(),
                test_vectors::expires_at(),
                test_vectors::recovery_signature(),
                &test_clock,
                scenario.ctx(),
            );

            clock::destroy_for_testing(test_clock);
            test_scenario::return_shared(enclave_registry);
            test_scenario::return_shared(registry);
        };

        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = x_vault::ENotVaultOwner)]
    fun test_update_owner_not_owner() {
        let attacker = @0xBAD;
        let mut scenario = test_scenario::begin(ADMIN);

        nautilus_verifier::init_for_testing(scenario.ctx());
        x_vault::init_for_testing(scenario.ctx());

        scenario.next_tx(ADMIN);
        {
            let mut enclave_registry = scenario.take_shared<EnclaveRegistry>();
            nautilus_verifier::register_pubkey(&mut enclave_registry, test_vectors::pubkey(), scenario.ctx());
            test_scenario::return_shared(enclave_registry);
        };

        scenario.next_tx(test_vectors::sui_address());
        {
            let mut registry = scenario.take_shared<XVaultRegistry>();
            let enclave_registry = scenario.take_shared<EnclaveRegistry>();

            let mut test_clock = clock::create_for_testing(scenario.ctx());
            clock::set_for_testing(&mut test_clock, 1_000_000);

            let vault = x_vault::claim_vault(
                &mut registry,
                &enclave_registry,
                test_vectors::x_user_id(),
                test_vectors::sui_address(),
                test_vectors::nonce(),
                test_vectors::expires_at(),
                test_vectors::signature(),
                &test_clock,
                scenario.ctx(),
            );

            x_vault::transfer_vault(vault, scenario.ctx());
            clock::destroy_for_testing(test_clock);
            test_scenario::return_shared(enclave_registry);
            test_scenario::return_shared(registry);
        };

        scenario.next_tx(attacker);
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            let enclave_registry = scenario.take_shared<EnclaveRegistry>();
            let vault = scenario.take_from_address<XVault>(test_vectors::sui_address());

            let mut test_clock = clock::create_for_testing(scenario.ctx());
            clock::set_for_testing(&mut test_clock, 1_000_000);

            x_vault::update_owner(
                &registry,
                &enclave_registry,
                vault,
                test_vectors::new_owner(),
                test_vectors::expires_at(),
                test_vectors::recovery_signature(),
                &test_clock,
                scenario.ctx(),
            );

            clock::destroy_for_testing(test_clock);
            test_scenario::return_shared(enclave_registry);
            test_scenario::return_shared(registry);
        };

        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = nautilus_verifier::EInvalidSignature)]
    fun test_update_owner_replay_rejected_after_handoff() {
        let mut scenario = test_scenario::begin(ADMIN);

        nautilus_verifier::init_for_testing(scenario.ctx());
        x_vault::init_for_testing(scenario.ctx());

        scenario.next_tx(ADMIN);
        {
            let mut enclave_registry = scenario.take_shared<EnclaveRegistry>();
            nautilus_verifier::register_pubkey(&mut enclave_registry, test_vectors::pubkey(), scenario.ctx());
            test_scenario::return_shared(enclave_registry);
        };

        scenario.next_tx(test_vectors::sui_address());
        {
            let mut registry = scenario.take_shared<XVaultRegistry>();
            let enclave_registry = scenario.take_shared<EnclaveRegistry>();

            let mut test_clock = clock::create_for_testing(scenario.ctx());
            clock::set_for_testing(&mut test_clock, 1_000_000);

            let vault = x_vault::claim_vault(
                &mut registry,
                &enclave_registry,
                test_vectors::x_user_id(),
                test_vectors::sui_address(),
                test_vectors::nonce(),
                test_vectors::expires_at(),
                test_vectors::signature(),
                &test_clock,
                scenario.ctx(),
            );

            x_vault::transfer_vault(vault, scenario.ctx());
            clock::destroy_for_testing(test_clock);
            test_scenario::return_shared(enclave_registry);
            test_scenario::return_shared(registry);
        };

        scenario.next_tx(test_vectors::sui_address());
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            let enclave_registry = scenario.take_shared<EnclaveRegistry>();
            let vault = scenario.take_from_address<XVault>(test_vectors::sui_address());

            let mut test_clock = clock::create_for_testing(scenario.ctx());
            clock::set_for_testing(&mut test_clock, 1_000_000);

            x_vault::update_owner(
                &registry,
                &enclave_registry,
                vault,
                test_vectors::new_owner(),
                test_vectors::expires_at(),
                test_vectors::recovery_signature(),
                &test_clock,
                scenario.ctx(),
            );

            clock::destroy_for_testing(test_clock);
            test_scenario::return_shared(enclave_registry);
            test_scenario::return_shared(registry);
        };

        scenario.next_tx(test_vectors::new_owner());
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            let enclave_registry = scenario.take_shared<EnclaveRegistry>();
            let vault = scenario.take_from_address<XVault>(test_vectors::new_owner());

            let mut test_clock = clock::create_for_testing(scenario.ctx());
            clock::set_for_testing(&mut test_clock, 1_000_000);

            x_vault::update_owner(
                &registry,
                &enclave_registry,
                vault,
                test_vectors::second_new_owner(),
                test_vectors::expires_at(),
                test_vectors::recovery_signature(),
                &test_clock,
                scenario.ctx(),
            );
            clock::destroy_for_testing(test_clock);
            test_scenario::return_shared(enclave_registry);
            test_scenario::return_shared(registry);
        };

        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = x_vault::EPaused)]
    fun test_update_owner_rejected_when_vault_registry_paused() {
        let mut scenario = test_scenario::begin(ADMIN);

        nautilus_verifier::init_for_testing(scenario.ctx());
        x_vault::init_for_testing(scenario.ctx());

        scenario.next_tx(ADMIN);
        {
            let mut enclave_registry = scenario.take_shared<EnclaveRegistry>();
            nautilus_verifier::register_pubkey(&mut enclave_registry, test_vectors::pubkey(), scenario.ctx());
            test_scenario::return_shared(enclave_registry);
        };

        scenario.next_tx(test_vectors::sui_address());
        {
            let mut registry = scenario.take_shared<XVaultRegistry>();
            let enclave_registry = scenario.take_shared<EnclaveRegistry>();

            let mut test_clock = clock::create_for_testing(scenario.ctx());
            clock::set_for_testing(&mut test_clock, 1_000_000);

            let vault = x_vault::claim_vault(
                &mut registry,
                &enclave_registry,
                test_vectors::x_user_id(),
                test_vectors::sui_address(),
                test_vectors::nonce(),
                test_vectors::expires_at(),
                test_vectors::signature(),
                &test_clock,
                scenario.ctx(),
            );

            x_vault::transfer_vault(vault, scenario.ctx());
            clock::destroy_for_testing(test_clock);
            test_scenario::return_shared(enclave_registry);
            test_scenario::return_shared(registry);
        };

        scenario.next_tx(ADMIN);
        {
            let mut registry = scenario.take_shared<XVaultRegistry>();
            x_vault::pause(&mut registry, scenario.ctx());
            test_scenario::return_shared(registry);
        };

        scenario.next_tx(test_vectors::sui_address());
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            let enclave_registry = scenario.take_shared<EnclaveRegistry>();
            let vault = scenario.take_from_address<XVault>(test_vectors::sui_address());

            let mut test_clock = clock::create_for_testing(scenario.ctx());
            clock::set_for_testing(&mut test_clock, 1_000_000);

            x_vault::update_owner(
                &registry,
                &enclave_registry,
                vault,
                test_vectors::new_owner(),
                test_vectors::expires_at(),
                test_vectors::recovery_signature(),
                &test_clock,
                scenario.ctx(),
            );

            clock::destroy_for_testing(test_clock);
            test_scenario::return_shared(enclave_registry);
            test_scenario::return_shared(registry);
        };

        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = nautilus_verifier::EPaused)]
    fun test_update_owner_rejected_when_enclave_registry_paused() {
        let mut scenario = test_scenario::begin(ADMIN);

        nautilus_verifier::init_for_testing(scenario.ctx());
        x_vault::init_for_testing(scenario.ctx());

        scenario.next_tx(ADMIN);
        {
            let mut enclave_registry = scenario.take_shared<EnclaveRegistry>();
            nautilus_verifier::register_pubkey(&mut enclave_registry, test_vectors::pubkey(), scenario.ctx());
            test_scenario::return_shared(enclave_registry);
        };

        scenario.next_tx(test_vectors::sui_address());
        {
            let mut registry = scenario.take_shared<XVaultRegistry>();
            let enclave_registry = scenario.take_shared<EnclaveRegistry>();

            let mut test_clock = clock::create_for_testing(scenario.ctx());
            clock::set_for_testing(&mut test_clock, 1_000_000);

            let vault = x_vault::claim_vault(
                &mut registry,
                &enclave_registry,
                test_vectors::x_user_id(),
                test_vectors::sui_address(),
                test_vectors::nonce(),
                test_vectors::expires_at(),
                test_vectors::signature(),
                &test_clock,
                scenario.ctx(),
            );

            x_vault::transfer_vault(vault, scenario.ctx());
            clock::destroy_for_testing(test_clock);
            test_scenario::return_shared(enclave_registry);
            test_scenario::return_shared(registry);
        };

        scenario.next_tx(ADMIN);
        {
            let mut enclave_registry = scenario.take_shared<EnclaveRegistry>();
            nautilus_verifier::pause(&mut enclave_registry, scenario.ctx());
            test_scenario::return_shared(enclave_registry);
        };

        scenario.next_tx(test_vectors::sui_address());
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            let enclave_registry = scenario.take_shared<EnclaveRegistry>();
            let vault = scenario.take_from_address<XVault>(test_vectors::sui_address());

            let mut test_clock = clock::create_for_testing(scenario.ctx());
            clock::set_for_testing(&mut test_clock, 1_000_000);

            x_vault::update_owner(
                &registry,
                &enclave_registry,
                vault,
                test_vectors::new_owner(),
                test_vectors::expires_at(),
                test_vectors::recovery_signature(),
                &test_clock,
                scenario.ctx(),
            );

            clock::destroy_for_testing(test_clock);
            test_scenario::return_shared(enclave_registry);
            test_scenario::return_shared(registry);
        };

        scenario.end();
    }

    // ===== Test 4: Send before vault exists, then claim and sweep =====

    #[test]
    fun test_send_before_vault_exists() {
        let owner = @0xA11CE;
        let x_user_id: u64 = 7777;

        let mut scenario = test_scenario::begin(ADMIN);

        // Init both modules (nautilus first so EnclaveRegistry gets the same
        // deterministic ID as in verifier-only tests)
        nautilus_verifier::init_for_testing(scenario.ctx());
        x_vault::init_for_testing(scenario.ctx());

        // Derive address BEFORE any vault exists
        scenario.next_tx(owner);
        let vault_addr;
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            vault_addr = x_vault::derive_vault_address(&registry, x_user_id);
            test_scenario::return_shared(registry);
        };

        // Send coins to derived address BEFORE claim
        scenario.next_tx(owner);
        {
            let coin = coin::mint_for_testing<SUI>(500_000, scenario.ctx());
            transfer::public_transfer(coin, vault_addr);
        };

        // Claim vault — the vault object now occupies that derived address
        scenario.next_tx(owner);
        {
            let mut registry = scenario.take_shared<XVaultRegistry>();
            let vault = x_vault::claim_vault_for_testing(
                &mut registry, x_user_id, owner, scenario.ctx(),
            );
            x_vault::transfer_vault(vault, scenario.ctx());
            test_scenario::return_shared(registry);
        };

        // Sweep the pre-sent coin — should succeed
        scenario.next_tx(owner);
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            let mut vault = scenario.take_from_address<XVault>(owner);
            let vault_id = object::id(&vault);
            let ticket = test_scenario::most_recent_receiving_ticket<coin::Coin<SUI>>(&vault_id);
            x_vault::sweep_coin_to_vault(&registry, &mut vault, ticket);
            assert!(x_vault::vault_balance<SUI>(&vault) == 500_000, 0);
            test_scenario::return_shared(registry);
            test_scenario::return_to_address(owner, vault);
        };

        scenario.end();
    }

    // ===== Test 5: Duplicate claim for same x_user_id is rejected =====

    #[test]
    #[expected_failure(abort_code = derived_object::EObjectAlreadyExists)]
    fun test_duplicate_claim_rejected() {
        let owner = @0xA11CE;
        let x_user_id: u64 = 42;

        let mut scenario = test_scenario::begin(ADMIN);
        x_vault::init_for_testing(scenario.ctx());
        nautilus_verifier::init_for_testing(scenario.ctx());

        // First claim — should succeed
        scenario.next_tx(owner);
        {
            let mut registry = scenario.take_shared<XVaultRegistry>();
            let vault = x_vault::claim_vault_for_testing(
                &mut registry, x_user_id, owner, scenario.ctx(),
            );
            x_vault::transfer_vault(vault, scenario.ctx());
            test_scenario::return_shared(registry);
        };

        // Second claim for the same x_user_id — should abort
        scenario.next_tx(owner);
        {
            let mut registry = scenario.take_shared<XVaultRegistry>();
            let vault = x_vault::claim_vault_for_testing(
                &mut registry, x_user_id, owner, scenario.ctx(),
            );
            x_vault::transfer_vault(vault, scenario.ctx());
            test_scenario::return_shared(registry);
        };

        scenario.end();
    }

    // ===== Test 6: Pre- and post-claim sends lifecycle =====

    #[test]
    fun test_lifecycle_pre_and_post_claim_sends() {
        let owner = @0xA11CE;
        let x_user_id: u64 = 9999;

        let mut scenario = test_scenario::begin(ADMIN);

        // Init both modules (nautilus first so EnclaveRegistry gets the same
        // deterministic ID as in verifier-only tests)
        nautilus_verifier::init_for_testing(scenario.ctx());
        x_vault::init_for_testing(scenario.ctx());

        // Derive address
        scenario.next_tx(owner);
        let vault_addr;
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            vault_addr = x_vault::derive_vault_address(&registry, x_user_id);
            test_scenario::return_shared(registry);
        };

        // Send coins BEFORE claim (pre-claim)
        scenario.next_tx(owner);
        {
            let coin = coin::mint_for_testing<SUI>(200_000, scenario.ctx());
            transfer::public_transfer(coin, vault_addr);
        };

        // Claim vault
        scenario.next_tx(owner);
        {
            let mut registry = scenario.take_shared<XVaultRegistry>();
            let vault = x_vault::claim_vault_for_testing(
                &mut registry, x_user_id, owner, scenario.ctx(),
            );
            x_vault::transfer_vault(vault, scenario.ctx());
            test_scenario::return_shared(registry);
        };

        // Sweep pre-claim coin
        scenario.next_tx(owner);
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            let mut vault = scenario.take_from_address<XVault>(owner);
            let vault_id = object::id(&vault);
            let ticket = test_scenario::most_recent_receiving_ticket<coin::Coin<SUI>>(&vault_id);
            x_vault::sweep_coin_to_vault(&registry, &mut vault, ticket);
            assert!(x_vault::vault_balance<SUI>(&vault) == 200_000, 0);
            test_scenario::return_shared(registry);
            test_scenario::return_to_address(owner, vault);
        };

        // Send MORE coins AFTER claim (post-claim) — vault_addr is the vault's object ID
        scenario.next_tx(owner);
        {
            let coin = coin::mint_for_testing<SUI>(350_000, scenario.ctx());
            transfer::public_transfer(coin, vault_addr);
        };

        // Sweep post-claim coin
        scenario.next_tx(owner);
        {
            let registry = scenario.take_shared<XVaultRegistry>();
            let mut vault = scenario.take_from_address<XVault>(owner);
            let vault_id = object::id(&vault);
            let ticket = test_scenario::most_recent_receiving_ticket<coin::Coin<SUI>>(&vault_id);
            x_vault::sweep_coin_to_vault(&registry, &mut vault, ticket);

            // Verify total balance = 200_000 + 350_000
            assert!(x_vault::vault_balance<SUI>(&vault) == 550_000, 1);
            test_scenario::return_shared(registry);
            test_scenario::return_to_address(owner, vault);
        };

        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = x_vault::EPaused)]
    fun test_claim_rejected_when_vault_registry_paused() {
        let mut scenario = test_scenario::begin(ADMIN);

        nautilus_verifier::init_for_testing(scenario.ctx());
        x_vault::init_for_testing(scenario.ctx());

        scenario.next_tx(ADMIN);
        {
            let mut enclave_registry = scenario.take_shared<EnclaveRegistry>();
            nautilus_verifier::register_pubkey(&mut enclave_registry, test_vectors::pubkey(), scenario.ctx());
            test_scenario::return_shared(enclave_registry);
        };

        scenario.next_tx(ADMIN);
        {
            let mut registry = scenario.take_shared<XVaultRegistry>();
            x_vault::pause(&mut registry, scenario.ctx());
            test_scenario::return_shared(registry);
        };

        scenario.next_tx(test_vectors::sui_address());
        {
            let mut registry = scenario.take_shared<XVaultRegistry>();
            let enclave_registry = scenario.take_shared<EnclaveRegistry>();

            let mut test_clock = clock::create_for_testing(scenario.ctx());
            clock::set_for_testing(&mut test_clock, 1_000_000);

            let vault = x_vault::claim_vault(
                &mut registry,
                &enclave_registry,
                test_vectors::x_user_id(),
                test_vectors::sui_address(),
                test_vectors::nonce(),
                test_vectors::expires_at(),
                test_vectors::signature(),
                &test_clock,
                scenario.ctx(),
            );

            x_vault::transfer_vault(vault, scenario.ctx());
            clock::destroy_for_testing(test_clock);
            test_scenario::return_shared(enclave_registry);
            test_scenario::return_shared(registry);
        };

        scenario.end();
    }
}
