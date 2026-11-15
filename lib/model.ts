// LaunchScope's model: one sealed snapshot of the protocol universe in, one ranked board out.
//
// The board ranks every protocol that records no token yet and is not a wrapped, staked or bridged
// product of one that trades: the snapshot's watchlist (the floor, never a ceiling) plus every
// protocol below that floor the same rule keeps. Protocols whose token already trades are set
// apart with the market's own values and are never mixed into the ranking.
//
// Implied value is calibrated from the snapshot itself, not from a constant anyone picked:
//
//   calibration  The protocols whose tokens already trade and report a market cap are the only
//                evidence of what a token is worth against TVL. Their market-cap / TVL ratios give
//                a market multiple: the median over all of them, and one median per category.
//                A category's multiple is shrunk toward the market median by its sample size,
//                so a category with two live tokens barely moves the number and one with twenty
//                speaks for itself. Exchange (CEX) records are left out of the calibration: an
//                exchange's TVL is customer balances, not a product the market prices per dollar.
//   implied      = tvl_usd x multiple(category)
//                x growthMultiplier    clamp(change_7d, -50, 100) percent at weight 0.45
//                x maturityMultiplier  0.72 + 0.38 x (1 - exp(-age_days / 540))
//                x breadthMultiplier   1 + 0.015 x min(chains - 1, 8)
//
// Age is the days since DefiLlama first tracked the protocol: how long it has run with no token.
// An unrecorded age uses the median age of the ranked protocols that carry one. No protocol name
// is ever special-cased: one function scores every row, and the dashboard recomputes each row
// from the same figures and shows the two numbers agree.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's fixed weights. The multiples themselves are calibrated from the snapshot. */
export interface ModelConstants {
  /** Live samples a category needs before its own median outweighs the market median. */
  shrink_k: number;
  /** The multiple is kept inside this band however the calibration comes out. */
  multiple_floor: number;
  multiple_cap: number;
  growth_weight: number;
  growth_floor_pct: number;
  growth_cap_pct: number;
  maturity_base: number;
  maturity_span: number;
  maturity_tau_days: number;
  breadth_per_chain: number;
  breadth_max_extra_chains: number;
}

export const MODEL: ModelConstants = {
  shrink_k: 6,
  multiple_floor: 0.03,
  multiple_cap: 1.25,
  growth_weight: 0.45,
  growth_floor_pct: -50,
  growth_cap_pct: 100,
  maturity_base: 0.72,
  maturity_span: 0.38,
  maturity_tau_days: 540,
  breadth_per_chain: 0.015,
  breadth_max_extra_chains: 8,
};

/** The model's version label: the dashboard names it and every board row carries it. */
export const MODEL_VERSION = 'launchscope-2';

/** How many live-token protocols the Already trading view carries, by market cap. */
export const LIVE_ROWS = 36;

/** One category's calibrated multiple: its live sample, its own median, and the shrunk value used. */
export interface CategoryMultiple {
  category: string;
  samples: number;
  median: number | null;
  used: number;
}

