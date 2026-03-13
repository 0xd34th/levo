module levo::nautilus_verifier {
    use sui::ed25519;
    use sui::bcs;
    use sui::clock::Clock;

    // ===== Error Codes =====
    const ENotAdmin: u64 = 0;
    const EInvalidSignature: u64 = 1;
    const EAttestationExpired: u64 = 2;
    const EPubkeyAlreadyRegistered: u64 = 3;
    const EInvalidPubkeyLength: u64 = 4;
    const EPubkeyNotFound: u64 = 5;
    const EPaused: u64 = 6;
    const EAlreadyPaused: u64 = 7;
    const ENotPaused: u64 = 8;
    const EInvalidSignatureLength: u64 = 9;

    // ===== Structs =====

    /// Shared registry of trusted enclave public keys.
    public struct EnclaveRegistry has key {
        id: UID,
        admin: address,
        paused: bool,
        pubkeys: vector<vector<u8>>,
    }

    /// The attestation message format that the enclave signs.
    /// BCS-serialized in this exact field order.
    /// `registry_id` acts as a domain separator — it binds the signature
    /// to a specific EnclaveRegistry deployment, preventing cross-deployment replay.
    public struct AttestationMessage has copy, drop {
        x_user_id: u64,
        sui_address: address,
        nonce: u64,
        expires_at: u64,
        registry_id: address,
    }

    /// Attestation payload for an owner handoff. This binds the proof to one
    /// specific vault, the currently recorded owner, the proposed new owner,
    /// the current recovery counter, and the verifier deployment.
    public struct OwnerRecoveryMessage has copy, drop {
        x_user_id: u64,
        vault_id: address,
        current_owner: address,
        new_owner: address,
        recovery_counter: u64,
        expires_at: u64,
        registry_id: address,
    }

    public struct PubkeyRegistered has copy, drop {
        admin: address,
        pubkey: vector<u8>,
    }

    public struct PubkeyRemoved has copy, drop {
        admin: address,
        pubkey: vector<u8>,
    }

    public struct RegistryPaused has copy, drop {
        registry_id: address,
        admin: address,
    }

    public struct RegistryUnpaused has copy, drop {
        registry_id: address,
        admin: address,
    }

    public struct RegistryCreated has copy, drop {
        registry_id: address,
        admin: address,
    }

    // ===== Init =====

    fun init(ctx: &mut TxContext) {
        let admin = ctx.sender();
        let registry = EnclaveRegistry {
            id: object::new(ctx),
            admin,
            paused: false,
            pubkeys: vector::empty(),
        };
        sui::event::emit(RegistryCreated {
            registry_id: registry.id.to_address(),
            admin,
        });
        transfer::share_object(registry);
    }

    // ===== Admin Functions =====

    /// Register a new enclave public key (32 bytes, Ed25519).
    public fun register_pubkey(
        registry: &mut EnclaveRegistry,
        pubkey: vector<u8>,
        ctx: &TxContext,
    ) {
        assert!(ctx.sender() == registry.admin, ENotAdmin);
        assert!(pubkey.length() == 32, EInvalidPubkeyLength);
        let event_pubkey = copy pubkey;
        let len = registry.pubkeys.length();
        let mut i = 0;
        while (i < len) {
            assert!(&registry.pubkeys[i] != &pubkey, EPubkeyAlreadyRegistered);
            i = i + 1;
        };
        registry.pubkeys.push_back(pubkey);
        sui::event::emit(PubkeyRegistered { admin: ctx.sender(), pubkey: event_pubkey });
    }

    public fun pause(registry: &mut EnclaveRegistry, ctx: &TxContext) {
        assert!(ctx.sender() == registry.admin, ENotAdmin);
        assert!(!registry.paused, EAlreadyPaused);
        registry.paused = true;
        sui::event::emit(RegistryPaused {
            registry_id: registry.id.to_address(),
            admin: ctx.sender(),
        });
    }

    public fun unpause(registry: &mut EnclaveRegistry, ctx: &TxContext) {
        assert!(ctx.sender() == registry.admin, ENotAdmin);
        assert!(registry.paused, ENotPaused);
        registry.paused = false;
        sui::event::emit(RegistryUnpaused {
            registry_id: registry.id.to_address(),
            admin: ctx.sender(),
        });
    }

    /// Remove an enclave public key. Aborts if the key is not found.
    public fun remove_pubkey(
        registry: &mut EnclaveRegistry,
        pubkey: vector<u8>,
        ctx: &TxContext,
    ) {
        assert!(ctx.sender() == registry.admin, ENotAdmin);
        let event_pubkey = copy pubkey;
        let len = registry.pubkeys.length();
        let mut i = 0;
        while (i < len) {
            if (&registry.pubkeys[i] == &pubkey) {
                registry.pubkeys.swap_remove(i);
                sui::event::emit(PubkeyRemoved { admin: ctx.sender(), pubkey: event_pubkey });
                return
            };
            i = i + 1;
        };
        abort EPubkeyNotFound
    }

    // ===== Verification =====

    /// Verify an attestation signature from a registered enclave.
    public fun verify_attestation(
        registry: &EnclaveRegistry,
        x_user_id: u64,
        sui_address: address,
        nonce: u64,
        expires_at: u64,
        signature: vector<u8>,
        clock: &Clock,
    ) {
        assert!(!registry.paused, EPaused);
        assert!(clock.timestamp_ms() <= expires_at, EAttestationExpired);
        assert!(signature.length() == 64, EInvalidSignatureLength);

        let registry_id = registry.id.to_address();
        let msg = AttestationMessage { x_user_id, sui_address, nonce, expires_at, registry_id };
        let msg_bytes = bcs::to_bytes(&msg);

        assert!(signature_matches_registered_pubkey(registry, &signature, &msg_bytes), EInvalidSignature);
    }

    public fun verify_owner_recovery_attestation(
        registry: &EnclaveRegistry,
        x_user_id: u64,
        vault_id: address,
        current_owner: address,
        new_owner: address,
        recovery_counter: u64,
        expires_at: u64,
        signature: vector<u8>,
        clock: &Clock,
    ) {
        assert!(!registry.paused, EPaused);
        assert!(clock.timestamp_ms() <= expires_at, EAttestationExpired);
        assert!(signature.length() == 64, EInvalidSignatureLength);

        let registry_id = registry.id.to_address();
        let msg = OwnerRecoveryMessage {
            x_user_id,
            vault_id,
            current_owner,
            new_owner,
            recovery_counter,
            expires_at,
            registry_id,
        };
        let msg_bytes = bcs::to_bytes(&msg);

        assert!(signature_matches_registered_pubkey(registry, &signature, &msg_bytes), EInvalidSignature);
    }

    fun signature_matches_registered_pubkey(
        registry: &EnclaveRegistry,
        signature: &vector<u8>,
        msg_bytes: &vector<u8>,
    ): bool {
        let mut verified = false;
        let len = registry.pubkeys.length();
        let mut i = 0;
        while (i < len) {
            if (ed25519::ed25519_verify(signature, &registry.pubkeys[i], msg_bytes)) {
                verified = true;
                break
            };
            i = i + 1;
        };
        verified
    }

    // ===== Test Helpers =====

    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(ctx);
    }

    #[test_only]
    public fun registry_address_for_testing(registry: &EnclaveRegistry): address {
        registry.id.to_address()
    }
}
