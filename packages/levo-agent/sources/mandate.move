module levo_agent::mandate;

use sui::bcs;
use std::string::String;
use std::type_name::{Self, TypeName};
use sui::clock::Clock;
use sui::event;
use sui::vec_map::{Self, VecMap};

const ACTION_SEND: u32 = 1;
const ACTION_EARN_DEPOSIT: u32 = 2;
const ACTION_EARN_WITHDRAW: u32 = 4;
const ACTION_EARN_HARVEST: u32 = 8;
const ACTION_SWAP: u32 = 16;
const ACTION_PULL: u32 = 32;
const ACTION_MASK_ALL: u32 =
    ACTION_SEND | ACTION_EARN_DEPOSIT | ACTION_EARN_WITHDRAW
    | ACTION_EARN_HARVEST | ACTION_SWAP | ACTION_PULL;
const ACTION_MASK_V1: u32 = ACTION_EARN_DEPOSIT | ACTION_EARN_WITHDRAW | ACTION_EARN_HARVEST;

const MAX_PERIOD_MS: u64 = 31_536_000_000;
const MAX_TARGETS: u64 = 32;
const MAX_COIN_LIMITS: u64 = 16;
const MAX_METADATA_ENTRIES: u64 = 16;
const MAX_METADATA_KEY_LEN: u64 = 64;
const MAX_METADATA_VALUE_LEN: u64 = 256;
const MAX_WITNESS_LEN: u64 = 256;
const MAX_COMMIT_LEN: u64 = 256;
const HASH_MATERIAL_VERSION_V1: u8 = 1;

const ENotOwner: u64 = 1;
const ERevoked: u64 = 3;
const EExpired: u64 = 4;
const EInvalidActionsBitfield: u64 = 5;
const EInvalidPeriod: u64 = 6;
const EInvalidExpiry: u64 = 7;
const ENoCoinLimits: u64 = 8;
const EDuplicateCoinLimit: u64 = 9;
const EWitnessAlreadyInitialized: u64 = 10;
const EWitnessNotInitialized: u64 = 11;
const EInvalidCommit: u64 = 12;
const EActionNotAllowed: u64 = 13;
const ETargetNotAllowed: u64 = 14;
const EOverPerTxCap: u64 = 15;
const EOverPeriodCap: u64 = 16;
const EUnknownCoinType: u64 = 17;
const EMetadataLengthMismatch: u64 = 18;
const ECoinLimitLengthMismatch: u64 = 19;
const ENoAllowedTargets: u64 = 20;
const ETooManyTargets: u64 = 21;
const ETooManyCoinLimits: u64 = 22;
const ETooManyMetadata: u64 = 23;
const EActionNotImplementedYet: u64 = 24;
const EWitnessTooLong: u64 = 25;
const ECommitTooLong: u64 = 26;
const EMetadataKeyTooLong: u64 = 27;
const EMetadataValueTooLong: u64 = 28;
const EExpiryTooFar: u64 = 29;
const EMandateNotTerminal: u64 = 30;
const EInvalidCoinLimit: u64 = 31;

// SEAL PROTOCOL COMMITMENT (do not modify without coordinated Seal SDK update).
// Field order, set, and HASH_MATERIAL_VERSION_V1 are part of the off-chain commitment Seal
// MPC committee uses to derive witness commits. Any change must bump
// HASH_MATERIAL_VERSION_V1 and ship a coordinated Seal SDK / backend update.
public struct ActionCommitMaterial has copy, drop {
    version: u8,
    witness: vector<u8>,
    mandate_id: ID,
    action_type: u32,
    target: address,
    coin_type: TypeName,
    amount: u64,
    next_commit: vector<u8>,
}

// SEAL PROTOCOL COMMITMENT (do not modify without coordinated Seal SDK update).
// Same versioning rules as ActionCommitMaterial — Seal MPC re-derives this identity
// off-chain to verify the requested blob_id maps to the proposed action context.
public struct ApprovalIdentityMaterial has copy, drop {
    version: u8,
    mandate_id: ID,
    current_commit: vector<u8>,
    action_type: u32,
    target: address,
    coin_type: TypeName,
    amount: u64,
    next_commit: vector<u8>,
}

