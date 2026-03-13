#[test_only]
module levo::test_vectors {
    #[test_only]
    public fun pubkey(): vector<u8> {
        x"cecc1507dc1ddd7295951c290888f095adb9044d1b73d696e6df065d683bd4fc"
    }

    #[test_only]
    public fun signature(): vector<u8> {
        x"9a7d2af200b0dd680826f1b4143aa1c0123ed2c934cd3cd96667376dae6ca6f55882288f9e5cda0dfc05b6a7234ad037f858f25c269676fabe5d16afee12b605"
    }

    #[test_only]
    public fun vault_id(): address {
        @0xbe2da0f5da9b87485ed37550e82378b1511261313a247cf174c1ae5811ec9fca
    }

    #[test_only]
    public fun new_owner(): address {
        @0x000000000000000000000000000000000000000000000000000000000000cafe
    }

    #[test_only]
    public fun second_new_owner(): address {
        @0x000000000000000000000000000000000000000000000000000000000000d00d
    }

    #[test_only]
    public fun recovery_signature(): vector<u8> {
        x"99f11e4482499b9ad1155cbb8c2af6adf5cf3dda579d82aeec8aa56fd903bfb2a3d05aeeab1edd7f8fdcce2c092b514283fbd35efb0e1c92f36305c5f034d10b"
    }

    #[test_only]
    public fun x_user_id(): u64 { 12345 }

    #[test_only]
    public fun sui_address(): address {
        @0x000000000000000000000000000000000000000000000000000000000000beef
    }

    #[test_only]
    public fun nonce(): u64 { 1 }

    #[test_only]
    public fun expires_at(): u64 { 9999999999999 }
}
