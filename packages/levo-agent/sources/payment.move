module levo_agent::payment;

use std::type_name::{Self, TypeName};
use sui::clock::Clock;
use sui::event;

use levo_agent::mandate::{Self, Mandate};

const ENotAgent: u64 = 1;
const EReceiptActionMismatch: u64 = 2;
const EReceiptCoinMismatch: u64 = 3;
const EReceiptTargetMismatch: u64 = 4;
const EReceiptAmountMismatch: u64 = 5;
const EReceiptMandateMismatch: u64 = 6;
const EZeroAmount: u64 = 7;

public struct WitnessReceipt {
    mandate_id: ID,
    action_type: u32,
    coin_type: TypeName,
    target: address,
    amount: u64,
}

public struct WitnessConsumed has copy, drop {
    mandate_id: ID,
    action_type: u32,
    coin_type: TypeName,
    target: address,
    amount: u64,
    at_ms: u64,
    // Monotonic counter from Mandate.nonce after this rotation (init = 1, +1 per rotate).
    // Lets off-chain indexers detect gaps without scanning the full witness chain.
    nonce: u64,
    // witness_commit before this consume (the commit that this witness preimage satisfied).
    witness_commit_before: vector<u8>,
    // witness_commit after this consume (= next_commit param passed in).
    witness_commit_after: vector<u8>,
}

public fun consume_witness<C>(
    mandate: &mut Mandate,
    action_type: u32,
    target: address,
    amount: u64,
    witness: vector<u8>,
    next_commit: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext,
): WitnessReceipt {
    assert!(ctx.sender() == mandate.agent(), ENotAgent);
    mandate.assert_active(clock);
    mandate.assert_action_allowed(action_type);
    mandate.assert_target_allowed(target);
    assert!(amount > 0, EZeroAmount);

    let now_ms = clock.timestamp_ms();
    let period_ms = mandate.period_ms();
    let limit = mandate.coin_limit_mut<C>();
    mandate::limit_check_and_consume(limit, amount, period_ms, now_ms);

    let witness_commit_before = *mandate.witness_commit();
    mandate.rotate_witness(
        &witness,
        action_type,
        target,
        type_name::with_defining_ids<C>(),
        amount,
        next_commit,
    );
    let witness_commit_after = *mandate.witness_commit();
    let nonce = mandate.nonce();

    let mandate_id = object::id(mandate);
    let coin_type = type_name::with_defining_ids<C>();

    event::emit(WitnessConsumed {
        mandate_id,
        action_type,
        coin_type,
        target,
        amount,
        at_ms: now_ms,
        nonce,
        witness_commit_before,
        witness_commit_after,
    });

    WitnessReceipt {
        mandate_id,
        action_type,
        coin_type,
        target,
        amount,
    }
}

public(package) fun unpack_for_action<C>(
    receipt: WitnessReceipt,
    expected_mandate_id: ID,
    expected_action: u32,
    expected_target: address,
    expected_amount: u64,
): (ID, u32, TypeName, address, u64) {
    let WitnessReceipt { mandate_id, action_type, coin_type, target, amount } = receipt;
    assert!(mandate_id == expected_mandate_id, EReceiptMandateMismatch);
    assert!(action_type == expected_action, EReceiptActionMismatch);
    assert!(coin_type == type_name::with_defining_ids<C>(), EReceiptCoinMismatch);
    assert!(target == expected_target, EReceiptTargetMismatch);
    assert!(amount == expected_amount, EReceiptAmountMismatch);
    (mandate_id, action_type, coin_type, target, amount)
}

public fun receipt_mandate_id(r: &WitnessReceipt): ID { r.mandate_id }
public fun receipt_action_type(r: &WitnessReceipt): u32 { r.action_type }
public fun receipt_coin_type(r: &WitnessReceipt): TypeName { r.coin_type }
public fun receipt_target(r: &WitnessReceipt): address { r.target }
public fun receipt_amount(r: &WitnessReceipt): u64 { r.amount }