public struct CoinLimit has store, drop, copy {
    coin_type: TypeName,
    per_tx_cap: u64,
    period_cap: u64,
    period_spent: u64,
    period_start_ms: u64,
}

public struct Mandate has key {
    id: UID,
    owner: address,
    agent: address,
    actions: u32,
    coin_limits: vector<CoinLimit>,
    period_ms: u64,
    allowed_targets: vector<address>,
    expiry_ms: u64,
    witness_commit: vector<u8>,
    // Monotonic counter: 0 at create, +1 on each commit transition (init + rotations).
    // Emitted in WitnessRotated / WitnessConsumed events so off-chain indexers can
    // detect missed events without scanning the full chain.
    nonce: u64,
    revoked: bool,
    // Metadata is creation-time context for off-chain display and indexing; it is intentionally immutable.
    metadata: VecMap<String, String>,
}

public struct MandateCreated has copy, drop {
    mandate_id: ID,
    owner: address,
    agent: address,
    actions: u32,
    period_ms: u64,
    expiry_ms: u64,
}

public struct MandateRevoked has copy, drop {
    mandate_id: ID,
    by: address,
    at_ms: u64,
}

public struct MandateExpiryUpdated has copy, drop {
    mandate_id: ID,
    old_expiry_ms: u64,
    new_expiry_ms: u64,
}

public struct WitnessRotated has copy, drop {
    mandate_id: ID,
    // Empty when this rotation is the initial witness (set_initial_witness).
    previous_commit: vector<u8>,
    new_commit: vector<u8>,
    // Nonce of the resulting state (post-rotation). Init = 1, then +1 per rotation.
    nonce: u64,
}

public struct MandateDestroyed has copy, drop {
    mandate_id: ID,
    by: address,
    at_ms: u64,
    final_nonce: u64,
}

public fun create(
    agent: address,
    actions: u32,
    coin_types: vector<TypeName>,
    per_tx_caps: vector<u64>,
    period_caps: vector<u64>,
    period_ms: u64,
    allowed_targets: vector<address>,
    expiry_ms: u64,
    metadata_keys: vector<String>,
    metadata_values: vector<String>,
    clock: &Clock,
    ctx: &mut TxContext,
): Mandate {
    let owner = ctx.sender();
    let now = clock.timestamp_ms();
    assert!(actions != 0 && (actions & ACTION_MASK_ALL) == actions, EInvalidActionsBitfield);
    assert!((actions & ACTION_MASK_V1) == actions, EActionNotImplementedYet);
    assert!(period_ms > 0 && period_ms <= MAX_PERIOD_MS, EInvalidPeriod);
    assert!(expiry_ms > now, EInvalidExpiry);
    assert!(expiry_ms - now <= MAX_PERIOD_MS, EExpiryTooFar);
    assert!(!allowed_targets.is_empty(), ENoAllowedTargets);
    assert!(allowed_targets.length() <= MAX_TARGETS, ETooManyTargets);

    let n = coin_types.length();
    assert!(n > 0, ENoCoinLimits);
    assert!(n <= MAX_COIN_LIMITS, ETooManyCoinLimits);
    assert!(per_tx_caps.length() == n && period_caps.length() == n, ECoinLimitLengthMismatch);

    let mut coin_limits = vector::empty<CoinLimit>();
    let mut i = 0;
    while (i < n) {
        let ct = *coin_types.borrow(i);
        let per_tx = *per_tx_caps.borrow(i);
        let period = *period_caps.borrow(i);
        assert!(per_tx > 0 && period > 0 && per_tx <= period, EInvalidCoinLimit);
        let mut j = 0;
        while (j < coin_limits.length()) {
            assert!(coin_limits.borrow(j).coin_type != ct, EDuplicateCoinLimit);
            j = j + 1;
        };
        coin_limits.push_back(CoinLimit {
            coin_type: ct,
            per_tx_cap: per_tx,
            period_cap: period,
            period_spent: 0,
            period_start_ms: now,
        });
        i = i + 1;
    };

    assert!(metadata_keys.length() == metadata_values.length(), EMetadataLengthMismatch);
    assert!(metadata_keys.length() <= MAX_METADATA_ENTRIES, ETooManyMetadata);
    let mut metadata = vec_map::empty<String, String>();
    let mut k = 0;
    while (k < metadata_keys.length()) {
        assert!(metadata_keys.borrow(k).as_bytes().length() <= MAX_METADATA_KEY_LEN, EMetadataKeyTooLong);
        assert!(metadata_values.borrow(k).as_bytes().length() <= MAX_METADATA_VALUE_LEN, EMetadataValueTooLong);
        metadata.insert(*metadata_keys.borrow(k), *metadata_values.borrow(k));
        k = k + 1;
    };

    let mandate = Mandate {
        id: object::new(ctx),
        owner,
        agent,
        actions,
        coin_limits,
        period_ms,
        allowed_targets,
        expiry_ms,
        witness_commit: vector::empty(),
        nonce: 0,
        revoked: false,
        metadata,
    };

    event::emit(MandateCreated {
        mandate_id: object::id(&mandate),
        owner,
        agent,
        actions,
        period_ms,
        expiry_ms,
    });

    mandate
}

