#[test_only]
module levo_agent::mandate_tests;

use std::string::String;
use std::type_name::{Self, TypeName};
use sui::clock::{Self, Clock};
use sui::test_scenario as ts;

use levo_agent::mandate::{Self, Mandate};
use levo_agent::payment;
use levo_agent::action_registry;
use levo_agent::seal_policy;

const OWNER: address = @0xA1;
const AGENT: address = @0xAB;
const STRANGER: address = @0xCC;
const VAULT: address = @0xBE;
const OTHER_VAULT: address = @0xBF;

const DAY_MS: u64 = 86_400_000;
// EXPIRY must satisfy `expiry_ms - now <= MAX_PERIOD_MS` (N-3 fix in mandate::create).
// MAX_PERIOD_MS = 31_536_000_000 (1 year). Tests start at clock=0 so EXPIRY <= 1 year.
const EXPIRY: u64 = 31_536_000_000;
const PER_TX_CAP: u64 = 1_000;
const PERIOD_CAP: u64 = 2_500;
const MAX_U64: u64 = 18_446_744_073_709_551_615;
const MAX_U64_MINUS_ONE: u64 = 18_446_744_073_709_551_614;

public struct TEST_COIN has drop {}
public struct OTHER_COIN has drop {}
public struct THIRD_COIN has drop {}

fun w0(): vector<u8> { b"witness_v0" }
fun w1(): vector<u8> { b"witness_v1" }
fun w2(): vector<u8> { b"witness_v2" }
fun terminal_commit(): vector<u8> { b"terminal_commit" }

fun bytes_of_len(len: u64): vector<u8> {
    let mut bytes = vector::empty<u8>();
    let mut i = 0;
    while (i < len) {
        bytes.push_back(97);
        i = i + 1;
    };
    bytes
}

fun commit_for<C>(
    mandate: &Mandate,
    witness: &vector<u8>,
    action: u32,
    target: address,
    amount: u64,
    next_commit: &vector<u8>,
): vector<u8> {
    mandate::derive_action_commit<C>(
        witness,
        mandate.id(),
        action,
        target,
        amount,
        next_commit,
    )
}

fun make_clock(scenario: &mut ts::Scenario, now_ms: u64): Clock {
    let mut c = clock::create_for_testing(scenario.ctx());
    c.set_for_testing(now_ms);
    c
}

fun make_default_mandate(scenario: &mut ts::Scenario, clock: &Clock): Mandate {
    let coin_types: vector<TypeName> = vector[type_name::with_defining_ids<TEST_COIN>()];
    let per_tx_caps: vector<u64> = vector[PER_TX_CAP];
    let period_caps: vector<u64> = vector[PERIOD_CAP];
    let actions = mandate::action_earn_deposit() | mandate::action_earn_harvest();
    let allowed_targets: vector<address> = vector[VAULT];
    let metadata_keys: vector<String> = vector::empty();
    let metadata_values: vector<String> = vector::empty();

    mandate::create(
        AGENT,
        actions,
        coin_types,
        per_tx_caps,
        period_caps,
        DAY_MS,
        allowed_targets,
        EXPIRY,
        metadata_keys,
        metadata_values,
        clock,
        scenario.ctx(),
    )
}

fun init_witness(mandate: &mut Mandate, scenario: &mut ts::Scenario, clock: &Clock, commit: vector<u8>) {
    // Owner now drives initialization (F-5 fix); subsequent consume_witness flips back to AGENT.
    scenario.next_tx(OWNER);
    mandate::set_initial_witness(mandate, commit, clock, scenario.ctx());
}

fun init_w0_for_action<C>(
    mandate: &mut Mandate,
    scenario: &mut ts::Scenario,
    clock: &Clock,
    action: u32,
    target: address,
    amount: u64,
    next_commit: &vector<u8>,
): vector<u8> {
    let witness = w0();
    let commit = commit_for<C>(mandate, &witness, action, target, amount, next_commit);
    init_witness(mandate, scenario, clock, commit);
    witness
}

fun init_current_commit(mandate: &mut Mandate, scenario: &mut ts::Scenario, clock: &Clock) {
    init_witness(mandate, scenario, clock, b"current_commit");
}

#[test]
fun happy_path_deposit_then_harvest_with_chain() {
    let mut scenario = ts::begin(OWNER);
    let clock = make_clock(&mut scenario, 0);
    let mut mandate = make_default_mandate(&mut scenario, &clock);
    let w1_value = w1();
    let final_commit = terminal_commit();
    let commit1 = commit_for<TEST_COIN>(
        &mandate,
        &w1_value,
        mandate::action_earn_harvest(),
        VAULT,
        700,
        &final_commit,
    );
    let w0_value = w0();
    let commit0 = commit_for<TEST_COIN>(
        &mandate,
        &w0_value,
        mandate::action_earn_deposit(),
        VAULT,
        500,
        &commit1,
    );
    init_witness(&mut mandate, &mut scenario, &clock, commit0);

    scenario.next_tx(AGENT);
    let receipt0 = payment::consume_witness<TEST_COIN>(
        &mut mandate,
        mandate::action_earn_deposit(),
        VAULT,
        500,
        w0_value,
        commit1,
        &clock,
        scenario.ctx(),
    );
    action_registry::authorize_earn_deposit<TEST_COIN>(receipt0, &mandate, VAULT, 500);

    scenario.next_tx(AGENT);
    let receipt1 = payment::consume_witness<TEST_COIN>(
        &mut mandate,
        mandate::action_earn_harvest(),
        VAULT,
        700,
        w1_value,
        final_commit,
        &clock,
        scenario.ctx(),
    );
    action_registry::authorize_earn_harvest<TEST_COIN>(receipt1, &mandate, VAULT, 700);

    let limit = mandate.coin_limits().borrow(0);
    assert!(mandate::coin_limit_period_spent(limit) == 1200, 0);

    mandate::destroy_for_testing(mandate);
    clock::destroy_for_testing(clock);
    scenario.end();
}

#[test]
fun period_rollover_resets_spent() {
    let mut scenario = ts::begin(OWNER);
    let clock = make_clock(&mut scenario, 0);
    let mut mandate = make_default_mandate(&mut scenario, &clock);
    let w1_value = w1();
    let final_commit = terminal_commit();
    let commit1 = commit_for<TEST_COIN>(
        &mandate,
        &w1_value,
        mandate::action_earn_deposit(),
        VAULT,
        1_000,
        &final_commit,
    );
    let w0_value = w0();
    let commit0 = commit_for<TEST_COIN>(
        &mandate,
        &w0_value,
        mandate::action_earn_deposit(),
        VAULT,
        1_000,
        &commit1,
    );
    init_witness(&mut mandate, &mut scenario, &clock, commit0);

    scenario.next_tx(AGENT);
    let r0 = payment::consume_witness<TEST_COIN>(
        &mut mandate,
        mandate::action_earn_deposit(),
        VAULT,
        1_000,
        w0_value,
        commit1,
        &clock,
        scenario.ctx(),
    );
    action_registry::authorize_earn_deposit<TEST_COIN>(r0, &mandate, VAULT, 1_000);

    let mut clock2 = clock;
    clock2.set_for_testing(DAY_MS + 1);

    scenario.next_tx(AGENT);
    let r1 = payment::consume_witness<TEST_COIN>(
        &mut mandate,
        mandate::action_earn_deposit(),
        VAULT,
        1_000,
        w1_value,
        final_commit,
        &clock2,
        scenario.ctx(),
    );
    action_registry::authorize_earn_deposit<TEST_COIN>(r1, &mandate, VAULT, 1_000);

    let limit = mandate.coin_limits().borrow(0);
    assert!(mandate::coin_limit_period_spent(limit) == 1_000, 0);

    mandate::destroy_for_testing(mandate);
    clock::destroy_for_testing(clock2);
    scenario.end();
}

