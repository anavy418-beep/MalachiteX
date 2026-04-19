export type WalletNetwork = "BTC" | "ERC20" | "TRC20";

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
    const index = Math.abs(state) % alphabet.length;
    output += alphabet[index];
  }

  return output;
}

export function buildWalletId(seed: string, asset = "USDT"): string {
  const normalizedAsset = asset.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) || "USDT";
  const suffix = seededChars(`${seed}:wallet:${normalizedAsset}`, WALLET_ID_ALPHABET, 8);
  return `MLX-${normalizedAsset}-${suffix}`;
}

export function buildDepositAddresses(seed: string): Record<WalletNetwork, string> {
  return {
    BTC: `bc1q${seededChars(`${seed}:btc`, BTC_BECH32_ALPHABET, 30)}`,
    ERC20: `0x${seededChars(`${seed}:erc20`, HEX_ALPHABET, 40)}`,
    TRC20: `T${seededChars(`${seed}:trc20`, BASE58_ALPHABET, 33)}`,
  };
}

export function getWalletNetworkLabel(network: WalletNetwork) {
  if (network === "BTC") return "BTC";
  if (network === "TRC20") return "USDT (TRC20)";
  return "USDT (ERC20)";
}

export function getDemoWalletIdentity(seed: string, asset = "USDT") {
  return {
    walletId: buildWalletId(seed, asset),
    addresses: buildDepositAddresses(seed),
  };
}

export function resolveWalletIdentity(params: {
  walletId?: string;
  currency?: string;
  depositAddresses?: Partial<Record<WalletNetwork, string>>;
  seedHint?: string;
  selectedNetwork?: WalletNetwork;
}) {
  const network = params.selectedNetwork ?? "ERC20";
  const seed =
    params.walletId ||
    params.seedHint ||
    `malachitex:${(params.currency ?? "INR").toUpperCase()}:primary`;
  const assetForId = network === "BTC" ? "BTC" : "USDT";
  const fallback = getDemoWalletIdentity(seed, assetForId);

  return {
    walletId: params.walletId ?? fallback.walletId,
    addresses: {
      BTC: params.depositAddresses?.BTC ?? fallback.addresses.BTC,
      ERC20: params.depositAddresses?.ERC20 ?? fallback.addresses.ERC20,
      TRC20: params.depositAddresses?.TRC20 ?? fallback.addresses.TRC20,
    } as Record<WalletNetwork, string>,
  };
}
