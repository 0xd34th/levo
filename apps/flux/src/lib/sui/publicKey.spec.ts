import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Secp256k1Keypair } from "@mysten/sui/keypairs/secp256k1";
import { Secp256r1Keypair } from "@mysten/sui/keypairs/secp256r1";
import { publicKeyFromRawBytes } from "@mysten/sui/verify";
import { describe, expect, it } from "vitest";
import { decodeSuiPublicKey } from "./publicKey";

describe("decodeSuiPublicKey", () => {
  it("decodes raw Ed25519 public keys", () => {
    const keypair = new Ed25519Keypair();
    const publicKey = decodeSuiPublicKey(keypair.getPublicKey().toRawBytes(), {
      address: keypair.getPublicKey().toSuiAddress(),
    });

    expect(publicKey.toSuiAddress()).toBe(keypair.getPublicKey().toSuiAddress());
  });

  it("decodes raw Secp256k1 public keys by matching the account address", () => {
    const keypair = new Secp256k1Keypair();
    const publicKey = decodeSuiPublicKey(keypair.getPublicKey().toRawBytes(), {
      address: keypair.getPublicKey().toSuiAddress(),
    });

    expect(publicKey.flag()).toBe(keypair.getPublicKey().flag());
    expect(publicKey.toSuiAddress()).toBe(keypair.getPublicKey().toSuiAddress());
  });

  it("decodes raw Secp256r1 public keys by matching the account address", () => {
    const keypair = new Secp256r1Keypair();
    const publicKey = decodeSuiPublicKey(keypair.getPublicKey().toRawBytes(), {
      address: keypair.getPublicKey().toSuiAddress(),
    });

    expect(publicKey.flag()).toBe(keypair.getPublicKey().flag());
    expect(publicKey.toSuiAddress()).toBe(keypair.getPublicKey().toSuiAddress());
  });

  it("decodes raw Passkey public keys by matching the account address", () => {
    const rawPublicKey = new Secp256r1Keypair().getPublicKey().toRawBytes();
    const passkeyPublicKey = publicKeyFromRawBytes("Passkey", rawPublicKey);
    const publicKey = decodeSuiPublicKey(rawPublicKey, {
      address: passkeyPublicKey.toSuiAddress(),
    });

    expect(publicKey.flag()).toBe(passkeyPublicKey.flag());
    expect(publicKey.toSuiAddress()).toBe(passkeyPublicKey.toSuiAddress());
  });

  it("decodes 62-byte raw zkLogin public identifiers by matching the account address", () => {
    const rawPublicKey = createRawZkLoginPublicIdentifier();
    const zkLoginPublicKey = publicKeyFromRawBytes("ZkLogin", rawPublicKey);
    const publicKey = decodeSuiPublicKey(rawPublicKey, {
      address: zkLoginPublicKey.toSuiAddress(),
    });

    expect(rawPublicKey).toHaveLength(62);
    expect(publicKey.flag()).toBe(zkLoginPublicKey.flag());
    expect(publicKey.toSuiAddress()).toBe(zkLoginPublicKey.toSuiAddress());
  });

  it("rejects malformed raw public-key bytes", () => {
    expect(() => decodeSuiPublicKey(new Uint8Array(62))).toThrow(
      "Invalid Sui public key",
    );
  });
});

function createRawZkLoginPublicIdentifier(): Uint8Array {
  const issuer = "https://issuer.example.com/aa";
  const issuerBytes = new TextEncoder().encode(issuer);
  const addressSeed = new Uint8Array(32).fill(7);
  const publicKey = new Uint8Array(1 + issuerBytes.length + addressSeed.length);

  publicKey[0] = issuerBytes.length;
  publicKey.set(issuerBytes, 1);
  publicKey.set(addressSeed, 1 + issuerBytes.length);

  return publicKey;
}
