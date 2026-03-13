# Phase 1: Move Contracts + Mock Token — Implementation Plan

> **For implementers:** Follow the checked-in source and tests in this repo. Do not depend on unavailable external skills or stale inline snippets.

**Goal:** Deploy the core Sui Move contracts (vault registry, claim/sweep/withdraw, attestation verifier, mock stablecoin) to testnet with all tests passing.

**Architecture:** Three Move modules in a single package: `x_vault` (registry + vault lifecycle), `nautilus_verifier` (enclave pubkey registration + Ed25519 attestation verification), and `test_usdc` (mock stablecoin with public mint). Vaults use Sui Derived Objects for deterministic address derivation from X user IDs. Coins are received via Transfer-to-Object pattern and merged into dynamic fields per coin type.

**Tech Stack:** Sui Move (2024.beta edition), Sui CLI, Sui testnet

> **Source of truth:** The checked-in implementation under `packages/contracts/`, the root `package.json`, and the committed Move tests are authoritative. Use this document for sequencing, rationale, and deployment notes. If any inline snippet here disagrees with the repo, follow the repo and update the doc instead of copying the stale snippet forward.

---

## Task 1: Project Scaffolding

**Files:**
- Create: `packages/contracts/Move.toml`
- Commit: `packages/contracts/Move.lock`
- Create: `packages/contracts/sources/.gitkeep` (placeholder, removed later)
- Create: `packages/contracts/tests/.gitkeep` (placeholder, removed later)

**Step 1: Create directory structure**

```bash
cd <repo-root>
mkdir -p packages/contracts/sources packages/contracts/tests
```

**Step 2: Create Move.toml**

Create `packages/contracts/Move.toml`:

```toml
[package]
name = "levo"
edition = "2024.beta"

[dependencies]
Sui = { git = "https://github.com/MystenLabs/sui.git", subdir = "crates/sui-framework/packages/sui-framework", rev = "framework/testnet" }

[addresses]
levo = "0x0"
```

**Step 3: Verify the project compiles**

```bash
cd packages/contracts && sui move build
```

Expected: Build succeeds (empty package, no errors).

This first build also writes `packages/contracts/Move.lock`. Check that lockfile into source control so everyone resolves the same pinned Sui framework revision from the moving `framework/testnet` dependency.

**Step 4: Commit**

```bash
git add packages/contracts/Move.toml packages/contracts/Move.lock
git commit -m "feat: scaffold Move package with Sui testnet dependency"
```

---

## Task 2: Mock Stablecoin (`test_usdc`)

**Files:**
- Create: `packages/contracts/sources/test_usdc.move`

**Step 1: Write test_usdc module**

Create `packages/contracts/sources/test_usdc.move`:

```move
module levo::test_usdc {
    use sui::coin;

    /// One-time witness for coin registration
    public struct TEST_USDC has drop {}

    /// Called on module publish. Creates the TEST_USDC coin type
    /// and shares the TreasuryCap so anyone can mint on testnet.
    fun init(witness: TEST_USDC, ctx: &mut TxContext) {
        let (treasury_cap, metadata) = coin::create_currency(
            witness,
            6, // 6 decimals like real USDC
            b"TUSDC",
            b"Test USDC",
            b"Mock USDC for Levo testnet",
            option::none(),
            ctx,
        );
        transfer::public_share_object(treasury_cap);
        transfer::public_freeze_object(metadata);
    }

    /// Anyone can mint TEST_USDC on testnet.
    public fun mint(
        treasury_cap: &mut coin::TreasuryCap<TEST_USDC>,
        amount: u64,
        recipient: address,
        ctx: &mut TxContext,
    ) {
        let coin = coin::mint(treasury_cap, amount, ctx);
        transfer::public_transfer(coin, recipient);
    }
}
```

**Step 2: Build to verify compilation**

```bash
sui move build
```

Expected: Build succeeds.

**Step 3: Commit**

```bash
git add packages/contracts/sources/test_usdc.move
git commit -m "feat: add TEST_USDC mock stablecoin with public mint"
```

---

## Task 3: Nautilus Verifier Module

**Files:**
- Create: `packages/contracts/sources/nautilus_verifier.move`
- Create: `packages/contracts/tests/nautilus_verifier_tests.move`

**Step 1: Write the nautilus_verifier module**

Create `packages/contracts/sources/nautilus_verifier.move` using the checked-in source as reference:

```move
// See packages/contracts/sources/nautilus_verifier.move for the full implementation.
// Inline code removed to prevent drift from the checked-in source.
```

