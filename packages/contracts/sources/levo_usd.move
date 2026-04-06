module levo::levo_usd {
    use sui::coin_registry;

    /// One-time witness for the StableLayer-backed settlement asset.
    public struct LEVO_USD has drop {}

    fun init(witness: LEVO_USD, ctx: &mut TxContext) {
        let (builder, treasury_cap) = coin_registry::new_currency_with_otw(
            witness,
            6,
            b"LEVOUSD".to_string(),
            b"Levo USD".to_string(),
            b"Levo USD - StableLayer backed settlement asset".to_string(),
            b"".to_string(),
            ctx,
        );

        builder.finalize_and_delete_metadata_cap(ctx);
        transfer::public_transfer(treasury_cap, ctx.sender());
    }
}
