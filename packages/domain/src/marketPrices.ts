/** Public DTO only. Credentials and provider job URLs must never cross this boundary. */
export const marketPriceSources = ['cardmarket', 'ebay_fr', 'ebay_us', 'vinted', 'gcc'] as const;
export type MarketPriceSource = (typeof marketPriceSources)[number];
export type MarketPriceMode = 'sold' | 'active';
export type MarketPriceQuery = {
  source: MarketPriceSource;
  query: string;
  productUrl?: string;
  mode?: MarketPriceMode;
  page?: number;
  cursor?: string;
  language?: string;
  gradingCompany?: string;
  grade?: string;
  collectorNumber?: string;
  setName?: string;
};
export type MarketMoney = { amountMinor: number; currency: string };
export type MatchEvidence = 'match' | 'mismatch' | 'unknown';
export type MarketListing = {
  id: string;
  source: MarketPriceSource;
  provider: 'gcc_public' | 'vinted_public' | 'ebay_public' | 'cardmarket_public';
  title: string;
  url: string;
  imageUrl: string | null;
  state: 'sold' | 'active' | 'unknown';
  format: 'fixed_price' | 'auction' | 'unknown';
  /** Displayed price is never automatically an acquisition estimate. */
  price: MarketMoney | null;
  priceRange: { minimum: MarketMoney; maximum: MarketMoney } | null;
  priceBasis: 'asking' | 'current_bid' | 'provider_sold' | 'accepted_offer_unknown' | 'unknown';
  shipping: MarketMoney | null;
  buyerProtectionFee: MarketMoney | null;
  totalBeforeShipping: MarketMoney | null;
  soldAt: string | null;
  condition: string | null;
  language: string | null;
  gradingCompany: string | null;
  grade: string | null;
  collectorNumber: string | null;
  setName: string | null;
  /** Candidate results: matching only compares explicit structured fields, never title guesses. */
  match: {
    language: MatchEvidence;
    gradingCompany: MatchEvidence;
    grade: MatchEvidence;
    collectorNumber: MatchEvidence;
    setName: MatchEvidence;
  };
  matchConfidence: 'confirmed' | 'candidate';
  matchReasons: string[];
  warnings: string[];
};
export type MarketPriceStatus =
  | 'ready'
  | 'empty'
  | 'pending'
  | 'access_required'
  | 'unavailable'
  | 'unsupported';
export type MarketPriceResult = {
  source: MarketPriceSource;
  provider: 'gcc_public' | 'vinted_public' | 'ebay_public' | 'cardmarket_public' | null;
  query: string;
  mode: MarketPriceMode;
  status: MarketPriceStatus;
  listings: MarketListing[];
  productCandidates?: { title: string; url: string; imageUrl: string | null }[];
  page: number;
  nextPage: number | null;
  nextCursor: string | null;
  fetchedAt: string;
  cached: boolean;
  message: string;
  limitations: string[];
  retryAfterSeconds?: number;
};