#[test, expected_failure(abort_code = mandate::ERevoked)]
fun consume_aborts_when_revoked() {
    let mut scenario = ts::begin(OWNER);
    let clock = make_clock(&mut scenario, 0);
    let mut mandate = make_default_mandate(&mut scenario, &clock);
    let next_commit = terminal_commit();
    let w0_value = init_w0_for_action<TEST_COIN>(
        &mut mandate,
        &mut scenario,
        &clock,
        mandate::action_earn_deposit(),
        VAULT,
        100,
        &next_commit,
    );

    scenario.next_tx(OWNER);
    mandate.revoke(&clock, scenario.ctx());

    scenario.next_tx(AGENT);
    let r = payment::consume_witness<TEST_COIN>(
        &mut mandate,
        mandate::action_earn_deposit(),
        VAULT,
        100,
        w0_value,
        next_commit,
        &clock,
        scenario.ctx(),
    );
    action_registry::authorize_earn_deposit<TEST_COIN>(r, &mandate, VAULT, 100);

    abort 999
}

#[test, expected_failure(abort_code = mandate::EExpired)]
fun consume_aborts_when_expired() {
    let mut scenario = ts::begin(OWNER);
    let clock = make_clock(&mut scenario, 0);
    let mut mandate = make_default_mandate(&mut scenario, &clock);
    let next_commit = terminal_commit();
    let w0_value = init_w0_for_action<TEST_COIN>(
        &mut mandate,
        &mut scenario,
        &clock,
        mandate::action_earn_deposit(),
        VAULT,
        100,
        &next_commit,
    );

    let mut clock2 = clock;
    clock2.set_for_testing(EXPIRY + 1);

    scenario.next_tx(AGENT);
    let r = payment::consume_witness<TEST_COIN>(
        &mut mandate,
        mandate::action_earn_deposit(),
        VAULT,
        100,
        w0_value,
        next_commit,
        &clock2,
        scenario.ctx(),
    );
    action_registry::authorize_earn_deposit<TEST_COIN>(r, &mandate, VAULT, 100);

    abort 999
}

#[test, expected_failure(abort_code = mandate::EActionNotAllowed)]
fun consume_aborts_on_disallowed_action() {
    let mut scenario = ts::begin(OWNER);
    let clock = make_clock(&mut scenario, 0);
    let mut mandate = make_default_mandate(&mut scenario, &clock);
    let next_commit = terminal_commit();
    let w0_value = init_w0_for_action<TEST_COIN>(
        &mut mandate,
        &mut scenario,
        &clock,
        mandate::action_earn_withdraw(),
        VAULT,
        100,
        &next_commit,
    );

    scenario.next_tx(AGENT);
    let r = payment::consume_witness<TEST_COIN>(
        &mut mandate,
        mandate::action_earn_withdraw(),
        VAULT,
        100,
        w0_value,
        next_commit,
        &clock,
        scenario.ctx(),
    );
    action_registry::authorize_earn_deposit<TEST_COIN>(r, &mandate, VAULT, 100);

    abort 999
}

#[test, expected_failure(abort_code = mandate::EActionNotImplementedYet)]
fun create_aborts_with_unimplemented_action() {
    let mut scenario = ts::begin(OWNER);
    let clock = make_clock(&mut scenario, 0);
    let coin_types: vector<TypeName> = vector[type_name::with_defining_ids<TEST_COIN>()];
    let per_tx_caps: vector<u64> = vector[PER_TX_CAP];
    let period_caps: vector<u64> = vector[PERIOD_CAP];
    let allowed_targets: vector<address> = vector[VAULT];
    let metadata_keys: vector<String> = vector::empty();
    let metadata_values: vector<String> = vector::empty();

    let mandate = mandate::create(
        AGENT,
        mandate::action_earn_deposit() | mandate::action_send(),
        coin_types,
        per_tx_caps,
        period_caps,
        DAY_MS,
        allowed_targets,
        EXPIRY,
        metadata_keys,
        metadata_values,
        &clock,
        scenario.ctx(),
    );

    mandate::destroy_for_testing(mandate);
    abort 999
}

#[test, expected_failure(abort_code = payment::EZeroAmount)]
fun consume_aborts_with_zero_amount() {
    let mut scenario = ts::begin(OWNER);
    let clock = make_clock(&mut scenario, 0);
    let mut mandate = make_default_mandate(&mut scenario, &clock);
    let next_commit = terminal_commit();
    let w0_value = init_w0_for_action<TEST_COIN>(
        &mut mandate,
        &mut scenario,
        &clock,
        mandate::action_earn_deposit(),
        VAULT,
        0,
        &next_commit,
    );

    scenario.next_tx(AGENT);
    let r = payment::consume_witness<TEST_COIN>(
        &mut mandate,
        mandate::action_earn_deposit(),
        VAULT,
        0,
        w0_value,
        next_commit,
        &clock,
        scenario.ctx(),
    );
    action_registry::authorize_earn_deposit<TEST_COIN>(r, &mandate, VAULT, 0);

    abort 999
}

#[test, expected_failure(abort_code = mandate::ETargetNotAllowed)]
fun consume_aborts_on_disallowed_target() {
    let mut scenario = ts::begin(OWNER);
    let clock = make_clock(&mut scenario, 0);
    let mut mandate = make_default_mandate(&mut scenario, &clock);
    let next_commit = terminal_commit();
    let w0_value = init_w0_for_action<TEST_COIN>(
        &mut mandate,
        &mut scenario,
        &clock,
        mandate::action_earn_deposit(),
        OTHER_VAULT,
        100,
        &next_commit,
    );

    scenario.next_tx(AGENT);
    let r = payment::consume_witness<TEST_COIN>(
        &mut mandate,
        mandate::action_earn_deposit(),
        OTHER_VAULT,
        100,
        w0_value,
        next_commit,
        &clock,
        scenario.ctx(),
    );
    action_registry::authorize_earn_deposit<TEST_COIN>(r, &mandate, OTHER_VAULT, 100);

    abort 999
}

#[test, expected_failure(abort_code = mandate::EOverPerTxCap)]
fun consume_aborts_over_per_tx_cap() {
    let mut scenario = ts::begin(OWNER);
    let clock = make_clock(&mut scenario, 0);
    let mut mandate = make_default_mandate(&mut scenario, &clock);
    let next_commit = terminal_commit();
    let w0_value = init_w0_for_action<TEST_COIN>(
        &mut mandate,
        &mut scenario,
        &clock,
        mandate::action_earn_deposit(),
        VAULT,
        PER_TX_CAP + 1,
        &next_commit,
    );

    scenario.next_tx(AGENT);
    let r = payment::consume_witness<TEST_COIN>(
        &mut mandate,
        mandate::action_earn_deposit(),
        VAULT,
        PER_TX_CAP + 1,
        w0_value,
        next_commit,
        &clock,
        scenario.ctx(),
    );
    action_registry::authorize_earn_deposit<TEST_COIN>(r, &mandate, VAULT, PER_TX_CAP + 1);

    abort 999
}