public fun share(mandate: Mandate) {
    transfer::share_object(mandate);
}

// Owner-only initial witness setup. Closes F-5: agent KMS compromise before init
// can no longer bypass Seal because owner is the on-chain authority for the first commit.
// UX: owner signs one extra setup tx after Seal returns the initial commit.
public fun set_initial_witness(
    mandate: &mut Mandate,
    commit: vector<u8>,
    clock: &Clock,
    ctx: &TxContext,
) {
    assert!(ctx.sender() == mandate.owner, ENotOwner);
    mandate.assert_active(clock);
    assert!(!commit.is_empty(), EInvalidCommit);
    assert!(commit.length() <= MAX_COMMIT_LEN, ECommitTooLong);
    assert!(mandate.witness_commit.is_empty(), EWitnessAlreadyInitialized);
    mandate.witness_commit = commit;
    mandate.nonce = mandate.nonce + 1;
    event::emit(WitnessRotated {
        mandate_id: object::id(mandate),
        previous_commit: vector::empty(),
        new_commit: commit,
        nonce: mandate.nonce,
    });
}

public fun revoke(mandate: &mut Mandate, clock: &Clock, ctx: &TxContext) {
    assert!(ctx.sender() == mandate.owner, ENotOwner);
    mandate.revoked = true;
    event::emit(MandateRevoked {
        mandate_id: object::id(mandate),
        by: ctx.sender(),
        at_ms: clock.timestamp_ms(),
    });
}

public fun update_expiry(
    mandate: &mut Mandate,
    new_expiry_ms: u64,
    clock: &Clock,
    ctx: &TxContext,
) {
    assert!(ctx.sender() == mandate.owner, ENotOwner);
    assert!(!mandate.revoked, ERevoked);
    let now = clock.timestamp_ms();
    assert!(new_expiry_ms > now, EInvalidExpiry);
    assert!(new_expiry_ms - now <= MAX_PERIOD_MS, EExpiryTooFar);
    let old = mandate.expiry_ms;
    mandate.expiry_ms = new_expiry_ms;
    event::emit(MandateExpiryUpdated {
        mandate_id: object::id(mandate),
        old_expiry_ms: old,
        new_expiry_ms,
    });
}

// Owner reclaims a terminated mandate (revoked or past expiry) to free storage rebate.
// Closes N-2. Audit history is preserved via events (MandateRevoked / MandateDestroyed).
public fun destroy_terminated(mandate: Mandate, clock: &Clock, ctx: &TxContext) {
    assert!(ctx.sender() == mandate.owner, ENotOwner);
    let now = clock.timestamp_ms();
    assert!(mandate.revoked || now >= mandate.expiry_ms, EMandateNotTerminal);
    let mandate_id = object::id(&mandate);
    let final_nonce = mandate.nonce;
    let Mandate {
        id,
        owner: _,
        agent: _,
        actions: _,
        coin_limits: _,
        period_ms: _,
        allowed_targets: _,
        expiry_ms: _,
        witness_commit: _,
        nonce: _,
        revoked: _,
        metadata: _,
    } = mandate;
    id.delete();
    event::emit(MandateDestroyed { mandate_id, by: ctx.sender(), at_ms: now, final_nonce });
}

