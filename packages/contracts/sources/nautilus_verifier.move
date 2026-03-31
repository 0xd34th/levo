module levo::nautilus_verifier {
    use enclave::enclave::{Self, Enclave};
    use sui::clock::Clock;

    // ===== Error Codes =====
    const EInvalidSignature: u64 = 1;
    const EAttestationExpired: u64 = 2;

    // ===== Intent Scopes =====
    const ATTESTATION_INTENT: u8 = 0;
    const RECOVERY_INTENT: u8 = 1;

    // ===== OTW =====

    /// One-Time Witness for creating the Nautilus EnclaveConfig.
    /// Published via `init` to create Cap<NAUTILUS_VERIFIER> and EnclaveConfig<NAUTILUS_VERIFIER>.
    public struct NAUTILUS_VERIFIER has drop {}

    // ===== Attestation Payload Structs =====
    // These are the `P` type parameters for enclave::verify_signature<T, P>.
    // BCS field order must match the Rust enclave's AttestationDataBcs struct exactly.

    /// Claim attestation message. Signed by the enclave inside IntentMessage<AttestationMessage>.
    public struct AttestationMessage has copy, drop {
        x_user_id: u64,
        sui_address: address,
        nonce: u64,
        expires_at: u64,
        registry_id: address,
    }

    /// Owner recovery attestation message.
    public struct OwnerRecoveryMessage has copy, drop {
        x_user_id: u64,
        vault_id: address,
        current_owner: address,
        new_owner: address,
        recovery_counter: u64,
        expires_at: u64,
        registry_id: address,
    }

    // ===== Init =====

    fun init(otw: NAUTILUS_VERIFIER, ctx: &mut TxContext) {
        let cap = enclave::new_cap(otw, ctx);

        // Create EnclaveConfig with placeholder PCRs (48 zero bytes each).
        // Real PCRs are set via `enclave::update_pcrs` after the enclave is built.
        cap.create_enclave_config(
            b"levo attestation signer".to_string(),
            x"000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
            x"000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
            x"000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
            ctx,
        );

        transfer::public_transfer(cap, ctx.sender());
    }

    // ===== Verification =====

    /// Verify a claim attestation signed by a Nautilus enclave.
    /// The enclave wraps AttestationMessage in IntentMessage before signing,
    /// and enclave::verify_signature reconstructs + verifies the same structure.
    public fun verify_attestation<T>(
        enclave: &Enclave<T>,
        x_user_id: u64,
        sui_address: address,
        nonce: u64,
        expires_at: u64,
        registry_id: address,
        timestamp_ms: u64,
        signature: vector<u8>,
        clock: &Clock,
    ) {
        assert!(clock.timestamp_ms() <= expires_at, EAttestationExpired);

        let msg = AttestationMessage { x_user_id, sui_address, nonce, expires_at, registry_id };
        let valid = enclave.verify_signature(
            ATTESTATION_INTENT,
            timestamp_ms,
            msg,
            &signature,
        );
        assert!(valid, EInvalidSignature);
    }

    /// Verify an owner recovery attestation signed by a Nautilus enclave.
    public fun verify_owner_recovery_attestation<T>(
        enclave: &Enclave<T>,
        x_user_id: u64,
        vault_id: address,
        current_owner: address,
        new_owner: address,
        recovery_counter: u64,
        expires_at: u64,
        registry_id: address,
        timestamp_ms: u64,
        signature: vector<u8>,
        clock: &Clock,
    ) {
        assert!(clock.timestamp_ms() <= expires_at, EAttestationExpired);

        let msg = OwnerRecoveryMessage {
            x_user_id,
            vault_id,
            current_owner,
            new_owner,
            recovery_counter,
            expires_at,
            registry_id,
        };
        let valid = enclave.verify_signature(
            RECOVERY_INTENT,
            timestamp_ms,
            msg,
            &signature,
        );
        assert!(valid, EInvalidSignature);
    }

    // ===== Test Helpers =====

    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(NAUTILUS_VERIFIER {}, ctx);
    }

    #[test_only]
    public fun test_create_attestation_message(
        x_user_id: u64,
        sui_address: address,
        nonce: u64,
        expires_at: u64,
        registry_id: address,
    ): AttestationMessage {
        AttestationMessage { x_user_id, sui_address, nonce, expires_at, registry_id }
    }
}