#[test, expected_failure(abort_code = mandate::EOverPeriodCap)]
fun consume_aborts_over_period_cap() {
    let mut scenario = ts::begin(OWNER);
    let clock = make_clock(&mut scenario, 0);
    let mut mandate = make_default_mandate(&mut scenario, &clock);
    let w2_value = w2();
    let final_commit = terminal_commit();
    let commit2 = commit_for<TEST_COIN>(
        &mandate,
        &w2_value,
        mandate::action_earn_deposit(),
        VAULT,
        1_000,
        &final_commit,
    );
    let w1_value = w1();
    let commit1 = commit_for<TEST_COIN>(
        &mandate,
        &w1_value,
        mandate::action_earn_deposit(),
        VAULT,
        1_000,
        &commit2,
    );
    let w0_value = w0();
    let commit0 = commit_for<TEST_COIN>(
        &mandate,
        &w0_value,
        mandate::action_earn_deposit(),
        VAULT,
        1_000,
        &commit1,
    );
    init_witness(&mut mandate, &mut scenario, &clock, commit0);

    scenario.next_tx(AGENT);
    let r0 = payment::consume_witness<TEST_COIN>(
        &mut mandate,
        mandate::action_earn_deposit(),
        VAULT,
        1_000,
        w0_value,
        commit1,
        &clock,
        scenario.ctx(),
    );
    action_registry::authorize_earn_deposit<TEST_COIN>(r0, &mandate, VAULT, 1_000);

    scenario.next_tx(AGENT);
    let r1 = payment::consume_witness<TEST_COIN>(
        &mut mandate,
        mandate::action_earn_deposit(),
        VAULT,
        1_000,
        w1_value,
        commit2,
        &clock,
        scenario.ctx(),
    );
    action_registry::authorize_earn_deposit<TEST_COIN>(r1, &mandate, VAULT, 1_000);

    scenario.next_tx(AGENT);
    let r2 = payment::consume_witness<TEST_COIN>(
        &mut mandate,
        mandate::action_earn_deposit(),
        VAULT,
        1_000,
        w2_value,
        final_commit,
        &clock,
        scenario.ctx(),
    );
    action_registry::authorize_earn_deposit<TEST_COIN>(r2, &mandate, VAULT, 1_000);

    abort 999
}

#[test, expected_failure(abort_code = mandate::EOverPeriodCap)]
fun consume_aborts_on_period_spent_addition_overflow_path() {
    let mut scenario = ts::begin(OWNER);
    let clock = make_clock(&mut scenario, 0);
    let coin_types: vector<TypeName> = vector[type_name::with_defining_ids<TEST_COIN>()];
    let per_tx_caps: vector<u64> = vector[MAX_U64];
    let period_caps: vector<u64> = vector[MAX_U64];
    let allowed_targets: vector<address> = vector[VAULT];
    let metadata_keys: vector<String> = vector::empty();
    let metadata_values: vector<String> = vector::empty();
    let mut mandate = mandate::create(
        AGENT,
        mandate::action_earn_deposit(),
        coin_types,
        per_tx_caps,
        period_caps,
        DAY_MS,
        allowed_targets,
        EXPIRY,
        metadata_keys,
        metadata_values,
        &clock,
        scenario.ctx(),
    );

    let w1_value = w1();
    let final_commit = terminal_commit();
    let commit1 = commit_for<TEST_COIN>(
        &mandate,
        &w1_value,
        mandate::action_earn_deposit(),
        VAULT,
        2,
        &final_commit,
    );
    let w0_value = w0();
    let commit0 = commit_for<TEST_COIN>(
        &mandate,
        &w0_value,
        mandate::action_earn_deposit(),
        VAULT,
        MAX_U64_MINUS_ONE,
        &commit1,
    );
    init_witness(&mut mandate, &mut scenario, &clock, commit0);

    scenario.next_tx(AGENT);
    let r0 = payment::consume_witness<TEST_COIN>(
        &mut mandate,
        mandate::action_earn_deposit(),
        VAULT,
        MAX_U64_MINUS_ONE,
        w0_value,
        commit1,
        &clock,
        scenario.ctx(),
    );
    action_registry::authorize_earn_deposit<TEST_COIN>(r0, &mandate, VAULT, MAX_U64_MINUS_ONE);

    scenario.next_tx(AGENT);
    let r1 = payment::consume_witness<TEST_COIN>(
        &mut mandate,
        mandate::action_earn_deposit(),
        VAULT,
        2,
        w1_value,
        final_commit,
        &clock,
        scenario.ctx(),
    );
    action_registry::authorize_earn_deposit<TEST_COIN>(r1, &mandate, VAULT, 2);

    abort 999
}

#[test, expected_failure(abort_code = mandate::EUnknownCoinType)]
fun consume_aborts_on_wrong_coin_type() {
    let mut scenario = ts::begin(OWNER);
    let clock = make_clock(&mut scenario, 0);
    let mut mandate = make_default_mandate(&mut scenario, &clock);
    let next_commit = terminal_commit();
    let w0_value = init_w0_for_action<OTHER_COIN>(
        &mut mandate,
        &mut scenario,
        &clock,
        mandate::action_earn_deposit(),
        VAULT,
        100,
        &next_commit,
    );

    scenario.next_tx(AGENT);
    let r = payment::consume_witness<OTHER_COIN>(
        &mut mandate,
        mandate::action_earn_deposit(),
        VAULT,
        100,
        w0_value,
        next_commit,
        &clock,
        scenario.ctx(),
    );
    action_registry::authorize_earn_deposit<OTHER_COIN>(r, &mandate, VAULT, 100);

    abort 999
}

#[test, expected_failure(abort_code = mandate::EInvalidCommit)]
fun consume_aborts_on_witness_replay() {
    let mut scenario = ts::begin(OWNER);
    let clock = make_clock(&mut scenario, 0);
    let mut mandate = make_default_mandate(&mut scenario, &clock);
    let w1_value = w1();
    let final_commit = terminal_commit();
    let commit1 = commit_for<TEST_COIN>(
        &mandate,
        &w1_value,
        mandate::action_earn_deposit(),
        VAULT,
        100,
        &final_commit,
    );
    let w0_value = w0();
    let commit0 = commit_for<TEST_COIN>(
        &mandate,
        &w0_value,
        mandate::action_earn_deposit(),
        VAULT,
        100,
        &commit1,
    );
    init_witness(&mut mandate, &mut scenario, &clock, commit0);

    scenario.next_tx(AGENT);
    let r0 = payment::consume_witness<TEST_COIN>(
        &mut mandate,
        mandate::action_earn_deposit(),
        VAULT,
        100,
        w0_value,
        commit1,
        &clock,
        scenario.ctx(),
    );
    action_registry::authorize_earn_deposit<TEST_COIN>(r0, &mandate, VAULT, 100);

    scenario.next_tx(AGENT);
    let r_replay = payment::consume_witness<TEST_COIN>(
        &mut mandate,
        mandate::action_earn_deposit(),
        VAULT,
        100,
        w0(),
        final_commit,
        &clock,
        scenario.ctx(),
    );
    action_registry::authorize_earn_deposit<TEST_COIN>(r_replay, &mandate, VAULT, 100);

    abort 999
}

