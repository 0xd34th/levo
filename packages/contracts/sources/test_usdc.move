module levo::test_usdc {
    use sui::coin;
    use sui::coin_registry;

    /// One-time witness for coin registration
    public struct TEST_USDC has drop {}

    /// Called on module publish. Creates the TEST_USDC coin type
    /// and shares the TreasuryCap so anyone can mint on testnet.
    fun init(witness: TEST_USDC, ctx: &mut TxContext) {
        let (builder, treasury_cap) = coin_registry::new_currency_with_otw(
            witness,
            6, // 6 decimals like real USDC
            b"TUSDC".to_string(),
            b"Test USDC".to_string(),
            b"Mock USDC for Levo testnet".to_string(),
            b"".to_string(),
            ctx,
        );
        builder.finalize_and_delete_metadata_cap(ctx);
        transfer::public_share_object(treasury_cap);
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