public(package) fun assert_active(mandate: &Mandate, clock: &Clock) {
    assert!(!mandate.revoked, ERevoked);
    assert!(clock.timestamp_ms() < mandate.expiry_ms, EExpired);
}

public(package) fun assert_action_allowed(mandate: &Mandate, action: u32) {
    assert!(is_single_action(action), EActionNotAllowed);
    assert!(is_v1_action(action), EActionNotImplementedYet);
    assert!(mandate.actions & action != 0, EActionNotAllowed);
}

public(package) fun assert_target_allowed(mandate: &Mandate, target: address) {
    assert!(!mandate.allowed_targets.is_empty(), ENoAllowedTargets);
    let mut i = 0;
    let n = mandate.allowed_targets.length();
    while (i < n) {
        if (*mandate.allowed_targets.borrow(i) == target) return;
        i = i + 1;
    };
    abort ETargetNotAllowed
}

public(package) fun coin_limit_mut<C>(mandate: &mut Mandate): &mut CoinLimit {
    let ct = type_name::with_defining_ids<C>();
    let mut i = 0;
    let n = mandate.coin_limits.length();
    while (i < n) {
        if (mandate.coin_limits.borrow(i).coin_type == ct) {
            return mandate.coin_limits.borrow_mut(i)
        };
        i = i + 1;
    };
    abort EUnknownCoinType
}

public(package) fun limit_check_and_consume(
    limit: &mut CoinLimit,
    amount: u64,
    period_ms: u64,
    now_ms: u64,
) {
    assert!(amount <= limit.per_tx_cap, EOverPerTxCap);
    if (now_ms >= limit.period_start_ms && now_ms - limit.period_start_ms >= period_ms) {
        limit.period_start_ms = now_ms;
        limit.period_spent = 0;
    };
    assert!(limit.period_spent <= limit.period_cap, EOverPeriodCap);
    assert!(amount <= limit.period_cap - limit.period_spent, EOverPeriodCap);
    limit.period_spent = limit.period_spent + amount;
}

public(package) fun rotate_witness(
    mandate: &mut Mandate,
    witness: &vector<u8>,
    action_type: u32,
    target: address,
    coin_type: TypeName,
    amount: u64,
    next_commit: vector<u8>,
) {
    assert!(!mandate.witness_commit.is_empty(), EWitnessNotInitialized);
    assert!(witness.length() <= MAX_WITNESS_LEN, EWitnessTooLong);
    assert!(!next_commit.is_empty(), EInvalidCommit);
    assert!(next_commit.length() <= MAX_COMMIT_LEN, ECommitTooLong);
    assert!(next_commit != mandate.witness_commit, EInvalidCommit);
    let provided_hash = derive_action_commit_for_type(
        witness,
        object::id(mandate),
        action_type,
        target,
        coin_type,
        amount,
        &next_commit,
    );
    assert!(provided_hash == mandate.witness_commit, EInvalidCommit);
    let previous_commit = mandate.witness_commit;
    mandate.witness_commit = next_commit;
    mandate.nonce = mandate.nonce + 1;
    event::emit(WitnessRotated {
        mandate_id: object::id(mandate),
        previous_commit,
        new_commit: mandate.witness_commit,
        nonce: mandate.nonce,
    });
}

public fun derive_action_commit<C>(
    witness: &vector<u8>,
    mandate_id: ID,
    action_type: u32,
    target: address,
    amount: u64,
    next_commit: &vector<u8>,
): vector<u8> {
    derive_action_commit_for_type(
        witness,
        mandate_id,
        action_type,
        target,
        type_name::with_defining_ids<C>(),
        amount,
        next_commit,
    )
}

