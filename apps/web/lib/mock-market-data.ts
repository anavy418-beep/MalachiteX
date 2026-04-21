export type MarketCategory =
  | "Large Cap"
  | "Meme"
  | "Layer 1"
  | "Layer 2"
  | "DeFi"
  | "Exchange"
  | "Stablecoin"
  | "AI / Web3";

export interface MockMarketCoin {
  name: string;
  symbol: string;
  price: number;
  change24h: number;
  marketCapBillions: number;
  volume24hBillions: number;
  category: MarketCategory;
  icon: string;
  trend: number[];
}

export const MARKET_CATEGORIES: Array<"All" | MarketCategory> = [
  "All",
  "Large Cap",
  "Meme",
  "Layer 1",
  "Layer 2",
  "DeFi",
  "Exchange",
  "Stablecoin",
  "AI / Web3",
];

const MOCK_MARKET_DATA_SEED: Array<Omit<MockMarketCoin, "icon">> = [
  { name: "Bitcoin", symbol: "BTC", price: 68420.1, change24h: 0.68, marketCapBillions: 1350, volume24hBillions: 28.4, category: "Large Cap", trend: [46, 51, 49, 57, 61, 66, 69] },
  { name: "Ethereum", symbol: "ETH", price: 3550.4, change24h: 1.02, marketCapBillions: 423, volume24hBillions: 14.2, category: "Layer 1", trend: [42, 45, 48, 47, 52, 55, 59] },
  { name: "Tether", symbol: "USDT", price: 1, change24h: 0.01, marketCapBillions: 112, volume24hBillions: 64.3, category: "Stablecoin", trend: [50, 50, 50, 51, 50, 50, 50] },
  { name: "BNB", symbol: "BNB", price: 612.35, change24h: 0.42, marketCapBillions: 90, volume24hBillions: 2.3, category: "Exchange", trend: [45, 44, 47, 48, 50, 51, 53] },
  { name: "Solana", symbol: "SOL", price: 158.77, change24h: -0.41, marketCapBillions: 74, volume24hBillions: 5.8, category: "Layer 1", trend: [58, 56, 53, 54, 52, 50, 49] },
  { name: "XRP", symbol: "XRP", price: 0.61, change24h: 0.24, marketCapBillions: 34, volume24hBillions: 1.7, category: "Large Cap", trend: [48, 49, 48, 50, 51, 51, 52] },
  { name: "USDC", symbol: "USDC", price: 1, change24h: -0.01, marketCapBillions: 33, volume24hBillions: 8.2, category: "Stablecoin", trend: [50, 50, 49, 50, 50, 50, 50] },
  { name: "Cardano", symbol: "ADA", price: 0.45, change24h: 1.12, marketCapBillions: 16, volume24hBillions: 0.9, category: "Layer 1", trend: [41, 44, 45, 47, 49, 51, 54] },
  { name: "Dogecoin", symbol: "DOGE", price: 0.14, change24h: 2.31, marketCapBillions: 20, volume24hBillions: 1.6, category: "Meme", trend: [40, 43, 47, 45, 49, 54, 58] },
  { name: "TRON", symbol: "TRX", price: 0.12, change24h: 0.37, marketCapBillions: 10, volume24hBillions: 0.5, category: "Layer 1", trend: [43, 44, 45, 46, 46, 47, 48] },
  { name: "Toncoin", symbol: "TON", price: 6.72, change24h: -0.84, marketCapBillions: 22, volume24hBillions: 0.7, category: "Layer 1", trend: [57, 56, 55, 54, 53, 52, 50] },
  { name: "Avalanche", symbol: "AVAX", price: 34.8, change24h: 1.45, marketCapBillions: 14, volume24hBillions: 0.8, category: "Layer 1", trend: [44, 45, 46, 50, 52, 54, 55] },
  { name: "Shiba Inu", symbol: "SHIB", price: 0.000024, change24h: -1.22, marketCapBillions: 13, volume24hBillions: 0.9, category: "Meme", trend: [56, 53, 52, 50, 48, 47, 45] },
  { name: "Polkadot", symbol: "DOT", price: 7.9, change24h: 0.53, marketCapBillions: 11, volume24hBillions: 0.42, category: "Layer 1", trend: [45, 46, 47, 47, 48, 49, 50] },
  { name: "Chainlink", symbol: "LINK", price: 18.44, change24h: 2.04, marketCapBillions: 11.5, volume24hBillions: 0.62, category: "DeFi", trend: [41, 43, 45, 49, 51, 54, 57] },
  { name: "Polygon", symbol: "POL", price: 0.98, change24h: 0.77, marketCapBillions: 9.8, volume24hBillions: 0.39, category: "Layer 2", trend: [44, 45, 46, 48, 49, 50, 52] },
  { name: "Litecoin", symbol: "LTC", price: 83.22, change24h: -0.62, marketCapBillions: 6.2, volume24hBillions: 0.5, category: "Large Cap", trend: [54, 53, 52, 51, 50, 49, 48] },
  { name: "Bitcoin Cash", symbol: "BCH", price: 502.37, change24h: 1.76, marketCapBillions: 9.9, volume24hBillions: 0.73, category: "Large Cap", trend: [42, 44, 47, 50, 53, 55, 57] },
  { name: "Uniswap", symbol: "UNI", price: 10.34, change24h: -0.35, marketCapBillions: 6.1, volume24hBillions: 0.31, category: "DeFi", trend: [53, 53, 52, 51, 51, 50, 49] },
  { name: "Aptos", symbol: "APT", price: 9.12, change24h: 0.63, marketCapBillions: 4.2, volume24hBillions: 0.28, category: "Layer 1", trend: [43, 45, 45, 47, 48, 49, 50] },
  { name: "Arbitrum", symbol: "ARB", price: 1.21, change24h: 1.54, marketCapBillions: 3.9, volume24hBillions: 0.41, category: "Layer 2", trend: [40, 42, 45, 47, 49, 52, 55] },
  { name: "Optimism", symbol: "OP", price: 2.61, change24h: 1.21, marketCapBillions: 3.1, volume24hBillions: 0.32, category: "Layer 2", trend: [42, 43, 44, 47, 49, 51, 53] },
  { name: "PEPE", symbol: "PEPE", price: 0.000012, change24h: 3.46, marketCapBillions: 4.8, volume24hBillions: 1.1, category: "Meme", trend: [38, 42, 45, 49, 52, 56, 60] },
  { name: "Render", symbol: "RNDR", price: 8.43, change24h: 2.18, marketCapBillions: 3.3, volume24hBillions: 0.36, category: "AI / Web3", trend: [41, 44, 46, 50, 53, 55, 58] },
  { name: "NEAR Protocol", symbol: "NEAR", price: 7.23, change24h: 0.89, marketCapBillions: 7.7, volume24hBillions: 0.44, category: "AI / Web3", trend: [44, 45, 46, 48, 49, 50, 52] },
  { name: "Sui", symbol: "SUI", price: 1.58, change24h: 1.31, marketCapBillions: 1.9, volume24hBillions: 0.24, category: "Layer 1", trend: [43, 44, 46, 47, 49, 51, 54] },
  { name: "Internet Computer", symbol: "ICP", price: 13.44, change24h: -0.28, marketCapBillions: 6.3, volume24hBillions: 0.21, category: "AI / Web3", trend: [52, 51, 50, 49, 49, 48, 47] },
  { name: "Kaspa", symbol: "KAS", price: 0.17, change24h: 0.95, marketCapBillions: 3.8, volume24hBillions: 0.11, category: "Layer 1", trend: [42, 44, 45, 47, 48, 50, 52] },
  { name: "Stellar", symbol: "XLM", price: 0.11, change24h: 0.18, marketCapBillions: 3.1, volume24hBillions: 0.16, category: "Large Cap", trend: [45, 45, 46, 46, 47, 47, 48] },
  { name: "Hedera", symbol: "HBAR", price: 0.13, change24h: 0.77, marketCapBillions: 4.4, volume24hBillions: 0.19, category: "Layer 1", trend: [43, 44, 45, 46, 48, 49, 50] },
  { name: "Filecoin", symbol: "FIL", price: 7.11, change24h: -0.91, marketCapBillions: 4.2, volume24hBillions: 0.29, category: "AI / Web3", trend: [55, 54, 53, 52, 50, 49, 48] },
  { name: "Injective", symbol: "INJ", price: 31.5, change24h: 2.62, marketCapBillions: 2.9, volume24hBillions: 0.33, category: "DeFi", trend: [40, 43, 47, 50, 52, 55, 59] },
  { name: "Aave", symbol: "AAVE", price: 112.42, change24h: 1.49, marketCapBillions: 1.7, volume24hBillions: 0.2, category: "DeFi", trend: [42, 44, 46, 48, 49, 51, 53] },
  { name: "Cosmos", symbol: "ATOM", price: 9.23, change24h: -0.44, marketCapBillions: 3.6, volume24hBillions: 0.15, category: "Layer 1", trend: [53, 52, 51, 50, 49, 49, 48] },
  { name: "Ethereum Classic", symbol: "ETC", price: 27.66, change24h: 0.39, marketCapBillions: 4.1, volume24hBillions: 0.27, category: "Layer 1", trend: [44, 45, 45, 46, 47, 48, 49] },
  { name: "Algorand", symbol: "ALGO", price: 0.2, change24h: -0.22, marketCapBillions: 1.6, volume24hBillions: 0.09, category: "Layer 1", trend: [51, 50, 49, 48, 48, 47, 46] },
];