> **Source of truth:** [`packages/contracts/sources/nautilus_verifier.move`](../../packages/contracts/sources/nautilus_verifier.move)
>
> Key elements to implement:
> - `EnclaveRegistry` with `admin`, `paused`, and registered pubkeys
> - `AttestationMessage` with `registry_id` domain separation
> - `OwnerRecoveryMessage` for owner handoff attestations
> - Admin entrypoints: `register_pubkey`, `remove_pubkey`, `pause`, `unpause`
> - Audit events: `PubkeyRegistered`, `PubkeyRemoved`, `RegistryPaused`, `RegistryUnpaused`
> - Verification entrypoints: `verify_attestation`, `verify_owner_recovery_attestation`
> - Test helpers: `init_for_testing`, `registry_address_for_testing`

**Step 2: Write tests for nautilus_verifier**

Use the checked-in verifier tests as the authoritative implementation:

- Source of truth: [`packages/contracts/tests/nautilus_verifier_tests.move`](../../packages/contracts/tests/nautilus_verifier_tests.move)
- Supporting module: [`packages/contracts/sources/nautilus_verifier.move`](../../packages/contracts/sources/nautilus_verifier.move)

The current suite covers:

- admin-only key registration
- duplicate-key rejection
- invalid pubkey length rejection
- missing-key removal rejection
- valid attestation verification
- valid owner-handoff attestation verification
- expired attestation rejection
- wrong-signature rejection
- wrong owner-handoff payload rejection
- cross-registry replay rejection
- pause gate on verification

The checked-in fixture constants are generated by [`packages/contracts/scripts/generate-test-vectors.ts`](../../packages/contracts/scripts/generate-test-vectors.ts) and should stay aligned with both verifier and integration tests.

**Step 3: Build and run tests**

```bash
sui move build && sui move test
```

Expected: All verifier tests pass, including the real-signature and cross-registry replay cases.

**Step 4: Commit**

```bash
git add packages/contracts/sources/nautilus_verifier.move packages/contracts/tests/nautilus_verifier_tests.move
git commit -m "feat: add nautilus_verifier module with Ed25519 attestation verification"
```

---

## Task 4: XVaultRegistry + derive_vault_address

**Files:**
- Create: `packages/contracts/sources/x_vault.move`
- Create: `packages/contracts/tests/x_vault_tests.move`

**Step 1: Write the x_vault module**

Create `packages/contracts/sources/x_vault.move` using the checked-in source as reference:

> **Source of truth:** [`packages/contracts/sources/x_vault.move`](../../packages/contracts/sources/x_vault.move)
>
> Key elements to implement:
> - `XVaultRegistry` (shared) — namespace root for all derived vaults
> - `XVault` (key only, no store) — per-user vault with `owner` field
> - `BalanceKey<phantom T>` — dynamic field key for per-coin-type balances
> - `derive_vault_address` — deterministic address via `sui::derived_object`
> - `claim_vault` — attestation-gated claim using `nautilus_verifier`
> - `sweep_coin_to_vault<T>` — receive and merge `Coin<T>` via `Receiving`
> - `withdraw<T>` — partial withdrawal; removes dynamic field on exact balance
> - `withdraw_all<T>` — full withdrawal; removes the dynamic field
> - `rescue_object<T>` — owner-gated recovery for non-coin objects (blocks `Coin<_>` specifically)
> - `transfer_vault` — module-controlled transfer (required since `XVault` has no `store`)
> - Events: `VaultClaimed`, `FundsSwept`, `FundsWithdrawn`, `OwnerUpdated`, `RegistryPaused`, `RegistryUnpaused`
> - `FundsSwept` and `FundsWithdrawn` include `coin_type: String`
> - Error constants: `ENotVaultOwner`, `ENotAuthorized`, `EInsufficientBalance`, `ECoinMustUseSweep`, `EBalanceNotFound`

```move
// See packages/contracts/sources/x_vault.move for the full implementation.
// Inline code removed to prevent drift from the checked-in source.
```

**Step 2: Write initial tests**

Create `packages/contracts/tests/x_vault_tests.move` using the checked-in tests as reference:

> **Source of truth:** [`packages/contracts/tests/x_vault_tests.move`](../../packages/contracts/tests/x_vault_tests.move)
>
> Tests to implement (current suite covers all of these):
> - `test_derive_address_is_deterministic` — same input produces same address
> - `test_derive_different_users_get_different_addresses` — distinct users get distinct addresses
> - `test_claim_vault` — owner and x_user_id are set correctly
> - `test_sweep_single_coin` — receive and merge a single `Coin<SUI>`
> - `test_withdraw_partial` — partial withdrawal leaves correct remainder
> - `test_withdraw_all` — full withdrawal empties the dynamic field
> - `test_withdraw_not_owner` — non-owner withdrawal aborts with `ENotVaultOwner`
> - `test_multi_asset_sweep_and_withdraw` — SUI + TEST_USDC in the same vault
> - `test_rescue_object` / `test_rescue_object_not_owner` — non-coin object recovery
> - `test_rescue_object_rejects_coin` — `Coin<T>` blocked with `ECoinMustUseSweep`