public fun derive_action_commit_for_type(
    witness: &vector<u8>,
    mandate_id: ID,
    action_type: u32,
    target: address,
    coin_type: TypeName,
    amount: u64,
    next_commit: &vector<u8>,
): vector<u8> {
    let material = ActionCommitMaterial {
        version: HASH_MATERIAL_VERSION_V1,
        witness: *witness,
        mandate_id,
        action_type,
        target,
        coin_type,
        amount,
        next_commit: *next_commit,
    };
    sui::hash::blake2b256(&bcs::to_bytes(&material))
}

public fun derive_approval_id(
    mandate: &Mandate,
    action_type: u32,
    target: address,
    coin_type: TypeName,
    amount: u64,
    next_commit: &vector<u8>,
): vector<u8> {
    let material = ApprovalIdentityMaterial {
        version: HASH_MATERIAL_VERSION_V1,
        mandate_id: object::id(mandate),
        current_commit: mandate.witness_commit,
        action_type,
        target,
        coin_type,
        amount,
        next_commit: *next_commit,
    };
    sui::hash::blake2b256(&bcs::to_bytes(&material))
}

public fun derive_approval_id_with_type<C>(
    mandate: &Mandate,
    action_type: u32,
    target: address,
    amount: u64,
    next_commit: &vector<u8>,
): vector<u8> {
    derive_approval_id(
        mandate,
        action_type,
        target,
        type_name::with_defining_ids<C>(),
        amount,
        next_commit,
    )
}

public fun is_single_action(action: u32): bool {
    action != 0 && (action & (action - 1)) == 0
}

public fun is_v1_action(action: u32): bool {
    is_single_action(action) && (ACTION_MASK_V1 & action) != 0
}

public fun valid_commit_len(commit: &vector<u8>): bool {
    !commit.is_empty() && commit.length() <= MAX_COMMIT_LEN
}

public fun id(m: &Mandate): ID { object::id(m) }
public fun owner(m: &Mandate): address { m.owner }
public fun agent(m: &Mandate): address { m.agent }
public fun actions(m: &Mandate): u32 { m.actions }
public fun period_ms(m: &Mandate): u64 { m.period_ms }
public fun expiry_ms(m: &Mandate): u64 { m.expiry_ms }
public fun revoked(m: &Mandate): bool { m.revoked }
public fun nonce(m: &Mandate): u64 { m.nonce }
public fun allowed_targets(m: &Mandate): &vector<address> { &m.allowed_targets }
public fun witness_commit(m: &Mandate): &vector<u8> { &m.witness_commit }
public fun metadata(m: &Mandate): &VecMap<String, String> { &m.metadata }
public fun coin_limits(m: &Mandate): &vector<CoinLimit> { &m.coin_limits }

public fun coin_limit_coin_type(l: &CoinLimit): TypeName { l.coin_type }
public fun coin_limit_per_tx_cap(l: &CoinLimit): u64 { l.per_tx_cap }
public fun coin_limit_period_cap(l: &CoinLimit): u64 { l.period_cap }
public fun coin_limit_period_spent(l: &CoinLimit): u64 { l.period_spent }
public fun coin_limit_period_start_ms(l: &CoinLimit): u64 { l.period_start_ms }

public fun action_send(): u32 { ACTION_SEND }
public fun action_earn_deposit(): u32 { ACTION_EARN_DEPOSIT }
public fun action_earn_withdraw(): u32 { ACTION_EARN_WITHDRAW }
public fun action_earn_harvest(): u32 { ACTION_EARN_HARVEST }
public fun action_swap(): u32 { ACTION_SWAP }
public fun action_pull(): u32 { ACTION_PULL }

#[test_only]
public fun clear_allowed_targets_for_testing(mandate: &mut Mandate) {
    mandate.allowed_targets = vector::empty();
}

#[test_only]
public fun destroy_for_testing(mandate: Mandate) {
    let Mandate {
        id,
        owner: _,
        agent: _,
        actions: _,
        coin_limits: _,
        period_ms: _,
        allowed_targets: _,
        expiry_ms: _,
        witness_commit: _,
        nonce: _,
        revoked: _,
        metadata: _,
    } = mandate;
    id.delete();
}