#[test, expected_failure(abort_code = mandate::EInvalidCommit)]
fun consume_aborts_when_next_commit_reuses_current_commit() {
    let mut scenario = ts::begin(OWNER);
    let clock = make_clock(&mut scenario, 0);
    let mut mandate = make_default_mandate(&mut scenario, &clock);
    let w0_value = w0();
    let current_commit = commit_for<TEST_COIN>(
        &mandate,
        &w0_value,
        mandate::action_earn_deposit(),
        VAULT,
        100,
        &vector::empty<u8>(),
    );
    let current_commit = commit_for<TEST_COIN>(
        &mandate,
        &w0_value,
        mandate::action_earn_deposit(),
        VAULT,
        100,
        &current_commit,
    );
    init_witness(&mut mandate, &mut scenario, &clock, current_commit);
    let reused_commit = *mandate.witness_commit();

    scenario.next_tx(AGENT);
    let r = payment::consume_witness<TEST_COIN>(
        &mut mandate,
        mandate::action_earn_deposit(),
        VAULT,
        100,
        w0_value,
        reused_commit,
        &clock,
        scenario.ctx(),
    );
    action_registry::authorize_earn_deposit<TEST_COIN>(r, &mandate, VAULT, 100);

    abort 999
}

#[test, expected_failure(abort_code = mandate::EInvalidCommit)]
fun consume_aborts_when_next_commit_empty() {
    let mut scenario = ts::begin(OWNER);
    let clock = make_clock(&mut scenario, 0);
    let mut mandate = make_default_mandate(&mut scenario, &clock);
    let next_commit = vector::empty<u8>();
    let w0_value = init_w0_for_action<TEST_COIN>(
        &mut mandate,
        &mut scenario,
        &clock,
        mandate::action_earn_deposit(),
        VAULT,
        100,
        &next_commit,
    );

    scenario.next_tx(AGENT);
    let r = payment::consume_witness<TEST_COIN>(
        &mut mandate,
        mandate::action_earn_deposit(),
        VAULT,
        100,
        w0_value,
        next_commit,
        &clock,
        scenario.ctx(),
    );
    action_registry::authorize_earn_deposit<TEST_COIN>(r, &mandate, VAULT, 100);

    abort 999
}

#[test, expected_failure(abort_code = mandate::EInvalidCommit)]
fun consume_aborts_when_action_context_differs_from_commit() {
    let mut scenario = ts::begin(OWNER);
    let clock = make_clock(&mut scenario, 0);
    let mut mandate = make_default_mandate(&mut scenario, &clock);
    let next_commit = terminal_commit();
    let w0_value = init_w0_for_action<TEST_COIN>(
        &mut mandate,
        &mut scenario,
        &clock,
        mandate::action_earn_deposit(),
        VAULT,
        100,
        &next_commit,
    );

    scenario.next_tx(AGENT);
    let r = payment::consume_witness<TEST_COIN>(
        &mut mandate,
        mandate::action_earn_harvest(),
        VAULT,
        100,
        w0_value,
        next_commit,
        &clock,
        scenario.ctx(),
    );
    action_registry::authorize_earn_harvest<TEST_COIN>(r, &mandate, VAULT, 100);

    abort 999
}

#[test, expected_failure(abort_code = payment::ENotAgent)]
fun consume_aborts_when_not_agent() {
    let mut scenario = ts::begin(OWNER);
    let clock = make_clock(&mut scenario, 0);
    let mut mandate = make_default_mandate(&mut scenario, &clock);
    let next_commit = terminal_commit();
    let w0_value = init_w0_for_action<TEST_COIN>(
        &mut mandate,
        &mut scenario,
        &clock,
        mandate::action_earn_deposit(),
        VAULT,
        100,
        &next_commit,
    );

    scenario.next_tx(STRANGER);
    let r = payment::consume_witness<TEST_COIN>(
        &mut mandate,
        mandate::action_earn_deposit(),
        VAULT,
        100,
        w0_value,
        next_commit,
        &clock,
        scenario.ctx(),
    );
    action_registry::authorize_earn_deposit<TEST_COIN>(r, &mandate, VAULT, 100);

    abort 999
}

#[test, expected_failure(abort_code = mandate::ENotOwner)]
fun non_owner_cannot_revoke() {
    let mut scenario = ts::begin(OWNER);
    let clock = make_clock(&mut scenario, 0);
    let mut mandate = make_default_mandate(&mut scenario, &clock);

    scenario.next_tx(STRANGER);
    mandate.revoke(&clock, scenario.ctx());

    abort 999
}

#[test, expected_failure(abort_code = mandate::ERevoked)]
fun update_expiry_aborts_when_revoked() {
    let mut scenario = ts::begin(OWNER);
    let clock = make_clock(&mut scenario, 0);
    let mut mandate = make_default_mandate(&mut scenario, &clock);

    scenario.next_tx(OWNER);
    mandate.revoke(&clock, scenario.ctx());
    mandate.update_expiry(EXPIRY + 1, &clock, scenario.ctx());

    abort 999
}

#[test, expected_failure(abort_code = mandate::EExpiryTooFar)]
fun update_expiry_aborts_when_new_expiry_too_far() {
    let mut scenario = ts::begin(OWNER);
    let clock = make_clock(&mut scenario, 0);
    let mut mandate = make_default_mandate(&mut scenario, &clock);

    scenario.next_tx(OWNER);
    mandate.update_expiry(31_536_000_001, &clock, scenario.ctx());

    abort 999
}

#[test, expected_failure(abort_code = mandate::ENoAllowedTargets)]
fun create_aborts_with_empty_allowed_targets() {
    let mut scenario = ts::begin(OWNER);
    let clock = make_clock(&mut scenario, 0);
    let coin_types: vector<TypeName> = vector[type_name::with_defining_ids<TEST_COIN>()];
    let per_tx_caps: vector<u64> = vector[PER_TX_CAP];
    let period_caps: vector<u64> = vector[PERIOD_CAP];
    let metadata_keys: vector<String> = vector::empty();
    let metadata_values: vector<String> = vector::empty();

    let mandate = mandate::create(
        AGENT,
        mandate::action_earn_deposit(),
        coin_types,
        per_tx_caps,
        period_caps,
        DAY_MS,
        vector::empty<address>(),
        EXPIRY,
        metadata_keys,
        metadata_values,
        &clock,
        scenario.ctx(),
    );

    mandate::destroy_for_testing(mandate);
    abort 999
}

#[test, expected_failure(abort_code = mandate::ENoAllowedTargets)]
fun consume_aborts_when_allowed_targets_becomes_empty() {
    let mut scenario = ts::begin(OWNER);
    let clock = make_clock(&mut scenario, 0);
    let mut mandate = make_default_mandate(&mut scenario, &clock);
    mandate::clear_allowed_targets_for_testing(&mut mandate);

    scenario.next_tx(AGENT);
    let r = payment::consume_witness<TEST_COIN>(
        &mut mandate,
        mandate::action_earn_deposit(),
        VAULT,
        100,
        w0(),
        terminal_commit(),
        &clock,
        scenario.ctx(),
    );
    action_registry::authorize_earn_deposit<TEST_COIN>(r, &mandate, VAULT, 100);

    abort 999
}