```move
// See packages/contracts/tests/x_vault_tests.move for the full test suite.
// Inline code removed to prevent drift from the checked-in source.
```

**Step 3: Build and test**

```bash
sui move build && sui move test
```

Expected: All tests pass. If any test_scenario API for `Receiving` differs from what's written, adjust the API calls (see troubleshooting notes below).

**Troubleshooting — Receiving in test_scenario:**
- If `test_scenario::receiving_ticket_by_id` doesn't exist, try `test_scenario::take_receiving<T>(parent_id)` or `sui::test_utils::receiving_ticket_by_id<T>(id)`.
- If `test_scenario::most_recent_id_for_address` doesn't exist, try `test_scenario::most_recent_id_shared<T>()` or track the object ID manually from the mint step using `object::id(&coin)` before transferring.
- Consult: `sui move build --doc` to check available test_scenario functions.

**Step 4: Commit**

```bash
git add packages/contracts/sources/x_vault.move packages/contracts/tests/x_vault_tests.move
git commit -m "feat: add x_vault module with registry, derive, claim, sweep, withdraw"
```

---

## Task 5: Derived Object API Verification

The `sui::derived_object` module is relatively new. If the build fails because the module doesn't exist, apply this fallback.

**Step 1: Check if `sui::derived_object` exists**

```bash
sui move build 2>&1 | grep -i "derived_object"
```

**If the module exists:** Skip to Task 6.

**If the module does NOT exist — Fallback approach:**

Replace `derived_object` usage with manual deterministic address computation using `sui::hash` and `sui::bcs`:

In `x_vault.move`, replace the imports and relevant functions:

```move
// Replace: use sui::derived_object;
use sui::hash;
use sui::bcs;

/// Manual derivation: blake2b256(parent_id || bcs(x_user_id))
public fun derive_vault_address(
    registry: &XVaultRegistry,
    x_user_id: u64,
): address {
    let mut data = bcs::to_bytes(&object::uid_to_inner(&registry.id));
    vector::append(&mut data, bcs::to_bytes(&x_user_id));
    let hash_bytes = hash::blake2b256(&data);
    sui::address::from_bytes(hash_bytes)
}
```

For `claim`, the fallback would need `object::new_uid_from_hash` which is package-private. If unavailable, restructure to use a `Table<u64, address>` mapping in the registry instead of derived objects:

```move
use sui::table::{Self, Table};

public struct XVaultRegistry has key {
    id: UID,
    vaults: Table<u64, address>, // x_user_id -> vault object ID
}

public fun claim_vault(/* ... */) {
    assert!(!table::contains(&registry.vaults, x_user_id), EVaultAlreadyClaimed);
    let vault = XVault { id: object::new(ctx), x_user_id, owner: sui_address };
    let vault_addr = object::uid_to_address(&vault.id);
    table::add(&mut registry.vaults, x_user_id, vault_addr);
    vault
}
```

**Note:** This fallback changes the architecture — vault addresses are no longer deterministic before creation. The "send before claim" pattern would need a two-step approach (create vault first, then send to it). Document this trade-off if the fallback is needed.

---

## Task 6: Integration Tests — End-to-End Claim and Sweep Flows

**Files:**
- Create: `packages/contracts/tests/integration_tests.move`

The integration suite should be maintained in the checked-in file rather than copied from this document.

**Step 1: Use the checked-in integration suite as the source of truth**

Primary file:

- [`packages/contracts/tests/integration_tests.move`](../../packages/contracts/tests/integration_tests.move)

Current authoritative coverage:

- `test_full_flow_send_claim_sweep_withdraw`
- `test_claim_with_attestation`
- `test_claim_wrong_sender`
- `test_send_before_vault_exists`
- `test_duplicate_claim_rejected`
- `test_lifecycle_pre_and_post_claim_sends`
- `test_update_owner_transfers_vault_with_attested_handoff`
- `test_update_owner_replay_rejected_after_handoff`
- `test_update_owner_rejected_when_vault_registry_paused`
- `test_update_owner_rejected_when_enclave_registry_paused`
- `test_claim_rejected_when_vault_registry_paused`