/** The calibration the model ran on this snapshot: the market multiple and every category's. */
export interface Calibration {
  market_multiple: number;
  market_samples: number;
  fallback_age_days: number;
  categories: CategoryMultiple[];
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  signal: string;
  model: {
    version: string;
    multiple: number;
    multiple_basis: string;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's view of one ranked row: everything the page needs to recompute and explain it. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  watchlist: boolean;
  signal: string;
  implied_value_usd: number;
  multiple: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  symbol: string | null;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard renders: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  calibration: Calibration;
  protocols_size: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  live_total: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The median of a non-empty list of numbers. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records no token at all: no market cap, no CoinGecko id, no symbol. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories that are a wrapped, staked or bridged product of another protocol, or an exchange. */
const PRODUCT_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Names that begin with an exchange's name: the product of an exchange, not a launch of its own. */
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** Whether a protocol is a wrapped, staked or bridged product of one whose token already trades. */
export function isProductOfAnother(p: SnapshotProtocol): boolean {
  if (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) return true;
  if (/\b(wrapped|staked|staking)\b/i.test(p.name)) return true;
  return EXCHANGE_PREFIXES.some((prefix) => p.name.startsWith(prefix));
}

/** Whether the board may rank a protocol: it records no token and is no other protocol's product. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && !isProductOfAnother(p) && !VERSIONED.test(p.name);
}

/**
 * The calibration: what the snapshot's own live-token protocols say a token is worth against TVL.
 * Only protocols with both a market cap and a TVL can testify; exchange records are excluded.
 */
export function calibrate(snapshot: Snapshot, model: ModelConstants = MODEL): Calibration {
  const witnesses = snapshot.protocols.filter(
    (p) => !isPreToken(p) && p.category !== 'CEX' && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0,
  );
  const market = witnesses.length > 0 ? median(witnesses.map((p) => p.mcap_usd! / p.tvl_usd)) : 0.25;
  const byCategory = new Map<string, number[]>();
  for (const p of witnesses) {
    const key = p.category ?? 'Uncategorised';
    const list = byCategory.get(key) ?? [];
    list.push(p.mcap_usd! / p.tvl_usd);
    byCategory.set(key, list);
  }
  const clampMultiple = (n: number): number => Math.min(model.multiple_cap, Math.max(model.multiple_floor, n));
  const categories: CategoryMultiple[] = [...byCategory.entries()]
    .map(([category, ratios]) => {
      const own = median(ratios);
      const used = clampMultiple((ratios.length * own + model.shrink_k * market) / (ratios.length + model.shrink_k));
      return { category, samples: ratios.length, median: round4(own), used: round4(used) };
    })
    .sort((a, b) => b.samples - a.samples || (a.category < b.category ? -1 : 1));
  const dated = snapshot.protocols.filter((p) => isRankable(p)).map((p) => ageDays(snapshot.as_of, p.listed_at)).filter((a): a is number => a !== null);
  return {
    market_multiple: round4(clampMultiple(market)),
    market_samples: witnesses.length,
    fallback_age_days: dated.length > 0 ? Math.round(median(dated)) : 365,
    categories,
  };
}

/** The multiple one protocol is scored with: its category's shrunk median, or the market's. */
function multipleFor(p: SnapshotProtocol, calibration: Calibration, model: ModelConstants): { multiple: number; basis: string } {
  const entry = calibration.categories.find((c) => c.category === (p.category ?? 'Uncategorised'));
  if (entry !== undefined && entry.samples > 0) {
    return { multiple: entry.used, basis: `${entry.category} median of ${entry.samples} live tokens, shrunk to the market` };
  }
  return { multiple: calibration.market_multiple, basis: 'market median (the category has no live token to calibrate from)' };
}

/** The three adjustments and the implied value one protocol gets under `model` and `calibration`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  calibration: Calibration,
): { implied: number; multiple: number; basis: string; growthPct: number; growthMult: number; maturityMult: number; breadthMult: number; age: number | null } {
  const { multiple, basis } = multipleFor(protocol, calibration, model);
  const age = ageDays(asOf, protocol.listed_at);
  const growthPct = Math.min(model.growth_cap_pct, Math.max(model.growth_floor_pct, finite(protocol.change_7d, 0)));
  // Each factor is rounded to 4 decimals before it multiplies, and the dashboard multiplies the
  // same rounded factors in the same order, so the page's recomputation of a row is exact.
  const growthMult = round4(1 + (growthPct / 100) * model.growth_weight);
  const ageForModel = age ?? calibration.fallback_age_days;
  const maturityMult = round4(model.maturity_base + model.maturity_span * (1 - Math.exp(-Math.max(ageForModel, 0) / model.maturity_tau_days)));
  const extraChains = Math.min(Math.max(protocol.chains.length - 1, 0), model.breadth_max_extra_chains);
  const breadthMult = round4(1 + model.breadth_per_chain * extraChains);
  const implied = Math.max(1, Math.round(protocol.tvl_usd * multiple * growthMult * maturityMult * breadthMult));
  return { implied, multiple, basis, growthPct, growthMult, maturityMult, breadthMult, age };
}

/**
 * A display signal from the same figures: how much of a launch case the record makes on its own.
 * It never touches the implied value; it tells the reader where to look first.
 */
export function signalFor(p: SnapshotProtocol, age: number | null, floorUsd: number): string {
  let points = 0;
  if (p.tvl_usd >= floorUsd) points += 1;
  if (p.change_7d !== null && p.change_7d > 2) points += 1;
  if (age !== null && age >= 365) points += 1;
  if (p.chains.length >= 3) points += 1;
  if (points >= 3) return 'Strong';
  if (points === 2) return 'Building';
  return 'Early';
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; calibration: Calibration } {
  const calibration = calibrate(snapshot, model);
  const index = bySlug(snapshot.protocols);
  const watchlist = new Set(snapshot.watchlist);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug on it is ranked, whatever the filters below would say.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The radar proper: every other protocol the same rule keeps, at any size. The snapshot's other
  // protocols are the early ones the radar exists to find, and the floor is never the whole board.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => ({ p, ...impliedValue(p, snapshot.as_of, model, calibration) }));
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const board = scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token' as const,
    watchlist: watchlist.has(s.p.slug),
    age_days: s.age,
    implied_value_usd: s.implied,
    signal: signalFor(s.p, s.age, snapshot.floor_usd),
    model: {
      version: MODEL_VERSION,
      multiple: s.multiple,
      multiple_basis: s.basis,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      breadth_multiplier: round4(s.breadthMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age, snapshot.floor_usd).map(stepText),
  }));
  return { board, calibration };
}