#[test]
fun seal_approve_fails_when_allowed_targets_becomes_empty() {
    let mut scenario = ts::begin(OWNER);
    let clock = make_clock(&mut scenario, 0);
    let mut mandate = make_default_mandate(&mut scenario, &clock);
    init_current_commit(&mut mandate, &mut scenario, &clock);
    mandate::clear_allowed_targets_for_testing(&mut mandate);

    let ok = seal_policy::check_with_type<TEST_COIN>(
        &mandate,
        mandate::action_earn_deposit(),
        VAULT,
        100,
        terminal_commit(),
        &clock,
    );
    assert!(!ok, 0);

    mandate::destroy_for_testing(mandate);
    clock::destroy_for_testing(clock);
    scenario.end();
}

#[test, expected_failure(abort_code = mandate::EInvalidPeriod)]
fun create_aborts_when_period_too_large() {
    let mut scenario = ts::begin(OWNER);
    let clock = make_clock(&mut scenario, 0);
    let coin_types: vector<TypeName> = vector[type_name::with_defining_ids<TEST_COIN>()];
    let per_tx_caps: vector<u64> = vector[PER_TX_CAP];
    let period_caps: vector<u64> = vector[PERIOD_CAP];
    let allowed_targets: vector<address> = vector[VAULT];
    let metadata_keys: vector<String> = vector::empty();
    let metadata_values: vector<String> = vector::empty();

    let mandate = mandate::create(
        AGENT,
        mandate::action_earn_deposit(),
        coin_types,
        per_tx_caps,
        period_caps,
        MAX_U64,
        allowed_targets,
        EXPIRY,
        metadata_keys,
        metadata_values,
        &clock,
        scenario.ctx(),
    );

    mandate::destroy_for_testing(mandate);
    abort 999
}

#[test, expected_failure(abort_code = mandate::ETooManyTargets)]
fun create_aborts_with_too_many_targets() {
    let mut scenario = ts::begin(OWNER);
    let clock = make_clock(&mut scenario, 0);
    let coin_types: vector<TypeName> = vector[type_name::with_defining_ids<TEST_COIN>()];
    let per_tx_caps: vector<u64> = vector[PER_TX_CAP];
    let period_caps: vector<u64> = vector[PERIOD_CAP];
    let mut allowed_targets = vector::empty<address>();
    let mut i = 0u64;
    while (i < 33) {
        allowed_targets.push_back(VAULT);
        i = i + 1;
    };
    let metadata_keys: vector<String> = vector::empty();
    let metadata_values: vector<String> = vector::empty();

    let mandate = mandate::create(
        AGENT,
        mandate::action_earn_deposit(),
        coin_types,
        per_tx_caps,
        period_caps,
        DAY_MS,
        allowed_targets,
        EXPIRY,
        metadata_keys,
        metadata_values,
        &clock,
        scenario.ctx(),
    );

    mandate::destroy_for_testing(mandate);
    abort 999
}

#[test, expected_failure(abort_code = mandate::ETooManyCoinLimits)]
fun create_aborts_with_too_many_coin_limits() {
    let mut scenario = ts::begin(OWNER);
    let clock = make_clock(&mut scenario, 0);
    let mut coin_types = vector::empty<TypeName>();
    let mut per_tx_caps = vector::empty<u64>();
    let mut period_caps = vector::empty<u64>();
    let mut i = 0u64;
    while (i < 17) {
        coin_types.push_back(type_name::with_defining_ids<TEST_COIN>());
        per_tx_caps.push_back(PER_TX_CAP);
        period_caps.push_back(PERIOD_CAP);
        i = i + 1;
    };
    let allowed_targets: vector<address> = vector[VAULT];
    let metadata_keys: vector<String> = vector::empty();
    let metadata_values: vector<String> = vector::empty();

    let mandate = mandate::create(
        AGENT,
        mandate::action_earn_deposit(),
        coin_types,
        per_tx_caps,
        period_caps,
        DAY_MS,
        allowed_targets,
        EXPIRY,
        metadata_keys,
        metadata_values,
        &clock,
        scenario.ctx(),
    );

    mandate::destroy_for_testing(mandate);
    abort 999
}

#[test, expected_failure(abort_code = mandate::ETooManyMetadata)]
fun create_aborts_with_too_many_metadata_entries() {
    let mut scenario = ts::begin(OWNER);
    let clock = make_clock(&mut scenario, 0);
    let coin_types: vector<TypeName> = vector[type_name::with_defining_ids<TEST_COIN>()];
    let per_tx_caps: vector<u64> = vector[PER_TX_CAP];
    let period_caps: vector<u64> = vector[PERIOD_CAP];
    let allowed_targets: vector<address> = vector[VAULT];
    let mut metadata_keys = vector::empty<String>();
    let mut metadata_values = vector::empty<String>();
    let mut i = 0u64;
    while (i < 17) {
        metadata_keys.push_back(b"k".to_string());
        metadata_values.push_back(b"v".to_string());
        i = i + 1;
    };

    let mandate = mandate::create(
        AGENT,
        mandate::action_earn_deposit(),
        coin_types,
        per_tx_caps,
        period_caps,
        DAY_MS,
        allowed_targets,
        EXPIRY,
        metadata_keys,
        metadata_values,
        &clock,
        scenario.ctx(),
    );

    mandate::destroy_for_testing(mandate);
    abort 999
}

#[test, expected_failure(abort_code = mandate::EMetadataKeyTooLong)]
fun create_aborts_when_metadata_key_too_long() {
    let mut scenario = ts::begin(OWNER);
    let clock = make_clock(&mut scenario, 0);
    let coin_types: vector<TypeName> = vector[type_name::with_defining_ids<TEST_COIN>()];
    let per_tx_caps: vector<u64> = vector[PER_TX_CAP];
    let period_caps: vector<u64> = vector[PERIOD_CAP];
    let allowed_targets: vector<address> = vector[VAULT];
    let metadata_keys: vector<String> = vector[bytes_of_len(65).to_string()];
    let metadata_values: vector<String> = vector[b"v".to_string()];

    let mandate = mandate::create(
        AGENT,
        mandate::action_earn_deposit(),
        coin_types,
        per_tx_caps,
        period_caps,
        DAY_MS,
        allowed_targets,
        EXPIRY,
        metadata_keys,
        metadata_values,
        &clock,
        scenario.ctx(),
    );

    mandate::destroy_for_testing(mandate);
    abort 999
}

#[test, expected_failure(abort_code = mandate::EMetadataValueTooLong)]
fun create_aborts_when_metadata_value_too_long() {
    let mut scenario = ts::begin(OWNER);
    let clock = make_clock(&mut scenario, 0);
    let coin_types: vector<TypeName> = vector[type_name::with_defining_ids<TEST_COIN>()];
    let per_tx_caps: vector<u64> = vector[PER_TX_CAP];
    let period_caps: vector<u64> = vector[PERIOD_CAP];
    let allowed_targets: vector<address> = vector[VAULT];
    let metadata_keys: vector<String> = vector[b"k".to_string()];
    let metadata_values: vector<String> = vector[bytes_of_len(257).to_string()];

    let mandate = mandate::create(
        AGENT,
        mandate::action_earn_deposit(),
        coin_types,
        per_tx_caps,
        period_caps,
        DAY_MS,
        allowed_targets,
        EXPIRY,
        metadata_keys,
        metadata_values,
        &clock,
        scenario.ctx(),
    );

    mandate::destroy_for_testing(mandate);
    abort 999
}

