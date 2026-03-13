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