// ------------------------------------------------------------------ farm plans

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** What one transaction costs in gas on a chain, in dollars: mainnet is dear, rollups are not. */
function gasFor(chain: string): number {
  const c = chain.toLowerCase();
  if (c === 'ethereum') return 7;
  if (c === 'solana') return 0.1;
  if (c === 'bsc' || c === 'binance') return 0.35;
  if (c.includes('arbitrum') || c.includes('base') || c.includes('optimism') || c.includes('zksync') || c.includes('linea') || c.includes('scroll') || c.includes('blast') || c.includes('mantle') || c.includes('mode')) return 0.4;
  if (c.includes('polygon') || c.includes('avalanche') || c.includes('fantom') || c.includes('sonic') || c.includes('gnosis') || c.includes('celo') || c.includes('moonbeam')) return 0.6;
  return 1.5;
}

/** A gas figure as words, cents and all. */
function gasText(dollars: number): string {
  return dollars < 1 ? `about ${Math.round(dollars * 100)} cents` : `about $${dollars.toFixed(dollars % 1 === 0 ? 0 : 2)}`;
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 500;
  if (p.tvl_usd >= 1_000_000_000) return 300;
  if (p.tvl_usd >= 250_000_000) return 200;
  if (p.tvl_usd >= 50_000_000) return 100;
  if (p.tvl_usd >= 10_000_000) return 75;
  return 50;
}

