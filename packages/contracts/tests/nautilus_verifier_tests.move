#[test_only]
module levo::nautilus_verifier_tests {
    use sui::test_scenario;
    use sui::clock;
    use enclave::enclave::EnclaveConfig;
    use levo::nautilus_verifier::{Self, NAUTILUS_VERIFIER};

    #[test]
    fun test_init_creates_enclave_config() {
        let admin = @0xAD;
        let mut scenario = test_scenario::begin(admin);
        nautilus_verifier::init_for_testing(scenario.ctx());

        scenario.next_tx(admin);
        {
            // init should create a shared EnclaveConfig<NAUTILUS_VERIFIER>
            let config = scenario.take_shared<EnclaveConfig<NAUTILUS_VERIFIER>>();
            test_scenario::return_shared(config);
        };
        scenario.end();
    }

    #[test]
    fun test_bcs_attestation_message_layout() {
        // Verify AttestationMessage BCS matches expected field order.
        // This test ensures the Move struct layout matches what the Rust enclave produces.
        use std::bcs;

        let msg = nautilus_verifier::test_create_attestation_message(
            12345,
            @0x0000000000000000000000000000000000000000000000000000000000000002,
            1,
            9999999999999,
            @0x0000000000000000000000000000000000000000000000000000000000000001,
        );
        let bytes = bcs::to_bytes(&msg);

        // AttestationMessage: u64 + address(32) + u64 + u64 + address(32) = 88 bytes
        assert!(bytes.length() == 88, 0);

        // x_user_id = 12345 = 0x3039 (u64 LE at offset 0)
        assert!(*bytes.borrow(0) == 0x39, 1);
        assert!(*bytes.borrow(1) == 0x30, 2);
    }
}
