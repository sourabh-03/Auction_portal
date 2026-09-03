/**
 * Pure ranking functions for both auction formats. Deliberately free of any
 * DB/Prisma/Decimal dependency so they can be unit-tested in isolation —
 * this is the most dispute-sensitive logic in the system (spec §4.7, §5.7).
 * Callers convert Prisma.Decimal -> number at the boundary.
 */

export interface RankedGroup<T> {
  item: T;
  rank: number;
  tieFlagged: boolean;
}

/**
 * Standard "competition ranking" (1,1,3 — not 1,1,2): equal values share a
 * rank, and the rank after a tie skips ahead by the tied group's size.
 */
export function assignCompetitionRanks<T>(
  sortedAscending: T[],
  getValue: (t: T) => number,
  startRank = 1,
): RankedGroup<T>[] {
  const result: RankedGroup<T>[] = [];
  let i = 0;
  while (i < sortedAscending.length) {
    let j = i;
    while (j < sortedAscending.length && getValue(sortedAscending[j]) === getValue(sortedAscending[i])) {
      j++;
    }
    const rank = startRank + i;
    const tieFlagged = j - i > 1;
    for (let k = i; k < j; k++) {
      result.push({ item: sortedAscending[k], rank, tieFlagged });
    }
    i = j;
  }
  return result;
}

/* ============================== English Reverse ============================== */

export interface EnglishBidRecord {
  vendorId: string;
  price: number;
  createdAt: Date;
}

export interface EnglishRankedVendor {
  vendorId: string;
  price: number;
  rank: number;
  tieFlagged: boolean;
}

export interface EnglishRankingResult {
  ranked: EnglishRankedVendor[];
  noBid: string[];
}

export type TieBreakRule = 'earliest' | 'manual';

/**
 * §4.7 — ranking is always a computed view over bid_log, ordered by lowest
 * latest-accepted bid, tie-broken per the configured tie_break_rule.
 * `bidLog` should contain only `type: 'bid'` entries; the caller is
 * responsible for filtering.
 */
export function computeEnglishRanking(
  invitedVendorIds: string[],
  bidLog: EnglishBidRecord[],
  tieBreakRule: TieBreakRule,
): EnglishRankingResult {
  const latestByVendor = new Map<string, EnglishBidRecord>();
  for (const entry of bidLog) {
    const current = latestByVendor.get(entry.vendorId);
    if (!current || entry.createdAt.getTime() > current.createdAt.getTime()) {
      latestByVendor.set(entry.vendorId, entry);
    }
  }

  const withBids = invitedVendorIds
    .filter((vid) => latestByVendor.has(vid))
    .map((vid) => latestByVendor.get(vid)!);
  const noBid = invitedVendorIds.filter((vid) => !latestByVendor.has(vid));

  if (tieBreakRule === 'earliest') {
    const sorted = [...withBids].sort((a, b) => {
      if (a.price !== b.price) return a.price - b.price;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
    const ranked = sorted.map((b, i) => ({
      vendorId: b.vendorId,
      price: b.price,
      rank: i + 1,
      tieFlagged: false,
    }));
    return { ranked, noBid };
  }

  // manual — do not silently resolve equal-price ties; flag them.
  const sorted = [...withBids].sort((a, b) => {
    if (a.price !== b.price) return a.price - b.price;
    return a.vendorId.localeCompare(b.vendorId); // deterministic ordering only, not a tie-break
  });
  const grouped = assignCompetitionRanks(sorted, (b) => b.price);
  const ranked = grouped.map((g) => ({
    vendorId: g.item.vendorId,
    price: g.item.price,
    rank: g.rank,
    tieFlagged: g.tieFlagged,
  }));
  return { ranked, noBid };
}

/* ============================== Japanese Clock ============================== */

export interface JapaneseVendorState {
  vendorId: string;
  active: boolean;
  dropPrice: number | null; // must be non-null when active === false
}

export interface JapaneseRankedVendor {
  vendorId: string;
  rank: number;
  finalRate: number;
  tieFlagged: boolean;
}

/**
 * §5.7 — vendors still active at close share the best rank at the final
 * call price (tied, flagged if more than one). Eliminated vendors rank by
 * drop price ascending (a lower drop price means they survived longer).
 *
 * Note beyond the literal spec text: when two or more vendors are
 * auto-dropped in the same tick (a likely occurrence with auto-drop on,
 * since every non-responder in a window drops at that same tick's price),
 * they share an equal drop price. The spec doesn't name a tie-break rule
 * for that case (Japanese config has no tieBreakRule field at all — that's
 * English-only in §9). We extend the same "flag for manual review" pattern
 * the spec already uses for active-at-close ties, rather than inventing an
 * arbitrary resolution. Flagged to the user as an assumption.
 */
export function computeJapaneseRanking(
  vendors: JapaneseVendorState[],
  currentCallPrice: number,
): JapaneseRankedVendor[] {
  const active = vendors.filter((v) => v.active);
  const dropped = vendors
    .filter((v) => !v.active)
    .sort((a, b) => {
      if (a.dropPrice !== b.dropPrice) return (a.dropPrice as number) - (b.dropPrice as number);
      return a.vendorId.localeCompare(b.vendorId);
    });

  const result: JapaneseRankedVendor[] = active.map((v) => ({
    vendorId: v.vendorId,
    rank: 1,
    finalRate: currentCallPrice,
    tieFlagged: active.length > 1,
  }));

  const droppedRanked = assignCompetitionRanks(dropped, (v) => v.dropPrice as number, active.length + 1);
  for (const g of droppedRanked) {
    result.push({
      vendorId: g.item.vendorId,
      rank: g.rank,
      finalRate: g.item.dropPrice as number,
      tieFlagged: g.tieFlagged,
    });
  }
  return result;
}
