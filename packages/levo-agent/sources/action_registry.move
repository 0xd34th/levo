module levo_agent::action_registry;

use std::type_name::TypeName;
use sui::event;

use levo_agent::mandate::{Self, Mandate};
use levo_agent::payment::{Self, WitnessReceipt};

const EUnknownAction: u64 = 1;

public struct EarnDepositAuthorized has copy, drop {
    mandate_id: ID,
    coin_type: TypeName,
    target: address,
    amount: u64,
}

public struct EarnWithdrawAuthorized has copy, drop {
    mandate_id: ID,
    coin_type: TypeName,
    target: address,
    amount: u64,
}

public struct EarnHarvestAuthorized has copy, drop {
    mandate_id: ID,
    coin_type: TypeName,
    target: address,
    amount: u64,
}

public fun authorize_earn_deposit<C>(
    receipt: WitnessReceipt,
    mandate: &Mandate,
    target: address,
    amount: u64,
) {
    let (mid, _action, coin_type, target_out, amount_out) =
        payment::unpack_for_action<C>(
            receipt,
            object::id(mandate),
            mandate::action_earn_deposit(),
            target,
            amount,
        );
    event::emit(EarnDepositAuthorized {
        mandate_id: mid,
        coin_type,
        target: target_out,
        amount: amount_out,
    });
}

public fun authorize_earn_withdraw<C>(
    receipt: WitnessReceipt,
    mandate: &Mandate,
    target: address,
    amount: u64,
) {
    let (mid, _action, coin_type, target_out, amount_out) =
        payment::unpack_for_action<C>(
            receipt,
            object::id(mandate),
            mandate::action_earn_withdraw(),
            target,
            amount,
        );
    event::emit(EarnWithdrawAuthorized {
        mandate_id: mid,
        coin_type,
        target: target_out,
        amount: amount_out,
    });
}

public fun authorize_earn_harvest<C>(
    receipt: WitnessReceipt,
    mandate: &Mandate,
    target: address,
    amount: u64,
) {
    let (mid, _action, coin_type, target_out, amount_out) =
        payment::unpack_for_action<C>(
            receipt,
            object::id(mandate),
            mandate::action_earn_harvest(),
            target,
            amount,
        );
    event::emit(EarnHarvestAuthorized {
        mandate_id: mid,
        coin_type,
        target: target_out,
        amount: amount_out,
    });
}

public fun authorize_for_action<C>(
    receipt: WitnessReceipt,
    mandate: &Mandate,
    action: u32,
    target: address,
    amount: u64,
) {
    if (action == mandate::action_earn_deposit()) {
        authorize_earn_deposit<C>(receipt, mandate, target, amount);
    } else if (action == mandate::action_earn_withdraw()) {
        authorize_earn_withdraw<C>(receipt, mandate, target, amount);
    } else if (action == mandate::action_earn_harvest()) {
        authorize_earn_harvest<C>(receipt, mandate, target, amount);
    } else {
        abort EUnknownAction
    }
}
