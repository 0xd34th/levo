module levo::x_vault {
    use sui::derived_object;
    use sui::transfer::Receiving;
    use sui::coin::{Self, Coin};
    use sui::dynamic_field as df;
    use sui::clock::Clock;
    use std::type_name;
    use std::ascii::{Self, String};
    use enclave::enclave::Enclave;
    use levo::nautilus_verifier;

    // ===== Error Codes =====
    const ENotVaultOwner: u64 = 0;
    const ENotAuthorized: u64 = 1;
    const EInsufficientBalance: u64 = 2;
    const ECoinMustUseSweep: u64 = 3;
    const EBalanceNotFound: u64 = 4;
    const EZeroAmount: u64 = 5;
    const ENotAdmin: u64 = 6;
    const EPaused: u64 = 7;
    const EOwnerUnchanged: u64 = 8;
    const EAlreadyPaused: u64 = 9;
    const ENotPaused: u64 = 10;

    // ===== Structs =====

    /// Shared registry that acts as the parent for all derived vaults.
    /// Each x_user_id maps deterministically to a unique vault address
    /// via `sui::derived_object`.
    public struct XVaultRegistry has key {
        id: UID,
        admin: address,
        paused: bool,
    }

    /// A per-user vault whose address is deterministically derived from
    /// (registry.id, x_user_id). Coins sent to the derived address can
    /// be swept in and later withdrawn by the vault owner.
    public struct XVault has key {
        id: UID,
        x_user_id: u64,
        owner: address,
        recovery_counter: u64,
    }

    /// Phantom-typed key for storing a Coin<T> as a dynamic field.
    public struct BalanceKey<phantom T> has copy, drop, store {}

    // ===== Events =====

    public struct VaultClaimed has copy, drop {
        x_user_id: u64,
        vault_id: address,
        owner: address,
    }

    public struct FundsSwept has copy, drop {
        vault_id: address,
        coin_type: String,
        amount: u64,
    }

    public struct FundsWithdrawn has copy, drop {
        vault_id: address,
        owner: address,
        coin_type: String,
        amount: u64,
    }

    public struct OwnerUpdated has copy, drop {
        x_user_id: u64,
        vault_id: address,
        old_owner: address,
        new_owner: address,
        next_recovery_counter: u64,
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
        let registry = XVaultRegistry {
            id: object::new(ctx),
            admin,
            paused: false,
        };
        sui::event::emit(RegistryCreated {
            registry_id: registry.id.to_address(),
            admin,
        });
        transfer::share_object(registry);
    }

    // ===== Public Functions =====

    /// Compute the deterministic vault address for a given x_user_id
    /// *before* the vault is claimed. This lets the front-end or
    /// tipping service send coins to the address ahead of time.
    public fun derive_vault_address(registry: &XVaultRegistry, x_user_id: u64): address {
        derived_object::derive_address(registry.id.to_inner(), x_user_id)
    }

    /// Claim a vault after verifying a Nautilus enclave attestation.
    /// The vault UID is deterministically derived from (registry, x_user_id).
    public fun claim_vault<T>(
        registry: &mut XVaultRegistry,
        enclave: &Enclave<T>,
        x_user_id: u64,
        sui_address: address,
        nonce: u64,
        expires_at: u64,
        registry_id: address,
        timestamp_ms: u64,
        signature: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext,
    ): XVault {
        assert_registry_active(registry);
        assert!(ctx.sender() == sui_address, ENotAuthorized);

        nautilus_verifier::verify_attestation(
            enclave, x_user_id, sui_address, nonce, expires_at,
            registry_id, timestamp_ms, signature, clock,
        );

        let uid = derived_object::claim(&mut registry.id, x_user_id);
        let vault_id = uid.to_address();
        let vault = XVault { id: uid, x_user_id, owner: sui_address, recovery_counter: 0 };
        sui::event::emit(VaultClaimed { x_user_id, vault_id, owner: sui_address });
        vault
    }

    /// Receive a Coin<T> that was sent to the vault's address and merge
    /// it into the vault's aggregated balance for that coin type.
    /// Intentionally not sender-gated: any PTB participant with `&mut XVault`
    /// access can sweep, which preserves sponsored claim flows where the user
    /// owns the vault object but a gas sponsor helps execute the transaction.
    public fun sweep_coin_to_vault<T>(
        registry: &XVaultRegistry,
        vault: &mut XVault,
        coin_receiving: Receiving<Coin<T>>,
    ) {
        assert_registry_active(registry);
        let coin = transfer::public_receive(&mut vault.id, coin_receiving);
        let amount = coin.value();
        if (amount == 0) {
            // Zero-value placeholders can still be transferred to the vault
            // address. Destroy them after receipt so they cannot get stuck.
            coin::destroy_zero(coin);
            return
        };
        let key = BalanceKey<T> {};

        if (df::exists_(&vault.id, key)) {
            let existing: &mut Coin<T> = df::borrow_mut(&mut vault.id, key);
            coin::join(existing, coin);
        } else {
            df::add(&mut vault.id, key, coin);
        };

        sui::event::emit(FundsSwept {
            vault_id: vault.id.to_address(),
            coin_type: event_coin_type<T>(),
            amount,
        });
    }

    /// Withdraw a specific amount of Coin<T> from the vault.
    /// Only the vault owner may call this.
    /// Remains available while the registry is paused so users can always exit.
    /// When the full balance is withdrawn, the dynamic field is removed
    /// to avoid leaving zero-value dead storage.
    public fun withdraw<T>(
        _registry: &XVaultRegistry,
        vault: &mut XVault,
        amount: u64,
        ctx: &mut TxContext,
    ): Coin<T> {
        assert!(ctx.sender() == vault.owner, ENotVaultOwner);
        assert!(amount > 0, EZeroAmount);
        let key = BalanceKey<T> {};
        assert!(df::exists_(&vault.id, key), EBalanceNotFound);
        // Remove the coin from storage so we own it outright — avoids
        // mutable-borrow conflicts between borrow_mut and remove.
        let mut existing: Coin<T> = df::remove(&mut vault.id, key);
        assert!(existing.value() >= amount, EInsufficientBalance);
        let withdrawn = if (amount == existing.value()) {
            // Exact balance: return the whole coin (field already removed)
            existing
        } else {
            let split = coin::split(&mut existing, amount, ctx);
            df::add(&mut vault.id, key, existing);
            split
        };
        sui::event::emit(FundsWithdrawn {
            vault_id: vault.id.to_address(),
            owner: vault.owner,
            coin_type: event_coin_type<T>(),
            amount,
        });
        withdrawn
    }

    /// Withdraw the entire Coin<T> balance from the vault.
    /// Only the vault owner may call this.
    /// Remains available while the registry is paused so users can always exit.
    public fun withdraw_all<T>(
        _registry: &XVaultRegistry,
        vault: &mut XVault,
        ctx: &mut TxContext,
    ): Coin<T> {
        assert!(ctx.sender() == vault.owner, ENotVaultOwner);
        let key = BalanceKey<T> {};
        assert!(df::exists_(&vault.id, key), EBalanceNotFound);
        let coin: Coin<T> = df::remove(&mut vault.id, key);
        let amount = coin.value();
        assert!(amount > 0, EZeroAmount);
        sui::event::emit(FundsWithdrawn {
            vault_id: vault.id.to_address(),
            owner: vault.owner,
            coin_type: event_coin_type<T>(),
            amount,
        });
        coin
    }

    /// Receive an arbitrary object that was sent to the vault's address.
    /// Only the vault owner may call this while the registry is active. Use
    /// to rescue non-Coin objects (NFTs, capabilities, etc.) that were
    /// accidentally transferred to the vault's derived address.
    public fun rescue_object<T: key + store>(
        registry: &XVaultRegistry,
        vault: &mut XVault,
        obj_receiving: Receiving<T>,
        ctx: &TxContext,
    ): T {
        assert_registry_active(registry);
        assert!(ctx.sender() == vault.owner, ENotVaultOwner);
        assert!(!is_coin_object_type<T>(), ECoinMustUseSweep);
        transfer::public_receive(&mut vault.id, obj_receiving)
    }

    /// Transfer vault to the transaction sender.
    /// Use as the final PTB step: claim_vault → sweep × N → transfer_vault.
    public fun transfer_vault(vault: XVault, ctx: &TxContext) {
        transfer::transfer(vault, ctx.sender());
    }

    /// Rotate vault ownership via an attested handoff that the current owner
    /// initiates. This is not a lost-key recovery path: the current owner
    /// must still submit the transaction. Consumes the address-owned vault
    /// and transfers it to the new owner so the object owner and embedded
    /// owner field stay aligned.
    public fun update_owner<T>(
        registry: &XVaultRegistry,
        enclave: &Enclave<T>,
        vault: XVault,
        new_owner: address,
        expires_at: u64,
        registry_id: address,
        timestamp_ms: u64,
        signature: vector<u8>,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        assert_registry_active(registry);
        let mut vault = vault;
        assert!(ctx.sender() == vault.owner, ENotVaultOwner);
        assert!(new_owner != vault.owner, EOwnerUnchanged);

        let current_owner = vault.owner;
        let vault_id = vault.id.to_address();
        let recovery_counter = vault.recovery_counter;
        nautilus_verifier::verify_owner_recovery_attestation(
            enclave,
            vault.x_user_id,
            vault_id,
            current_owner,
            new_owner,
            recovery_counter,
            expires_at,
            registry_id,
            timestamp_ms,
            signature,
            clock,
        );

        let next_recovery_counter = recovery_counter + 1;
        vault.owner = new_owner;
        vault.recovery_counter = next_recovery_counter;
        sui::event::emit(OwnerUpdated {
            x_user_id: vault.x_user_id,
            vault_id,
            old_owner: current_owner,
            new_owner,
            next_recovery_counter,
        });
        transfer::transfer(vault, new_owner);
    }

    public fun pause(registry: &mut XVaultRegistry, ctx: &TxContext) {
        assert!(ctx.sender() == registry.admin, ENotAdmin);
        assert!(!registry.paused, EAlreadyPaused);
        registry.paused = true;
        sui::event::emit(RegistryPaused {
            registry_id: registry.id.to_address(),
            admin: ctx.sender(),
        });
    }

    public fun unpause(registry: &mut XVaultRegistry, ctx: &TxContext) {
        assert!(ctx.sender() == registry.admin, ENotAdmin);
        assert!(registry.paused, ENotPaused);
        registry.paused = false;
        sui::event::emit(RegistryUnpaused {
            registry_id: registry.id.to_address(),
            admin: ctx.sender(),
        });
    }

    // ===== Accessors =====

    public fun vault_owner(vault: &XVault): address { vault.owner }
    public fun vault_recovery_counter(vault: &XVault): u64 { vault.recovery_counter }
    public fun vault_x_user_id(vault: &XVault): u64 { vault.x_user_id }
    public fun vault_balance<T>(vault: &XVault): u64 {
        let key = BalanceKey<T> {};
        if (df::exists_(&vault.id, key)) {
            let coin: &Coin<T> = df::borrow(&vault.id, key);
            coin.value()
        } else {
            0
        }
    }

    fun event_coin_type<T>(): String {
        type_name::into_string(type_name::with_defining_ids<T>())
    }

    fun assert_registry_active(registry: &XVaultRegistry) {
        assert!(!registry.paused, EPaused);
    }

    fun is_coin_object_type<T>(): bool {
        let tn = type_name::with_defining_ids<T>();
        type_name::address_string(&tn) ==
            ascii::string(b"0000000000000000000000000000000000000000000000000000000000000002") &&
        type_name::module_string(&tn) == ascii::string(b"coin") &&
        type_name::datatype_string(&tn) == ascii::string(b"Coin")
    }

    // ===== Test Helpers =====

    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) { init(ctx); }

    #[test_only]
    public fun registry_address_for_testing(registry: &XVaultRegistry): address {
        registry.id.to_address()
    }

    /// Test-only claim that bypasses attestation verification.
    #[test_only]
    public fun claim_vault_for_testing(
        registry: &mut XVaultRegistry,
        x_user_id: u64,
        owner: address,
        _ctx: &mut TxContext,
    ): XVault {
        assert_registry_active(registry);
        let uid = derived_object::claim(&mut registry.id, x_user_id);
        let vault_id = uid.to_address();
        let vault = XVault { id: uid, x_user_id, owner, recovery_counter: 0 };
        sui::event::emit(VaultClaimed { x_user_id, vault_id, owner });
        vault
    }
}
