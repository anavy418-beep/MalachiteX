import { createHash } from "node:crypto";

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const HEX_ALPHABET = "abcdef0123456789";
const WALLET_ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const BTC_BECH32_ALPHABET = "023456789acdefghjklmnpqrstuvwxyz";

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededChars(seed: string, alphabet: string, length: number): string {
  let state = hashSeed(seed) || 1;
  let output = "";

  for (let i = 0; i < length; i += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    output += alphabet[Math.abs(state) % alphabet.length];
  }

  return output;
}

export function buildWalletIdentifier(seed: string, asset = "USDT"): string {
  const normalizedAsset = asset.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) || "USDT";
  const suffix = seededChars(`${seed}:wallet:${normalizedAsset}`, WALLET_ID_ALPHABET, 8);
  return `MLX-${normalizedAsset}-${suffix}`;
}

export function buildDepositAddresses(seed: string): {
  BTC: string;
  ERC20: string;
  TRC20: string;
} {
  const stableSeed = createHash("sha256").update(seed).digest("hex");
  return {
    BTC: `bc1q${seededChars(`${stableSeed}:btc`, BTC_BECH32_ALPHABET, 30)}`,
    ERC20: `0x${seededChars(`${stableSeed}:erc20`, HEX_ALPHABET, 40)}`,
    TRC20: `T${seededChars(`${stableSeed}:trc20`, BASE58_ALPHABET, 33)}`,
  };
}
