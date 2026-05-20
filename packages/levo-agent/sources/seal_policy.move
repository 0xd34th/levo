module levo_agent::seal_policy;

use std::type_name::{Self, TypeName};
use sui::clock::Clock;

use levo_agent::mandate::{Self, Mandate};

const ENotApproved: u64 = 1;
const EInvalidApprovalId: u64 = 2;
const ENotAgent: u64 = 3;

// Coin type is passed as a Move type parameter `<C>` rather than as a value
// argument. This is required for Seal MPC compatibility: PTBs containing chained
// `moveCall` results (the only way to pass non-pure struct args) are rejected by
// the Mysten Seal aggregator, and `TypeName` cannot be passed as a pure value.
public fun seal_approve<C>(
    id: vector<u8>,
    mandate: &Mandate,
    proposed_action: u32,
    proposed_target: address,
    proposed_amount: u64,
    proposed_next_commit: vector<u8>,
    clock: &Clock,
    ctx: &sui::tx_context::TxContext,
) {
    let proposed_coin_type = type_name::with_defining_ids<C>();
    assert!(ctx.sender() == mandate.agent(), ENotAgent);
    assert!(mandate::valid_commit_len(&proposed_next_commit), ENotApproved);
    assert!(
        id == mandate::derive_approval_id(
            mandate,
            proposed_action,
            proposed_target,
            proposed_coin_type,
            proposed_amount,
            &proposed_next_commit,
        ),
        EInvalidApprovalId,
    );
    assert!(
        check(
            mandate,
            proposed_action,
            proposed_target,
            proposed_coin_type,
            proposed_amount,
            proposed_next_commit,
            clock,
        ),
        ENotApproved,
    );
}

public fun check(
    mandate: &Mandate,
    proposed_action: u32,
    proposed_target: address,
    proposed_coin_type: TypeName,
    proposed_amount: u64,
    proposed_next_commit: vector<u8>,
    clock: &Clock,
): bool {
    if (mandate.revoked()) return false;
    if (clock.timestamp_ms() >= mandate.expiry_ms()) return false;
    // is_v1_action implies is_single_action; valid_commit_len implies !is_empty.
    if (!mandate::is_v1_action(proposed_action)) return false;
    if (mandate.actions() & proposed_action == 0) return false;
    if (proposed_amount == 0) return false;
    if (mandate.witness_commit().is_empty()) return false;
    if (!mandate::valid_commit_len(&proposed_next_commit)) return false;
    if (proposed_next_commit == *mandate.witness_commit()) return false;
    if (!target_allowed(mandate, proposed_target)) return false;

    let limits = mandate.coin_limits();
    let mut i = 0;
    let n = limits.length();
    while (i < n) {
        let limit = limits.borrow(i);
        if (mandate::coin_limit_coin_type(limit) == proposed_coin_type) {
            if (proposed_amount > mandate::coin_limit_per_tx_cap(limit)) return false;
            let now_ms = clock.timestamp_ms();
            let period_start = mandate::coin_limit_period_start_ms(limit);
            let period_spent = mandate::coin_limit_period_spent(limit);
            let period_cap = mandate::coin_limit_period_cap(limit);
            let effective_spent = if (now_ms >= period_start && now_ms - period_start >= mandate.period_ms()) 0 else period_spent;
            if (effective_spent > period_cap) return false;
            if (proposed_amount > period_cap - effective_spent) return false;
            return true
        };
        i = i + 1;
    };
    false
}

fun target_allowed(mandate: &Mandate, target: address): bool {
    let allowed = mandate.allowed_targets();
    if (allowed.is_empty()) return false;
    let mut i = 0;
    let n = allowed.length();
    while (i < n) {
        if (*allowed.borrow(i) == target) return true;
        i = i + 1;
    };
    false
}

#[test_only]
public fun check_with_type<C>(
    mandate: &Mandate,
    proposed_action: u32,
    proposed_target: address,
    proposed_amount: u64,
    proposed_next_commit: vector<u8>,
    clock: &Clock,
): bool {
    check(
        mandate,
        proposed_action,
        proposed_target,
        std::type_name::with_defining_ids<C>(),
        proposed_amount,
        proposed_next_commit,
        clock,
    )
}