const COINGECKO_ICON_BY_SYMBOL: Record<string, string> = {
  aave: "https://coin-images.coingecko.com/coins/images/12645/large/aave-token-round.png?1720472354",
  ada: "https://coin-images.coingecko.com/coins/images/975/large/cardano.png?1696502090",
  algo: "https://coin-images.coingecko.com/coins/images/4380/large/download.png?1696504978",
  apt: "https://coin-images.coingecko.com/coins/images/26455/large/Aptos-Network-Symbol-Black-RGB-1x.png?1761789140",
  arb: "https://coin-images.coingecko.com/coins/images/16547/large/arb.jpg?1721358242",
  atom: "https://coin-images.coingecko.com/coins/images/1481/large/cosmos_hub.png?1696502525",
  avax: "https://coin-images.coingecko.com/coins/images/12559/large/Avalanche_Circle_RedWhite_Trans.png?1696512369",
  bch: "https://coin-images.coingecko.com/coins/images/780/large/bitcoin-cash-circle.png?1696501932",
  bnb: "https://coin-images.coingecko.com/coins/images/825/large/bnb-icon2_2x.png?1696501970",
  btc: "https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png?1696501400",
  doge: "https://coin-images.coingecko.com/coins/images/5/large/dogecoin.png?1696501409",
  dot: "https://coin-images.coingecko.com/coins/images/12171/large/polkadot.jpg?1766533446",
  etc: "https://coin-images.coingecko.com/coins/images/453/large/ethereum-classic-logo.png?1696501717",
  eth: "https://coin-images.coingecko.com/coins/images/279/large/ethereum.png?1696501628",
  fil: "https://coin-images.coingecko.com/coins/images/12817/large/filecoin.png?1696512609",
  hbar: "https://coin-images.coingecko.com/coins/images/3688/large/hbar.png?1696504364",
  icp: "https://coin-images.coingecko.com/coins/images/14495/large/Internet_Computer_logo.png?1696514180",
  inj: "https://coin-images.coingecko.com/coins/images/12882/large/Other_200x200.png?1738782212",
  kas: "https://coin-images.coingecko.com/coins/images/25751/large/kaspa-icon-exchanges.png?1696524837",
  link: "https://coin-images.coingecko.com/coins/images/877/large/Chainlink_Logo_500.png?1760023405",
  ltc: "https://coin-images.coingecko.com/coins/images/2/large/litecoin.png?1696501400",
  near: "https://coin-images.coingecko.com/coins/images/10365/large/near.jpg?1696510367",
  op: "https://coin-images.coingecko.com/coins/images/25244/large/Token.png?1774456081",
  pepe: "https://coin-images.coingecko.com/coins/images/29850/large/pepe-token.jpeg?1696528776",
  pol: "https://coin-images.coingecko.com/coins/images/32440/large/pol.png?1759114181",
  rndr: "https://coin-images.coingecko.com/coins/images/11636/large/rndr.png?1696511529",
  shib: "https://coin-images.coingecko.com/coins/images/11939/large/shiba.png?1696511800",
  sol: "https://coin-images.coingecko.com/coins/images/4128/large/solana.png?1718769756",
  sui: "https://coin-images.coingecko.com/coins/images/26375/large/sui-ocean-square.png?1727791290",
  ton: "https://coin-images.coingecko.com/coins/images/17980/large/photo_2024-09-10_17.09.00.jpeg",
  trx: "https://coin-images.coingecko.com/coins/images/1094/large/photo_2026-04-13_09-59-16.png?1776048311",
  uni: "https://coin-images.coingecko.com/coins/images/12504/large/uniswap-logo.png?1720676669",
  usdc: "https://coin-images.coingecko.com/coins/images/6319/large/USDC.png?1769615602",
  usdt: "https://coin-images.coingecko.com/coins/images/325/large/Tether.png?1696501661",
  xlm: "https://coin-images.coingecko.com/coins/images/100/large/fmpFRHHQ_400x400.jpg?1735231350",
  xrp: "https://coin-images.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png?1696501442",
};

const buildCoinIconPath = (symbol: string) => {
  const normalized = symbol.toLowerCase();
  return COINGECKO_ICON_BY_SYMBOL[normalized] ?? "/icons/coin-fallback.png";
};

export const MOCK_MARKET_DATA: MockMarketCoin[] = MOCK_MARKET_DATA_SEED.map((coin) => ({
  ...coin,
  icon: buildCoinIconPath(coin.symbol),
}));
