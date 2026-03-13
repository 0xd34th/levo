/**
 * Generate Ed25519 test vectors for Sui Move tests.
 *
 * Signs BCS-encoded claim and owner-handoff attestation payloads and outputs
 * Move hex literals that can be pasted directly into Move test files.
 *
 * Claim message layout (88 bytes total):
 *   x_user_id   : u64     (8 bytes LE)
 *   sui_address  : address (32 bytes raw)
 *   nonce        : u64     (8 bytes LE)
 *   expires_at   : u64     (8 bytes LE)
 *   registry_id  : address (32 bytes raw)
 *
 * Owner handoff layout (152 bytes total):
 *   x_user_id         : u64     (8 bytes LE)
 *   vault_id          : address (32 bytes raw)
 *   current_owner     : address (32 bytes raw)
 *   new_owner         : address (32 bytes raw)
 *   recovery_counter  : u64     (8 bytes LE)
 *   expires_at        : u64     (8 bytes LE)
 *   registry_id       : address (32 bytes raw)
 *
 * The registry_id field acts as a domain separator, binding the signature
 * to a specific EnclaveRegistry deployment. To get the registry_id from
 * a test_scenario, print
 * `nautilus_verifier::registry_address_for_testing(&registry)` from a Move
 * test and run `sui move test`. To get a deterministic test vault id, print
 * `x_vault::derive_vault_address(&registry, TEST_X_USER_ID)` from the same
 * scenario after `x_vault::init_for_testing`.
 *
 * Usage from the repository root:
 *   npm run generate:test-vectors -- <registry_id_hex> [vault_id_hex] [new_owner_hex]
 */