Important implementation details that must stay in sync with the checked-in tests:

- initialize `nautilus_verifier` before `x_vault` in any test that reuses the committed attestation fixtures, because `registry_id` is part of the signed payload
- transfer claimed vaults with `x_vault::transfer_vault(...)`, not `transfer::public_transfer`
- use current `test_scenario` helpers such as `test_scenario::return_shared(...)` and `test_scenario::return_to_address(...)`

**Step 2: Build and run all tests**

```bash
sui move test
```

Expected: All tests pass.

**Step 3: Commit**

```bash
git add packages/contracts/tests/integration_tests.move
git commit -m "test: add integration tests for full send/claim/sweep/withdraw flow"
```

---

## Task 7: Test Vector Generation Script

**Files:**
- Create: `packages/contracts/scripts/generate-test-vectors.ts`
- Modify: `packages/contracts/tests/nautilus_verifier_tests.move` (update constants)

Generate real Ed25519 test vectors so the attestation verification tests use actual cryptographic signatures.

**Step 1: Use the checked-in script and fixtures**

Source files:

- [`packages/contracts/scripts/generate-test-vectors.ts`](../../packages/contracts/scripts/generate-test-vectors.ts)
- [`package.json`](../../package.json)
- [`packages/contracts/tests/nautilus_verifier_tests.move`](../../packages/contracts/tests/nautilus_verifier_tests.move)
- [`packages/contracts/tests/integration_tests.move`](../../packages/contracts/tests/integration_tests.move)

Current fixture note:

- the checked-in Move tests were generated with `npm run generate:test-vectors -- 0x34401905bebdf8c04f3cd5f04f442a39372c8dc321c29edfb4f9cb30b23ab96`
- if the registry creation order changes, regenerate both Move test files together so `registry_id` stays aligned with the signed message
- if you also refresh the owner-handoff fixtures, pass the deterministic test vault id as well: `npm run generate:test-vectors -- <registry_id_hex> <vault_id_hex> [new_owner_hex]`
- to recover a changed test `registry_id`, print `nautilus_verifier::registry_address_for_testing(&registry)` from a Move test before regenerating fixtures

**Step 2: Run the script**

Use the checked-in root `package-lock.json` so fixture regeneration stays reproducible across fresh checkouts.

```bash
cd <repo-root>
npm ci
npm run generate:test-vectors -- <registry_id_hex>

# Also emit owner-handoff fixtures when TEST_VAULT_ID / TEST_RECOVERY_SIGNATURE
# need to be refreshed.
npm run generate:test-vectors -- <registry_id_hex> <vault_id_hex> [new_owner_hex]
```

**Step 3: Update test constants**

If the claim fixture changes, update the emitted claim constants in both `packages/contracts/tests/nautilus_verifier_tests.move` and `packages/contracts/tests/integration_tests.move`. If you regenerate the owner-handoff fixture too, also update `TEST_VAULT_ID`, `TEST_NEW_OWNER`, and `TEST_RECOVERY_SIGNATURE` anywhere they are emitted.

**Step 4: Run tests**

```bash
cd packages/contracts && sui move test
```

Expected: All tests pass, including the positive attestation verification and cross-registry replay tests.

**Step 5: Commit**

```bash
git add packages/contracts/scripts/generate-test-vectors.ts packages/contracts/tests/nautilus_verifier_tests.move packages/contracts/tests/integration_tests.move
git commit -m "feat: add test vector generator and wire real Ed25519 verification tests"
```

---

## Task 8: Attestation-Gated Claim Integration Test

**Files:**
- Modify: `packages/contracts/tests/integration_tests.move`

**Step 1: Keep the attestation claim tests in the checked-in integration suite**

Source of truth:

- [`packages/contracts/tests/integration_tests.move`](../../packages/contracts/tests/integration_tests.move)

The attestation-specific cases are:

- `test_claim_with_attestation`
- `test_claim_wrong_sender`

Important invariants:

- initialize `nautilus_verifier` before `x_vault` when using the checked-in fixtures
- keep the attestation constants synchronized with `nautilus_verifier_tests.move`
- transfer the claimed vault with `x_vault::transfer_vault(...)`

**Step 2: Run all tests**

```bash
sui move test
```

Expected: All tests pass.

**Step 3: Commit**

```bash
git add packages/contracts/tests/integration_tests.move
git commit -m "test: add attestation-gated claim tests with real Ed25519 signatures"
```

---

## Task 9: Send Before Claim — Transfer-to-Object Verification

**Files:**
- Modify: `packages/contracts/tests/integration_tests.move`

