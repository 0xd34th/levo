/// Integration tests for the full claim/sweep/withdraw flow.
///
/// These tests previously used the custom EnclaveRegistry with manually registered
/// public keys. The new Nautilus model requires a real Nitro attestation document
/// to register an Enclave<T> object, so full end-to-end verification tests must
/// be run against a deployed enclave (either debug mode or production).
///
/// TODO: Add integration tests once the enclave is deployed and we can generate
/// real IntentMessage<AttestationMessage> signatures with the enclave's ephemeral key.
/// For now, x_vault_tests.move covers the vault logic using claim_vault_for_testing.
#[test_only]
module levo::integration_tests {
    #[test]
    fun test_placeholder() {
        // Integration tests pending enclave deployment.
        // See x_vault_tests.move for vault logic coverage.
    }
}