// @ts-ignore — noble/curves exports with .js extension
import { ed25519 } from "@noble/curves/ed25519.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Encode a bigint / number as 8-byte little-endian Uint8Array (u64 BCS). */
function u64LE(value: number | bigint): Uint8Array {
  const buf = new Uint8Array(8);
  let v = BigInt(value);
  for (let i = 0; i < 8; i++) {
    buf[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return buf;
}

/** Parse a hex string (with or without 0x prefix) into Uint8Array. */
function hexToBytes(hex: string, label = "hex string"): Uint8Array {
  const h = hex.replace(/^0x/i, "");
  if (!/^[0-9a-fA-F]*$/.test(h)) {
    throw new Error(
      `Invalid ${label}: ${hex}. Expected only hexadecimal characters.`
    );
  }
  const padded = h.padStart(Math.ceil(h.length / 2) * 2, "0");
  const bytes = new Uint8Array(padded.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(padded.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Convert Uint8Array to hex string (no prefix). */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---------------------------------------------------------------------------
// Test parameters
// ---------------------------------------------------------------------------

const TEST_X_USER_ID = 12345n;
const TEST_SUI_ADDRESS_HEX =
  "0x000000000000000000000000000000000000000000000000000000000000beef";
const TEST_NEW_OWNER_HEX_DEFAULT =
  "0x000000000000000000000000000000000000000000000000000000000000cafe";
const TEST_NONCE = 1n;
const TEST_RECOVERY_COUNTER = 0n;
const TEST_EXPIRES_AT = 9_999_999_999_999n;

// Registry ID from test_scenario (deterministic when init_for_testing is called
// first in a scenario beginning with @0xAD). Must be provided via CLI argument:
//   npm run generate:test-vectors -- 0x<registry_id_hex>
const TEST_REGISTRY_ID_HEX = process.argv[2];
const TEST_VAULT_ID_HEX = process.argv[3];
const TEST_NEW_OWNER_HEX = process.argv[4] ?? TEST_NEW_OWNER_HEX_DEFAULT;
if (!TEST_REGISTRY_ID_HEX) {
  console.error(
    "Error: registry_id is required.\n" +
    "Usage: npm run generate:test-vectors -- <registry_id_hex> [vault_id_hex] [new_owner_hex]\n" +
    "  Get the registry_id by printing " +
    "nautilus_verifier::registry_address_for_testing(&registry) in a Move test."
  );
  process.exit(1);
}

// Deterministic private key: first byte = 1, rest = 0 (32 bytes).
const PRIVATE_KEY = new Uint8Array(32);
PRIVATE_KEY[0] = 1;

// ---------------------------------------------------------------------------
// Build BCS message (88 bytes)
// ---------------------------------------------------------------------------

const bcsXUserId = u64LE(TEST_X_USER_ID); // 8
let bcsSuiAddress: Uint8Array;
let bcsRegistryId: Uint8Array;
let bcsVaultId: Uint8Array | undefined;
let bcsNewOwner: Uint8Array | undefined;
try {
  bcsSuiAddress = hexToBytes(TEST_SUI_ADDRESS_HEX, "sui address"); // 32
  bcsRegistryId = hexToBytes(TEST_REGISTRY_ID_HEX, "registry_id"); // 32
  if (TEST_VAULT_ID_HEX) {
    bcsVaultId = hexToBytes(TEST_VAULT_ID_HEX, "vault_id");
    bcsNewOwner = hexToBytes(TEST_NEW_OWNER_HEX, "new_owner");
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exit(1);
}
const bcsNonce = u64LE(TEST_NONCE); // 8
const bcsExpiresAt = u64LE(TEST_EXPIRES_AT); // 8

if (bcsSuiAddress.length !== 32) {
  throw new Error(`Address must be 32 bytes, got ${bcsSuiAddress.length}`);
}
if (bcsRegistryId.length !== 32) {
  throw new Error(`Registry ID must be 32 bytes, got ${bcsRegistryId.length}`);
}
if (bcsVaultId && bcsVaultId.length !== 32) {
  throw new Error(`Vault ID must be 32 bytes, got ${bcsVaultId.length}`);
}
if (bcsNewOwner && bcsNewOwner.length !== 32) {
  throw new Error(`New owner must be 32 bytes, got ${bcsNewOwner.length}`);
}

const claimMessage = new Uint8Array(88);
claimMessage.set(bcsXUserId, 0);
claimMessage.set(bcsSuiAddress, 8);
claimMessage.set(bcsNonce, 40);
claimMessage.set(bcsExpiresAt, 48);
claimMessage.set(bcsRegistryId, 56);

let recoveryMessage: Uint8Array | undefined;
if (bcsVaultId && bcsNewOwner) {
  const bcsRecoveryCounter = u64LE(TEST_RECOVERY_COUNTER);
  recoveryMessage = new Uint8Array(152);
  recoveryMessage.set(bcsXUserId, 0);
  recoveryMessage.set(bcsVaultId, 8);
  recoveryMessage.set(bcsSuiAddress, 40);
  recoveryMessage.set(bcsNewOwner, 72);
  recoveryMessage.set(bcsRecoveryCounter, 104);
  recoveryMessage.set(bcsExpiresAt, 112);
  recoveryMessage.set(bcsRegistryId, 120);
}

// ---------------------------------------------------------------------------
// Sign
// ---------------------------------------------------------------------------

const publicKey = ed25519.getPublicKey(PRIVATE_KEY);
const claimSignature = ed25519.sign(claimMessage, PRIVATE_KEY);
const recoverySignature = recoveryMessage
  ? ed25519.sign(recoveryMessage, PRIVATE_KEY)
  : undefined;

// Verify locally to be safe
const claimOk = ed25519.verify(claimSignature, claimMessage, publicKey);
if (!claimOk) {
  throw new Error("Local verification failed — something is wrong");
}
const recoveryOk =
  recoverySignature && recoveryMessage
    ? ed25519.verify(recoverySignature, recoveryMessage, publicKey)
    : undefined;
if (recoveryOk === false) {
  throw new Error("Local handoff verification failed — something is wrong");
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

console.log("// =========================================================");
console.log("// Ed25519 test vectors for Sui Move");
console.log("// Generated by scripts/generate-test-vectors.ts");
console.log("// =========================================================");
console.log();
console.log("// --- Claim raw bytes (debug) ---");
console.log(`// Private key (32): ${bytesToHex(PRIVATE_KEY)}`);
console.log(`// Public key  (32): ${bytesToHex(publicKey)}`);
console.log(`// Signature   (64): ${bytesToHex(claimSignature)}`);
console.log(`// Message     (88): ${bytesToHex(claimMessage)}`);
console.log(`// Local verify: ${claimOk}`);
console.log();
console.log("// --- Claim BCS breakdown ---");
console.log(`// x_user_id    LE: ${bytesToHex(bcsXUserId)}`);
console.log(`// sui_address     : ${bytesToHex(bcsSuiAddress)}`);
console.log(`// nonce        LE: ${bytesToHex(bcsNonce)}`);
console.log(`// expires_at   LE: ${bytesToHex(bcsExpiresAt)}`);
console.log(`// registry_id    : ${bytesToHex(bcsRegistryId)}`);
console.log();
console.log("// --- Claim Move constants (paste into your test module) ---");
console.log();
console.log(
  `const TEST_PUBKEY: vector<u8> = x"${bytesToHex(publicKey)}";`
);
console.log(
  `const TEST_SIGNATURE: vector<u8> = x"${bytesToHex(claimSignature)}";`
);
console.log(`const TEST_X_USER_ID: u64 = ${TEST_X_USER_ID};`);
console.log(
  `const TEST_SUI_ADDRESS: address = @0x${bytesToHex(bcsSuiAddress)};`
);
console.log(`const TEST_NONCE: u64 = ${TEST_NONCE};`);
console.log(`const TEST_EXPIRES_AT: u64 = ${TEST_EXPIRES_AT};`);
console.log();
console.log("// --- Claim message as hex (for manual checking) ---");
console.log(
  `const TEST_MESSAGE: vector<u8> = x"${bytesToHex(claimMessage)}";`
);

if (recoveryMessage && recoverySignature && bcsVaultId && bcsNewOwner) {
  console.log();
  console.log("// --- Owner handoff raw bytes (debug) ---");
  console.log(`// Recovery signature (64): ${bytesToHex(recoverySignature)}`);
  console.log(`// Recovery message  (152): ${bytesToHex(recoveryMessage)}`);
  console.log(`// Local handoff verify: ${recoveryOk}`);
  console.log();
  console.log("// --- Owner handoff BCS breakdown ---");
  console.log(`// vault_id            : ${bytesToHex(bcsVaultId)}`);
  console.log(`// current_owner       : ${bytesToHex(bcsSuiAddress)}`);
  console.log(`// new_owner           : ${bytesToHex(bcsNewOwner)}`);
  console.log(`// recovery_counter LE : ${bytesToHex(u64LE(TEST_RECOVERY_COUNTER))}`);
  console.log(`// expires_at       LE : ${bytesToHex(bcsExpiresAt)}`);
  console.log(`// registry_id         : ${bytesToHex(bcsRegistryId)}`);
  console.log();
  console.log("// --- Owner handoff Move constants ---");
  console.log(
    `const TEST_VAULT_ID: address = @0x${bytesToHex(bcsVaultId)};`
  );
  console.log(
    `const TEST_NEW_OWNER: address = @0x${bytesToHex(bcsNewOwner)};`
  );
  console.log(
    `const TEST_RECOVERY_SIGNATURE: vector<u8> = x"${bytesToHex(recoverySignature)}";`
  );
  console.log(
    `const TEST_RECOVERY_MESSAGE: vector<u8> = x"${bytesToHex(recoveryMessage)}";`
  );
}