/** How long to hold, from the protocol's age: a younger protocol needs a longer qualifying runway. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 60;
  if (age < 180) return 90;
  if (age < 365) return 60;
  if (age < 730) return 45;
  return 30;
}

/** The category's primary position, in words a farmer can follow. */
function primaryAction(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC or ETH to ${name} on ${chain} as collateral and leave it supplied.`;
  if (c.includes('dex')) return `Add $${capital} of liquidity to ${name}'s deepest USDC pair on ${chain} and keep the LP position open.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) return `Allocate $${capital} to a ${name} curated vault on ${chain} and keep the vault shares in the wallet.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC from Ethereum to ${chain} through ${name} and hold the bridged funds there.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return `Deposit $${capital} of USDC as margin on ${name} and open one small position hedged against the market.`;
  if (c.includes('prediction')) return `Fund $${capital} and take one position in ${name}'s most liquid market.`;
  if (c.includes('staking') || c.includes('restak') || c.includes('staking pool')) return `Stake $${capital} of the staking asset through ${name} on ${chain} and keep the receipt token.`;
  if (c.includes('rwa')) return `Subscribe $${capital} to ${name}'s yield asset on ${chain} and hold it through one distribution cycle.`;
  if (c.includes('insurance')) return `Buy $${capital} of protocol cover from ${name} on ${chain} and keep the policy active.`;
  if (c.includes('chain')) return `Bridge $${capital} to ${name} and hold it in the wallet as the chain's native asset.`;
  if (c.includes('launchpad')) return `Commit $${capital} toward one ${name} launch on ${chain} and complete its participation steps.`;
  if (c.includes('stable') || c.includes('algo')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold the balance.`;
  if (c.includes('yield') || c.includes('farm')) return `Deposit $${capital} into ${name}'s highest-TVL vault on ${chain} and keep the shares.`;
  return `Deposit $${capital} of USDC into ${name}'s core product on ${chain} and keep the position open.`;
}

/** The category's second qualifying action: the one that makes an account look like a user, not a deposit. */
function secondAction(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Borrow about $${Math.round(capital * 0.4)} of a second asset against the supply, hold it a week, then repay: borrowing is the action points programs weight most.`;
  if (c.includes('dex')) return `Route two swaps a week of about $${Math.max(25, Math.round(capital * 0.2))} each through ${name} so the wallet builds real trading volume, not just liquidity.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) return `Split a second $${Math.round(capital * 0.5)} into a different ${name} vault on a second chain it curates, so the account is active in more than one market.`;
  if (c.includes('bridge')) return `Bridge a smaller $${Math.max(25, Math.round(capital * 0.3))} back the other way once a month: round trips are what bridge activity programs count.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return `Trade about $${capital * 2} of total volume across the hold in small hedged orders, the metric derivatives programs publish for their seasons.`;
  if (c.includes('prediction')) return `Take one position a week in a different market each time; breadth of markets is what prediction programs record.`;
  if (c.includes('staking') || c.includes('restak')) return `Restake or delegate a second $${Math.round(capital * 0.5)} with a different operator or vault so the stake is not a single passive deposit.`;
  if (c.includes('rwa')) return `Hold the asset past one full distribution and reinvest the payout once, so the account shows a complete cycle.`;
  if (c.includes('chain')) return `Make one native transfer and one contract interaction a week on ${name}: raw transaction count is the first metric a new chain publishes.`;
  if (c.includes('yield') || c.includes('farm')) return `Compound the yield back into the vault once a week instead of withdrawing it, so the position grows on the record.`;
  return `Use a second feature of ${name} once a week, such as a swap, a vote or a smaller second deposit, so the account reads as a user rather than one deposit.`;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time, derived from the
 * protocol's own record (category, first chain, TVL, age) and never from a hand-written list.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, floorUsd: number): FarmStep[] {
  const chain = chainOf(p);
  const gas = gasFor(chain);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const sizeNote = p.tvl_usd >= floorUsd ? 'above the watchlist floor' : 'below the watchlist floor';
  return [
    {
      text: `Set up a fresh wallet for ${p.name} alone, fund it from an exchange, and keep its seed phrase offline; one wallet per protocol keeps every farm separable.`,
      cost: `${gasText(gas)} of gas for the first transaction on ${chain}`,
      time: '10 minutes',
    },
    {
      text: primaryAction(p, capital, chain),
      cost: `$${capital} of capital and ${gasText(gas)} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: secondAction(p, capital, chain),
      cost: `${gasText(gas * 2)} of gas across the two actions`,
      time: '20 minutes',
    },
    {
      text: `Repeat one qualifying action every week without missing a week: protocols of this size (${sizeNote}) usually score seasons or points on weekly streaks, and a gap resets them.`,
      cost: `${gasText(gas)} of gas a week, about $${Math.max(1, Math.round(gas * 4))} a month`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position at least ${hold} days, spanning two monthly snapshots of the protocol's TVL, before judging it: shorter holds are the ones activity filters discard.`,
      cost: `the $${capital} stays in the position and cannot be spent elsewhere`,
      time: `${hold} days`,
    },
    {
      text: `Check ${p.name}'s official announcements and points page once a week for a token or season announcement; claim only from a link the protocol itself publishes, and never pay a fee to claim.`,
      cost: 'nothing to check; a claim that asks for payment is a scam',
      time: '5 minutes a week',
    },
    {
      text: `Log the wallet, every date, amount and transaction hash in a farm log; when a token launches or the ${hold} days pass with no announcement, unwind in one session and record the result.`,
      cost: `${gasText(gas * 2)} of gas to unwind`,
      time: '15 minutes to exit',
    },
  ];
}

// ------------------------------------------------------------------ the live set

/** The live-token protocols, by market cap, for the dashboard's Already trading view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1))
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      symbol: p.symbol,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    listed_at: row.listed_at,
    age_days: row.age_days,
    watchlist: row.watchlist,
    signal: row.signal,
    implied_value_usd: row.implied_value_usd,
    multiple: row.model.multiple,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    breadth_multiplier: row.model.breadth_multiplier,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const { board, calibration } = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const liveTotal = snapshot.protocols.filter((p) => !isPreToken(p)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    calibration,
    protocols_size: snapshot.protocols.length,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: board.filter((r) => !r.watchlist).length,
    live_size: live.length,
    live_total: liveTotal,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  if (slugs.size !== board.length) return 'the board carries a slug twice';
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  for (const r of board) if (!known.has(r.slug)) return `${r.slug} is not one of the snapshot's protocols`;
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) {
      const trimmed = s.trim();
      if (trimmed.length < 20 || trimmed.length > 600) return `${r.slug} has a farm step of ${trimmed.length} characters`;
    }
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