Verify that the core "send to handle" pattern works: coins transferred to a derived address BEFORE the vault exists can be swept AFTER claim.

**Step 1: Use the checked-in lifecycle tests**

Source of truth:

- [`packages/contracts/tests/integration_tests.move`](../../packages/contracts/tests/integration_tests.move)

The lifecycle coverage now lives in:

- `test_send_before_vault_exists`
- `test_lifecycle_pre_and_post_claim_sends`

These tests cover:

- deriving the vault address before claim
- transferring coins to the derived address before the vault object exists
- claiming the vault and sweeping queued objects
- sending additional coins after claim and sweeping them in a follow-up transaction

**Step 2: Run tests**

```bash
sui move test
```

**Step 3: Commit**

```bash
git add packages/contracts/tests/integration_tests.move
git commit -m "test: verify pre-claim and post-claim send + sweep lifecycle"
```

---

## Task 10: Deploy to Sui Testnet

**Prerequisites:**
- Sui CLI installed and configured
- Active testnet address with SUI for gas: `sui client active-address`
- Testnet faucet: `sui client faucet`

**Step 1: Ensure all tests pass**

```bash
cd packages/contracts && sui move test
```

**Step 2: Publish to testnet**

```bash
sui client publish --gas-budget 100000000
```

**Step 3: Record deployment artifacts**

From the publish output, record:
- **Package ID**: the published package address
- **XVaultRegistry object ID**: from the created shared objects
- **EnclaveRegistry object ID**: from the created shared objects
- **TEST_USDC TreasuryCap object ID**: for minting test tokens
- **TEST_USDC CoinMetadata object ID**: for coin type reference
- **UpgradeCap object ID**: for future package upgrades

Create `packages/contracts/deployed.testnet.json`:

```json
{
  "network": "testnet",
  "packageId": "<PACKAGE_ID>",
  "xVaultRegistryId": "<X_VAULT_REGISTRY_OBJECT_ID>",
  "enclaveRegistryId": "<ENCLAVE_REGISTRY_OBJECT_ID>",
  "enclavePubkeyNote": "TEST ONLY — the registered enclave public key is deterministically derived from packages/contracts/scripts/generate-test-vectors.ts and is publicly known. Rotate and revoke it before any production deployment.",
  "testUsdcTreasuryCapId": "<TREASURY_CAP_ID>",
  "testUsdcCoinMetadataId": "<COIN_METADATA_ID>",
  "testUsdcType": "<PACKAGE_ID>::test_usdc::TEST_USDC",
  "upgradeCapId": "<UPGRADE_CAP_ID>",
  "deployedAt": "<YYYY-MM-DD>",
  "deployTxDigest": "<TX_DIGEST>"
}
```

**Step 4: Register mock signer pubkey on testnet**

```bash
sui client call \
  --package <PACKAGE_ID> \
  --module nautilus_verifier \
  --function register_pubkey \
  --args <ENCLAVE_REGISTRY_ID> <TEST_PUBKEY_HEX> \
  --gas-budget 10000000
```

The checked-in test-vector generator uses a deterministic test-only private key, so the
corresponding pubkey is public knowledge. Treat this as an intentional testnet-only risk and
rotate/revoke the key before any staging or mainnet-style deployment.

**Step 5: Smoke test — mint test USDC**

```bash
sui client call \
  --package <PACKAGE_ID> \
  --module test_usdc \
  --function mint \
  --args <TREASURY_CAP_ID> 1000000000 <YOUR_ADDRESS> \
  --gas-budget 10000000
```

**Step 6: Commit deployment artifacts**

```bash
git add packages/contracts/deployed.testnet.json
git commit -m "chore: deploy Phase 1 contracts to Sui testnet"
```

---

## Summary

| Task | What | Test Coverage |
|------|------|---------------|
| 1 | Scaffolding + Move.toml | Build compiles |
| 2 | test_usdc mock coin | Build compiles |
| 3 | nautilus_verifier (register + verify) | Admin auth, duplicate, expiration |
| 4 | x_vault (registry, derive, claim, sweep, withdraw) | Determinism, ownership, balances |
| 5 | Derived Object API fallback (if needed) | — |
| 6 | Integration tests (full flow) | End-to-end send/claim/sweep/withdraw |
| 7 | Test vector generation | Real Ed25519 crypto test vectors |
| 8 | Attestation-gated claim tests | Signature verification, wrong sender rejection |
| 9 | Pre/post-claim lifecycle tests | Transfer-to-Object pattern verification |
| 10 | Deploy to Sui testnet | Smoke test on live network |