#[test, expected_failure(abort_code = mandate::EWitnessAlreadyInitialized)]
fun cannot_re_initialize_witness() {
    let mut scenario = ts::begin(OWNER);
    let clock = make_clock(&mut scenario, 0);
    let mut mandate = make_default_mandate(&mut scenario, &clock);
    let next_commit = terminal_commit();
    init_w0_for_action<TEST_COIN>(
        &mut mandate,
        &mut scenario,
        &clock,
        mandate::action_earn_deposit(),
        VAULT,
        100,
        &next_commit,
    );

    scenario.next_tx(OWNER);
    mandate::set_initial_witness(&mut mandate, next_commit, &clock, scenario.ctx());

    abort 999
}

#[test, expected_failure(abort_code = mandate::ERevoked)]
fun set_initial_witness_aborts_when_revoked() {
    let mut scenario = ts::begin(OWNER);
    let clock = make_clock(&mut scenario, 0);
    let mut mandate = make_default_mandate(&mut scenario, &clock);

    scenario.next_tx(OWNER);
    mandate.revoke(&clock, scenario.ctx());
    mandate::set_initial_witness(&mut mandate, b"current_commit", &clock, scenario.ctx());

    abort 999
}

#[test, expected_failure(abort_code = mandate::EExpired)]
fun set_initial_witness_aborts_when_expired() {
    let mut scenario = ts::begin(OWNER);
    let clock = make_clock(&mut scenario, 0);
    let mut mandate = make_default_mandate(&mut scenario, &clock);
    let mut clock2 = clock;
    clock2.set_for_testing(EXPIRY + 1);

    scenario.next_tx(OWNER);
    mandate::set_initial_witness(&mut mandate, b"current_commit", &clock2, scenario.ctx());

    abort 999
}

#[test, expected_failure(abort_code = mandate::EWitnessTooLong)]
fun consume_aborts_when_witness_too_long() {
    let mut scenario = ts::begin(OWNER);
    let clock = make_clock(&mut scenario, 0);
    let mut mandate = make_default_mandate(&mut scenario, &clock);
    let oversized_witness = bytes_of_len(257);
    let next_commit = terminal_commit();
    let commit = commit_for<TEST_COIN>(
        &mandate,
        &oversized_witness,
        mandate::action_earn_deposit(),
        VAULT,
        100,
        &next_commit,
    );
    init_witness(&mut mandate, &mut scenario, &clock, commit);

    scenario.next_tx(AGENT);
    let r = payment::consume_witness<TEST_COIN>(
        &mut mandate,
        mandate::action_earn_deposit(),
        VAULT,
        100,
        oversized_witness,
        next_commit,
        &clock,
        scenario.ctx(),
    );
    action_registry::authorize_earn_deposit<TEST_COIN>(r, &mandate, VAULT, 100);

    abort 999
}

#[test, expected_failure(abort_code = mandate::EWitnessNotInitialized)]
fun consume_aborts_without_witness_init() {
    let mut scenario = ts::begin(OWNER);
    let clock = make_clock(&mut scenario, 0);
    let mut mandate = make_default_mandate(&mut scenario, &clock);

    scenario.next_tx(AGENT);
    let r = payment::consume_witness<TEST_COIN>(
        &mut mandate,
        mandate::action_earn_deposit(),
        VAULT,
        100,
        w0(),
        terminal_commit(),
        &clock,
        scenario.ctx(),
    );
    action_registry::authorize_earn_deposit<TEST_COIN>(r, &mandate, VAULT, 100);

    abort 999
}

#[test, expected_failure(abort_code = payment::EReceiptActionMismatch)]
fun receipt_action_mismatch_aborts() {
    let mut scenario = ts::begin(OWNER);
    let clock = make_clock(&mut scenario, 0);
    let mut mandate = make_default_mandate(&mut scenario, &clock);
    let next_commit = terminal_commit();
    let w0_value = init_w0_for_action<TEST_COIN>(
        &mut mandate,
        &mut scenario,
        &clock,
        mandate::action_earn_deposit(),
        VAULT,
        100,
        &next_commit,
    );

    scenario.next_tx(AGENT);
    let r = payment::consume_witness<TEST_COIN>(
        &mut mandate,
        mandate::action_earn_deposit(),
        VAULT,
        100,
        w0_value,
        next_commit,
        &clock,
        scenario.ctx(),
    );
    action_registry::authorize_earn_harvest<TEST_COIN>(r, &mandate, VAULT, 100);

    abort 999
}

#[test, expected_failure(abort_code = payment::EReceiptAmountMismatch)]
fun receipt_amount_mismatch_aborts() {
    let mut scenario = ts::begin(OWNER);
    let clock = make_clock(&mut scenario, 0);
    let mut mandate = make_default_mandate(&mut scenario, &clock);
    let next_commit = terminal_commit();
    let w0_value = init_w0_for_action<TEST_COIN>(
        &mut mandate,
        &mut scenario,
        &clock,
        mandate::action_earn_deposit(),
        VAULT,
        100,
        &next_commit,
    );

    scenario.next_tx(AGENT);
    let r = payment::consume_witness<TEST_COIN>(
        &mut mandate,
        mandate::action_earn_deposit(),
        VAULT,
        100,
        w0_value,
        next_commit,
        &clock,
        scenario.ctx(),
    );
    action_registry::authorize_earn_deposit<TEST_COIN>(r, &mandate, VAULT, 200);

    abort 999
}

#[test]
fun seal_approve_passes_happy_path() {
    let mut scenario = ts::begin(OWNER);
    let clock = make_clock(&mut scenario, 0);
    let mut mandate = make_default_mandate(&mut scenario, &clock);
    init_current_commit(&mut mandate, &mut scenario, &clock);

    let ok = seal_policy::check_with_type<TEST_COIN>(
        &mandate,
        mandate::action_earn_deposit(),
        VAULT,
        500,
        terminal_commit(),
        &clock,
    );
    assert!(ok, 0);

    mandate::destroy_for_testing(mandate);
    clock::destroy_for_testing(clock);
    scenario.end();
}

#[test]
fun seal_approve_fails_without_witness_init() {
    let mut scenario = ts::begin(OWNER);
    let clock = make_clock(&mut scenario, 0);
    let mandate = make_default_mandate(&mut scenario, &clock);

    let ok = seal_policy::check_with_type<TEST_COIN>(
        &mandate,
        mandate::action_earn_deposit(),
        VAULT,
        500,
        terminal_commit(),
        &clock,
    );
    assert!(!ok, 0);

    mandate::destroy_for_testing(mandate);
    clock::destroy_for_testing(clock);
    scenario.end();
}

#[test]
fun seal_approve_fails_with_zero_amount() {
    let mut scenario = ts::begin(OWNER);
    let clock = make_clock(&mut scenario, 0);
    let mut mandate = make_default_mandate(&mut scenario, &clock);
    init_current_commit(&mut mandate, &mut scenario, &clock);

    let ok = seal_policy::check_with_type<TEST_COIN>(
        &mandate,
        mandate::action_earn_deposit(),
        VAULT,
        0,
        terminal_commit(),
        &clock,
    );
    assert!(!ok, 0);

    mandate::destroy_for_testing(mandate);
    clock::destroy_for_testing(clock);
    scenario.end();
}

