#[test_only]
module levo::nautilus_verifier_tests {
    use sui::test_scenario;
    use sui::clock;
    use levo::nautilus_verifier::{Self, EnclaveRegistry};
    use levo::test_vectors;

    // Real Ed25519 test vectors generated with:
    //   npm run generate:test-vectors -- 0x34401905bebdf8c04f3cd5f04f442a39372c8dc321c29edfb4f9cb30b23ab96
    // Signature covers BCS(x_user_id, sui_address, nonce, expires_at, registry_id)
    // Owner-handoff signature covers BCS(x_user_id, vault_id, current_owner,
    // new_owner, recovery_counter, expires_at, registry_id)

    #[test]
    fun test_register_pubkey() {
        let admin = @0xAD;
        let mut scenario = test_scenario::begin(admin);
        nautilus_verifier::init_for_testing(scenario.ctx());

        scenario.next_tx(admin);
        {
            let mut registry = scenario.take_shared<EnclaveRegistry>();
            nautilus_verifier::register_pubkey(&mut registry, test_vectors::pubkey(), scenario.ctx());
            test_scenario::return_shared(registry);
        };
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = nautilus_verifier::ENotAdmin)]
    fun test_register_pubkey_not_admin() {
        let admin = @0xAD;
        let not_admin = @0xBAD;
        let mut scenario = test_scenario::begin(admin);
        nautilus_verifier::init_for_testing(scenario.ctx());

        scenario.next_tx(not_admin);
        {
            let mut registry = scenario.take_shared<EnclaveRegistry>();
            nautilus_verifier::register_pubkey(&mut registry, test_vectors::pubkey(), scenario.ctx());
            test_scenario::return_shared(registry);
        };
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = nautilus_verifier::EPubkeyAlreadyRegistered)]
    fun test_register_duplicate_pubkey() {
        let admin = @0xAD;
        let mut scenario = test_scenario::begin(admin);
        nautilus_verifier::init_for_testing(scenario.ctx());

        scenario.next_tx(admin);
        {
            let mut registry = scenario.take_shared<EnclaveRegistry>();
            nautilus_verifier::register_pubkey(&mut registry, test_vectors::pubkey(), scenario.ctx());
            nautilus_verifier::register_pubkey(&mut registry, test_vectors::pubkey(), scenario.ctx());
            test_scenario::return_shared(registry);
        };
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = nautilus_verifier::EAttestationExpired)]
    fun test_verify_expired_attestation() {
        let admin = @0xAD;
        let mut scenario = test_scenario::begin(admin);
        nautilus_verifier::init_for_testing(scenario.ctx());

        scenario.next_tx(admin);
        {
            let mut registry = scenario.take_shared<EnclaveRegistry>();
            nautilus_verifier::register_pubkey(&mut registry, test_vectors::pubkey(), scenario.ctx());

            let mut test_clock = clock::create_for_testing(scenario.ctx());
            clock::set_for_testing(&mut test_clock, test_vectors::expires_at() + 1);

            nautilus_verifier::verify_attestation(
                &registry, test_vectors::x_user_id(), test_vectors::sui_address(),
                test_vectors::nonce(), test_vectors::expires_at(), test_vectors::signature(), &test_clock,
            );

            clock::destroy_for_testing(test_clock);
            test_scenario::return_shared(registry);
        };
        scenario.end();
    }

    // ===== New: Positive verification test with real signature =====

    #[test]
    fun test_verify_valid_attestation() {
        let admin = @0xAD;
        let mut scenario = test_scenario::begin(admin);
        nautilus_verifier::init_for_testing(scenario.ctx());

        scenario.next_tx(admin);
        {
            let mut registry = scenario.take_shared<EnclaveRegistry>();
            nautilus_verifier::register_pubkey(&mut registry, test_vectors::pubkey(), scenario.ctx());

            // Clock set BEFORE expires_at — attestation should be valid
            let mut test_clock = clock::create_for_testing(scenario.ctx());
            clock::set_for_testing(&mut test_clock, 1_000_000);

            // This should NOT abort — valid signature over (x_user_id, sui_address, nonce, expires_at)
            nautilus_verifier::verify_attestation(
                &registry, test_vectors::x_user_id(), test_vectors::sui_address(),
                test_vectors::nonce(), test_vectors::expires_at(), test_vectors::signature(), &test_clock,
            );

            clock::destroy_for_testing(test_clock);
            test_scenario::return_shared(registry);
        };
        scenario.end();
    }

    #[test]
    fun test_verify_valid_owner_handoff_attestation() {
        let admin = @0xAD;
        let mut scenario = test_scenario::begin(admin);
        nautilus_verifier::init_for_testing(scenario.ctx());

        scenario.next_tx(admin);
        {
            let mut registry = scenario.take_shared<EnclaveRegistry>();
            nautilus_verifier::register_pubkey(&mut registry, test_vectors::pubkey(), scenario.ctx());

            let mut test_clock = clock::create_for_testing(scenario.ctx());
            clock::set_for_testing(&mut test_clock, 1_000_000);

            nautilus_verifier::verify_owner_recovery_attestation(
                &registry,
                test_vectors::x_user_id(),
                test_vectors::vault_id(),
                test_vectors::sui_address(),
                test_vectors::new_owner(),
                0,
                test_vectors::expires_at(),
                test_vectors::recovery_signature(),
                &test_clock,
            );

            clock::destroy_for_testing(test_clock);
            test_scenario::return_shared(registry);
        };
        scenario.end();
    }

    // ===== New: Invalid pubkey length should fail =====

    #[test]
    #[expected_failure(abort_code = nautilus_verifier::EInvalidPubkeyLength)]
    fun test_register_invalid_pubkey_length() {
        let admin = @0xAD;
        let mut scenario = test_scenario::begin(admin);
        nautilus_verifier::init_for_testing(scenario.ctx());

        scenario.next_tx(admin);
        {
            let mut registry = scenario.take_shared<EnclaveRegistry>();
            // 16 bytes instead of required 32
            let short_key: vector<u8> = x"cecc1507dc1ddd7295951c290888f095";
            nautilus_verifier::register_pubkey(&mut registry, short_key, scenario.ctx());
            test_scenario::return_shared(registry);
        };
        scenario.end();
    }

    // ===== New: Removing a missing key should fail =====

    #[test]
    #[expected_failure(abort_code = nautilus_verifier::EPubkeyNotFound)]
    fun test_remove_missing_pubkey() {
        let admin = @0xAD;
        let mut scenario = test_scenario::begin(admin);
        nautilus_verifier::init_for_testing(scenario.ctx());

        scenario.next_tx(admin);
        {
            let mut registry = scenario.take_shared<EnclaveRegistry>();
            // Try to remove a key that was never registered
            nautilus_verifier::remove_pubkey(&mut registry, test_vectors::pubkey(), scenario.ctx());
            test_scenario::return_shared(registry);
        };
        scenario.end();
    }

    // ===== New: Removing a registered key revokes trust =====

    #[test]
    #[expected_failure(abort_code = nautilus_verifier::EInvalidSignature)]
    fun test_remove_registered_pubkey_revokes_attestations() {
        let admin = @0xAD;
        let mut scenario = test_scenario::begin(admin);
        nautilus_verifier::init_for_testing(scenario.ctx());

        scenario.next_tx(admin);
        {
            let mut registry = scenario.take_shared<EnclaveRegistry>();
            nautilus_verifier::register_pubkey(&mut registry, test_vectors::pubkey(), scenario.ctx());
            nautilus_verifier::remove_pubkey(&mut registry, test_vectors::pubkey(), scenario.ctx());

            let mut test_clock = clock::create_for_testing(scenario.ctx());
            clock::set_for_testing(&mut test_clock, 1_000_000);

            nautilus_verifier::verify_attestation(
                &registry, test_vectors::x_user_id(), test_vectors::sui_address(),
                test_vectors::nonce(), test_vectors::expires_at(), test_vectors::signature(), &test_clock,
            );

            clock::destroy_for_testing(test_clock);
            test_scenario::return_shared(registry);
        };
        scenario.end();
    }

    // ===== New: Cross-registry replay is rejected =====

    #[test]
    #[expected_failure(abort_code = nautilus_verifier::EInvalidSignature)]
    fun test_cross_registry_replay_rejected() {
        let admin = @0xAD;
        let mut scenario = test_scenario::begin(admin);

        // Allocate a dummy UID first so the registry gets a different
        // object ID than in the standard tests (where the registry is
        // the first object created in the transaction).
        let dummy = object::new(scenario.ctx());
        object::delete(dummy);

        // This registry's ID differs from the one our test vectors were signed for.
        nautilus_verifier::init_for_testing(scenario.ctx());

        scenario.next_tx(admin);
        {
            let mut registry = scenario.take_shared<EnclaveRegistry>();
            nautilus_verifier::register_pubkey(&mut registry, test_vectors::pubkey(), scenario.ctx());

            let mut test_clock = clock::create_for_testing(scenario.ctx());
            clock::set_for_testing(&mut test_clock, 1_000_000);

            // The shared signature fixture was generated for a registry with a specific registry_id.
            // This registry has a different ID, so verification should fail.
            nautilus_verifier::verify_attestation(
                &registry, test_vectors::x_user_id(), test_vectors::sui_address(),
                test_vectors::nonce(), test_vectors::expires_at(), test_vectors::signature(), &test_clock,
            );

            clock::destroy_for_testing(test_clock);
            test_scenario::return_shared(registry);
        };
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = nautilus_verifier::EInvalidSignature)]
    fun test_owner_handoff_cross_registry_replay_rejected() {
        let admin = @0xAD;
        let mut scenario = test_scenario::begin(admin);

        // Allocate a dummy UID first so this registry differs from the one
        // our owner-handoff fixture was signed for.
        let dummy = object::new(scenario.ctx());
        object::delete(dummy);

        nautilus_verifier::init_for_testing(scenario.ctx());

        scenario.next_tx(admin);
        {
            let mut registry = scenario.take_shared<EnclaveRegistry>();
            nautilus_verifier::register_pubkey(&mut registry, test_vectors::pubkey(), scenario.ctx());

            let mut test_clock = clock::create_for_testing(scenario.ctx());
            clock::set_for_testing(&mut test_clock, 1_000_000);

            nautilus_verifier::verify_owner_recovery_attestation(
                &registry,
                test_vectors::x_user_id(),
                test_vectors::vault_id(),
                test_vectors::sui_address(),
                test_vectors::new_owner(),
                0,
                test_vectors::expires_at(),
                test_vectors::recovery_signature(),
                &test_clock,
            );

            clock::destroy_for_testing(test_clock);
            test_scenario::return_shared(registry);
        };
        scenario.end();
    }

    // ===== New: Wrong signature should fail =====

    #[test]
    #[expected_failure(abort_code = nautilus_verifier::EInvalidSignature)]
    fun test_verify_wrong_signature() {
        let admin = @0xAD;
        let mut scenario = test_scenario::begin(admin);
        nautilus_verifier::init_for_testing(scenario.ctx());

        scenario.next_tx(admin);
        {
            let mut registry = scenario.take_shared<EnclaveRegistry>();
            nautilus_verifier::register_pubkey(&mut registry, test_vectors::pubkey(), scenario.ctx());

            let mut test_clock = clock::create_for_testing(scenario.ctx());
            clock::set_for_testing(&mut test_clock, 1_000_000);

            // Corrupt the signature (flip first byte)
            let wrong_sig: vector<u8> = x"006506ef725983b2815f6ae39532e808fb0b5946159376cae8b0e34f97ceb34cffd1280dad17ef27be2270bc99d7a46980e6309b7675dce7264ee0df10387e0d";

            nautilus_verifier::verify_attestation(
                &registry, test_vectors::x_user_id(), test_vectors::sui_address(),
                test_vectors::nonce(), test_vectors::expires_at(), wrong_sig, &test_clock,
            );

            clock::destroy_for_testing(test_clock);
            test_scenario::return_shared(registry);
        };
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = nautilus_verifier::EInvalidSignature)]
    fun test_verify_owner_handoff_wrong_new_owner() {
        let admin = @0xAD;
        let mut scenario = test_scenario::begin(admin);
        nautilus_verifier::init_for_testing(scenario.ctx());

        scenario.next_tx(admin);
        {
            let mut registry = scenario.take_shared<EnclaveRegistry>();
            nautilus_verifier::register_pubkey(&mut registry, test_vectors::pubkey(), scenario.ctx());

            let mut test_clock = clock::create_for_testing(scenario.ctx());
            clock::set_for_testing(&mut test_clock, 1_000_000);

            nautilus_verifier::verify_owner_recovery_attestation(
                &registry,
                test_vectors::x_user_id(),
                test_vectors::vault_id(),
                test_vectors::sui_address(),
                @0x000000000000000000000000000000000000000000000000000000000000d00d,
                0,
                test_vectors::expires_at(),
                test_vectors::recovery_signature(),
                &test_clock,
            );

            clock::destroy_for_testing(test_clock);
            test_scenario::return_shared(registry);
        };
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = nautilus_verifier::EInvalidSignatureLength)]
    fun test_verify_invalid_signature_length() {
        let admin = @0xAD;
        let mut scenario = test_scenario::begin(admin);
        nautilus_verifier::init_for_testing(scenario.ctx());

        scenario.next_tx(admin);
        {
            let mut registry = scenario.take_shared<EnclaveRegistry>();
            nautilus_verifier::register_pubkey(&mut registry, test_vectors::pubkey(), scenario.ctx());

            let mut test_clock = clock::create_for_testing(scenario.ctx());
            clock::set_for_testing(&mut test_clock, 1_000_000);

            let short_sig: vector<u8> = x"6506ef725983b2815f6ae39532e808fb";
            nautilus_verifier::verify_attestation(
                &registry, test_vectors::x_user_id(), test_vectors::sui_address(),
                test_vectors::nonce(), test_vectors::expires_at(), short_sig, &test_clock,
            );

            clock::destroy_for_testing(test_clock);
            test_scenario::return_shared(registry);
        };
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = nautilus_verifier::EInvalidSignatureLength)]
    fun test_verify_owner_handoff_invalid_signature_length() {
        let admin = @0xAD;
        let mut scenario = test_scenario::begin(admin);
        nautilus_verifier::init_for_testing(scenario.ctx());

        scenario.next_tx(admin);
        {
            let mut registry = scenario.take_shared<EnclaveRegistry>();
            nautilus_verifier::register_pubkey(&mut registry, test_vectors::pubkey(), scenario.ctx());

            let mut test_clock = clock::create_for_testing(scenario.ctx());
            clock::set_for_testing(&mut test_clock, 1_000_000);

            let short_sig: vector<u8> = x"b9af7e0ac3f2b379ee39d2aa0e9f54ab";
            nautilus_verifier::verify_owner_recovery_attestation(
                &registry,
                test_vectors::x_user_id(),
                test_vectors::vault_id(),
                test_vectors::sui_address(),
                test_vectors::new_owner(),
                0,
                test_vectors::expires_at(),
                short_sig,
                &test_clock,
            );

            clock::destroy_for_testing(test_clock);
            test_scenario::return_shared(registry);
        };
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = nautilus_verifier::EPaused)]
    fun test_pause_blocks_verify_attestation() {
        let admin = @0xAD;
        let mut scenario = test_scenario::begin(admin);
        nautilus_verifier::init_for_testing(scenario.ctx());

        scenario.next_tx(admin);
        {
            let mut registry = scenario.take_shared<EnclaveRegistry>();
            nautilus_verifier::register_pubkey(&mut registry, test_vectors::pubkey(), scenario.ctx());
            nautilus_verifier::pause(&mut registry, scenario.ctx());

            let mut test_clock = clock::create_for_testing(scenario.ctx());
            clock::set_for_testing(&mut test_clock, 1_000_000);

            nautilus_verifier::verify_attestation(
                &registry, test_vectors::x_user_id(), test_vectors::sui_address(),
                test_vectors::nonce(), test_vectors::expires_at(), test_vectors::signature(), &test_clock,
            );

            clock::destroy_for_testing(test_clock);
            test_scenario::return_shared(registry);
        };
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = nautilus_verifier::EPaused)]
    fun test_pause_blocks_verify_owner_recovery_attestation() {
        let admin = @0xAD;
        let mut scenario = test_scenario::begin(admin);
        nautilus_verifier::init_for_testing(scenario.ctx());

        scenario.next_tx(admin);
        {
            let mut registry = scenario.take_shared<EnclaveRegistry>();
            nautilus_verifier::register_pubkey(&mut registry, test_vectors::pubkey(), scenario.ctx());
            nautilus_verifier::pause(&mut registry, scenario.ctx());

            let mut test_clock = clock::create_for_testing(scenario.ctx());
            clock::set_for_testing(&mut test_clock, 1_000_000);

            nautilus_verifier::verify_owner_recovery_attestation(
                &registry,
                test_vectors::x_user_id(),
                test_vectors::vault_id(),
                test_vectors::sui_address(),
                test_vectors::new_owner(),
                0,
                test_vectors::expires_at(),
                test_vectors::recovery_signature(),
                &test_clock,
            );

            clock::destroy_for_testing(test_clock);
            test_scenario::return_shared(registry);
        };
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = nautilus_verifier::EAlreadyPaused)]
    fun test_pause_rejected_when_already_paused() {
        let admin = @0xAD;
        let mut scenario = test_scenario::begin(admin);
        nautilus_verifier::init_for_testing(scenario.ctx());

        scenario.next_tx(admin);
        {
            let mut registry = scenario.take_shared<EnclaveRegistry>();
            nautilus_verifier::pause(&mut registry, scenario.ctx());
            nautilus_verifier::pause(&mut registry, scenario.ctx());
            test_scenario::return_shared(registry);
        };
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = nautilus_verifier::ENotPaused)]
    fun test_unpause_rejected_when_not_paused() {
        let admin = @0xAD;
        let mut scenario = test_scenario::begin(admin);
        nautilus_verifier::init_for_testing(scenario.ctx());

        scenario.next_tx(admin);
        {
            let mut registry = scenario.take_shared<EnclaveRegistry>();
            nautilus_verifier::unpause(&mut registry, scenario.ctx());
            test_scenario::return_shared(registry);
        };
        scenario.end();
    }

}