#[test]
fun seal_approve_accepts_bound_identity() {
    let mut scenario = ts::begin(OWNER);
    let clock = make_clock(&mut scenario, 0);
    let mut mandate = make_default_mandate(&mut scenario, &clock);
    init_current_commit(&mut mandate, &mut scenario, &clock);
    let next_commit = terminal_commit();
    let id = mandate::derive_approval_id_with_type<TEST_COIN>(
        &mandate,
        mandate::action_earn_deposit(),
        VAULT,
        500,
        &next_commit,
    );

    seal_policy::seal_approve<TEST_COIN>(
        id,
        &mandate,
        mandate::action_earn_deposit(),
        VAULT,
        500,
        next_commit,
        &clock,
    );

    mandate::destroy_for_testing(mandate);
    clock::destroy_for_testing(clock);
    scenario.end();
}

#[test, expected_failure(abort_code = seal_policy::EInvalidApprovalId)]
fun seal_approve_aborts_on_wrong_identity() {
    let mut scenario = ts::begin(OWNER);
    let clock = make_clock(&mut scenario, 0);
    let mut mandate = make_default_mandate(&mut scenario, &clock);
    init_current_commit(&mut mandate, &mut scenario, &clock);

    seal_policy::seal_approve<TEST_COIN>(
        b"wrong_identity",
        &mandate,
        mandate::action_earn_deposit(),
        VAULT,
        500,
        terminal_commit(),
        &clock,
    );

    mandate::destroy_for_testing(mandate);
    clock::destroy_for_testing(clock);
    scenario.end();
}

#[test]
fun seal_approve_fails_when_revoked() {
    let mut scenario = ts::begin(OWNER);
    let clock = make_clock(&mut scenario, 0);
    let mut mandate = make_default_mandate(&mut scenario, &clock);
    init_current_commit(&mut mandate, &mut scenario, &clock);

    scenario.next_tx(OWNER);
    mandate.revoke(&clock, scenario.ctx());

    let ok = seal_policy::check_with_type<TEST_COIN>(
        &mandate,
        mandate::action_earn_deposit(),
        VAULT,
        500,
        terminal_commit(),
        &clock,
    );
    assert!(!ok, 0);

    mandate::destroy_for_testing(mandate);
    clock::destroy_for_testing(clock);
    scenario.end();
}

#[test]
fun seal_approve_fails_on_multi_bit_action() {
    let mut scenario = ts::begin(OWNER);
    let clock = make_clock(&mut scenario, 0);
    let mut mandate = make_default_mandate(&mut scenario, &clock);
    init_current_commit(&mut mandate, &mut scenario, &clock);

    let ok = seal_policy::check_with_type<TEST_COIN>(
        &mandate,
        mandate::action_earn_deposit() | mandate::action_earn_harvest(),
        VAULT,
        100,
        terminal_commit(),
        &clock,
    );
    assert!(!ok, 0);

    mandate::destroy_for_testing(mandate);
    clock::destroy_for_testing(clock);
    scenario.end();
}

#[test]
fun seal_approve_fails_when_over_per_tx_cap() {
    let mut scenario = ts::begin(OWNER);
    let clock = make_clock(&mut scenario, 0);
    let mut mandate = make_default_mandate(&mut scenario, &clock);
    init_current_commit(&mut mandate, &mut scenario, &clock);

    let ok = seal_policy::check_with_type<TEST_COIN>(
        &mandate,
        mandate::action_earn_deposit(),
        VAULT,
        PER_TX_CAP + 1,
        terminal_commit(),
        &clock,
    );
    assert!(!ok, 0);

    mandate::destroy_for_testing(mandate);
    clock::destroy_for_testing(clock);
    scenario.end();
}

#[test]
fun seal_approve_fails_on_wrong_target() {
    let mut scenario = ts::begin(OWNER);
    let clock = make_clock(&mut scenario, 0);
    let mut mandate = make_default_mandate(&mut scenario, &clock);
    init_current_commit(&mut mandate, &mut scenario, &clock);

    let ok = seal_policy::check_with_type<TEST_COIN>(
        &mandate,
        mandate::action_earn_deposit(),
        OTHER_VAULT,
        100,
        terminal_commit(),
        &clock,
    );
    assert!(!ok, 0);

    mandate::destroy_for_testing(mandate);
    clock::destroy_for_testing(clock);
    scenario.end();
}

#[test]
fun seal_approve_fails_on_wrong_coin() {
    let mut scenario = ts::begin(OWNER);
    let clock = make_clock(&mut scenario, 0);
    let mut mandate = make_default_mandate(&mut scenario, &clock);
    init_current_commit(&mut mandate, &mut scenario, &clock);

    let ok = seal_policy::check_with_type<OTHER_COIN>(
        &mandate,
        mandate::action_earn_deposit(),
        VAULT,
        100,
        terminal_commit(),
        &clock,
    );
    assert!(!ok, 0);

    mandate::destroy_for_testing(mandate);
    clock::destroy_for_testing(clock);
    scenario.end();
}

#[test]
fun seal_approve_fails_on_disallowed_action() {
    let mut scenario = ts::begin(OWNER);
    let clock = make_clock(&mut scenario, 0);
    let mut mandate = make_default_mandate(&mut scenario, &clock);
    init_current_commit(&mut mandate, &mut scenario, &clock);

    let ok = seal_policy::check_with_type<TEST_COIN>(
        &mandate,
        mandate::action_swap(),
        VAULT,
        100,
        terminal_commit(),
        &clock,
    );
    assert!(!ok, 0);

    mandate::destroy_for_testing(mandate);
    clock::destroy_for_testing(clock);
    scenario.end();
}

// ============================================================================
// P3-1: set_initial_witness boundary tests
// ============================================================================

#[test, expected_failure(abort_code = mandate::ENotOwner)]
fun set_initial_witness_aborts_when_not_owner() {
    let mut scenario = ts::begin(OWNER);
    let clock = make_clock(&mut scenario, 0);
    let mut mandate = make_default_mandate(&mut scenario, &clock);

    scenario.next_tx(AGENT);
    mandate::set_initial_witness(&mut mandate, b"some_commit", &clock, scenario.ctx());

    abort 999
}

#[test, expected_failure(abort_code = mandate::EInvalidCommit)]
fun set_initial_witness_aborts_with_empty_commit() {
    let mut scenario = ts::begin(OWNER);
    let clock = make_clock(&mut scenario, 0);
    let mut mandate = make_default_mandate(&mut scenario, &clock);

    scenario.next_tx(OWNER);
    mandate::set_initial_witness(&mut mandate, vector::empty(), &clock, scenario.ctx());

    abort 999
}

#[test, expected_failure(abort_code = mandate::ECommitTooLong)]
fun set_initial_witness_aborts_with_oversized_commit() {
    let mut scenario = ts::begin(OWNER);
    let clock = make_clock(&mut scenario, 0);
    let mut mandate = make_default_mandate(&mut scenario, &clock);

    scenario.next_tx(OWNER);
    mandate::set_initial_witness(&mut mandate, bytes_of_len(257), &clock, scenario.ctx());

    abort 999
}

// ============================================================================
// N-2: destroy_terminated tests
// ============================================================================

#[test]
fun destroy_terminated_after_revoke() {
    let mut scenario = ts::begin(OWNER);
    let clock = make_clock(&mut scenario, 0);
    let mut mandate = make_default_mandate(&mut scenario, &clock);

    scenario.next_tx(OWNER);
    mandate.revoke(&clock, scenario.ctx());
    mandate::destroy_terminated(mandate, &clock, scenario.ctx());

    clock::destroy_for_testing(clock);
    scenario.end();
}

#[test]
fun destroy_terminated_after_expiry() {
    let mut scenario = ts::begin(OWNER);
    let clock = make_clock(&mut scenario, 0);
    let mandate = make_default_mandate(&mut scenario, &clock);
    let mut clock2 = clock;
    clock2.set_for_testing(EXPIRY + 1);

    scenario.next_tx(OWNER);
    mandate::destroy_terminated(mandate, &clock2, scenario.ctx());

    clock::destroy_for_testing(clock2);
    scenario.end();
}

#[test, expected_failure(abort_code = mandate::EMandateNotTerminal)]
fun destroy_aborts_when_active() {
    let mut scenario = ts::begin(OWNER);
    let clock = make_clock(&mut scenario, 0);
    let mandate = make_default_mandate(&mut scenario, &clock);

    scenario.next_tx(OWNER);
    mandate::destroy_terminated(mandate, &clock, scenario.ctx());

    abort 999
}

#[test, expected_failure(abort_code = mandate::ENotOwner)]
fun destroy_aborts_when_not_owner() {
    let mut scenario = ts::begin(OWNER);
    let clock = make_clock(&mut scenario, 0);
    let mut mandate = make_default_mandate(&mut scenario, &clock);

    scenario.next_tx(OWNER);
    mandate.revoke(&clock, scenario.ctx());

    scenario.next_tx(STRANGER);
    mandate::destroy_terminated(mandate, &clock, scenario.ctx());

    abort 999
}

// ============================================================================
// N-3: create rejects expiry beyond MAX_PERIOD_MS
// ============================================================================

#[test, expected_failure(abort_code = mandate::EExpiryTooFar)]
fun create_aborts_when_expiry_too_far() {
    let mut scenario = ts::begin(OWNER);
    let clock = make_clock(&mut scenario, 0);
    let coin_types: vector<TypeName> = vector[type_name::with_defining_ids<TEST_COIN>()];
    let per_tx_caps: vector<u64> = vector[PER_TX_CAP];
    let period_caps: vector<u64> = vector[PERIOD_CAP];
    let allowed_targets: vector<address> = vector[VAULT];
    let metadata_keys: vector<String> = vector::empty();
    let metadata_values: vector<String> = vector::empty();

    // MAX_PERIOD_MS + 1 from now=0 ⇒ EExpiryTooFar
    let mandate = mandate::create(
        AGENT,
        mandate::action_earn_deposit(),
        coin_types,
        per_tx_caps,
        period_caps,
        DAY_MS,
        allowed_targets,
        31_536_000_001,
        metadata_keys,
        metadata_values,
        &clock,
        scenario.ctx(),
    );

    mandate::destroy_for_testing(mandate);
    abort 999
}

// ============================================================================
// N-4: CoinLimit degenerate configurations rejected at create
// ============================================================================

#[test, expected_failure(abort_code = mandate::EInvalidCoinLimit)]
fun create_aborts_with_zero_per_tx_cap() {
    let mut scenario = ts::begin(OWNER);
    let clock = make_clock(&mut scenario, 0);
    let coin_types: vector<TypeName> = vector[type_name::with_defining_ids<TEST_COIN>()];
    let per_tx_caps: vector<u64> = vector[0];
    let period_caps: vector<u64> = vector[PERIOD_CAP];
    let allowed_targets: vector<address> = vector[VAULT];
    let metadata_keys: vector<String> = vector::empty();
    let metadata_values: vector<String> = vector::empty();

    let mandate = mandate::create(
        AGENT,
        mandate::action_earn_deposit(),
        coin_types,
        per_tx_caps,
        period_caps,
        DAY_MS,
        allowed_targets,
        EXPIRY,
        metadata_keys,
        metadata_values,
        &clock,
        scenario.ctx(),
    );

    mandate::destroy_for_testing(mandate);
    abort 999
}

#[test, expected_failure(abort_code = mandate::EInvalidCoinLimit)]
fun create_aborts_with_zero_period_cap() {
    let mut scenario = ts::begin(OWNER);
    let clock = make_clock(&mut scenario, 0);
    let coin_types: vector<TypeName> = vector[type_name::with_defining_ids<TEST_COIN>()];
    let per_tx_caps: vector<u64> = vector[PER_TX_CAP];
    let period_caps: vector<u64> = vector[0];
    let allowed_targets: vector<address> = vector[VAULT];
    let metadata_keys: vector<String> = vector::empty();
    let metadata_values: vector<String> = vector::empty();

    let mandate = mandate::create(
        AGENT,
        mandate::action_earn_deposit(),
        coin_types,
        per_tx_caps,
        period_caps,
        DAY_MS,
        allowed_targets,
        EXPIRY,
        metadata_keys,
        metadata_values,
        &clock,
        scenario.ctx(),
    );

    mandate::destroy_for_testing(mandate);
    abort 999
}

#[test, expected_failure(abort_code = mandate::EInvalidCoinLimit)]
fun create_aborts_when_per_tx_exceeds_period() {
    let mut scenario = ts::begin(OWNER);
    let clock = make_clock(&mut scenario, 0);
    let coin_types: vector<TypeName> = vector[type_name::with_defining_ids<TEST_COIN>()];
    let per_tx_caps: vector<u64> = vector[200];
    let period_caps: vector<u64> = vector[100];
    let allowed_targets: vector<address> = vector[VAULT];
    let metadata_keys: vector<String> = vector::empty();
    let metadata_values: vector<String> = vector::empty();

    let mandate = mandate::create(
        AGENT,
        mandate::action_earn_deposit(),
        coin_types,
        per_tx_caps,
        period_caps,
        DAY_MS,
        allowed_targets,
        EXPIRY,
        metadata_keys,
        metadata_values,
        &clock,
        scenario.ctx(),
    );

    mandate::destroy_for_testing(mandate);
    abort 999
}

// ============================================================================
// F-9 / P3-2: nonce monotonicity across init + rotate
// ============================================================================

#[test]
fun nonce_increments_on_init_and_rotate() {
    let mut scenario = ts::begin(OWNER);
    let clock = make_clock(&mut scenario, 0);
    let mut mandate = make_default_mandate(&mut scenario, &clock);
    assert!(mandate.nonce() == 0, 0);

    let next_commit = terminal_commit();
    let witness = w0();
    let commit = commit_for<TEST_COIN>(
        &mandate,
        &witness,
        mandate::action_earn_deposit(),
        VAULT,
        100,
        &next_commit,
    );
    init_witness(&mut mandate, &mut scenario, &clock, commit);
    assert!(mandate.nonce() == 1, 1);

    scenario.next_tx(AGENT);
    let r = payment::consume_witness<TEST_COIN>(
        &mut mandate,
        mandate::action_earn_deposit(),
        VAULT,
        100,
        witness,
        next_commit,
        &clock,
        scenario.ctx(),
    );
    action_registry::authorize_earn_deposit<TEST_COIN>(r, &mandate, VAULT, 100);
    assert!(mandate.nonce() == 2, 2);
    assert!(*mandate.witness_commit() == terminal_commit(), 3);

    mandate::destroy_for_testing(mandate);
    clock::destroy_for_testing(clock);
    scenario.end();
}
