import {
  computeEnglishRanking,
  computeJapaneseRanking,
  EnglishBidRecord,
  JapaneseVendorState,
} from './ranking.util';

describe('computeEnglishRanking', () => {
  const t = (secOffset: number) => new Date(1000 * secOffset);

  it('ranks by lowest latest bid, ascending', () => {
    const bids: EnglishBidRecord[] = [
      { vendorId: 'v1', price: 900, createdAt: t(1) },
      { vendorId: 'v2', price: 850, createdAt: t(2) },
      { vendorId: 'v1', price: 800, createdAt: t(3) }, // v1's latest supersedes their earlier bid
    ];
    const { ranked, noBid } = computeEnglishRanking(['v1', 'v2', 'v3'], bids, 'earliest');
    expect(ranked).toEqual([
      { vendorId: 'v1', price: 800, rank: 1, tieFlagged: false },
      { vendorId: 'v2', price: 850, rank: 2, tieFlagged: false },
    ]);
    expect(noBid).toEqual(['v3']); // zero-bid vendor is not ranked
  });

  it('zero bids at close: everyone lands in noBid, ranked is empty', () => {
    const { ranked, noBid } = computeEnglishRanking(['v1', 'v2'], [], 'earliest');
    expect(ranked).toEqual([]);
    expect(noBid).toEqual(['v1', 'v2']);
  });

  it('single-bidder outcome is a valid, fully ranked result', () => {
    const bids: EnglishBidRecord[] = [{ vendorId: 'v1', price: 500, createdAt: t(1) }];
    const { ranked, noBid } = computeEnglishRanking(['v1', 'v2'], bids, 'earliest');
    expect(ranked).toEqual([{ vendorId: 'v1', price: 500, rank: 1, tieFlagged: false }]);
    expect(noBid).toEqual(['v2']);
  });

  it('earliest tie-break resolves equal prices by timestamp, no flag', () => {
    const bids: EnglishBidRecord[] = [
      { vendorId: 'v1', price: 700, createdAt: t(5) },
      { vendorId: 'v2', price: 700, createdAt: t(2) }, // earlier at the same price -> better rank
    ];
    const { ranked } = computeEnglishRanking(['v1', 'v2'], bids, 'earliest');
    expect(ranked.map((r) => r.vendorId)).toEqual(['v2', 'v1']);
    expect(ranked.every((r) => !r.tieFlagged)).toBe(true);
  });

  it('manual tie-break keeps equal prices tied at the same rank and flags them', () => {
    const bids: EnglishBidRecord[] = [
      { vendorId: 'v1', price: 700, createdAt: t(5) },
      { vendorId: 'v2', price: 700, createdAt: t(2) },
      { vendorId: 'v3', price: 650, createdAt: t(1) },
    ];
    const { ranked } = computeEnglishRanking(['v1', 'v2', 'v3'], bids, 'manual');
    const byVendor = Object.fromEntries(ranked.map((r) => [r.vendorId, r]));
    expect(byVendor.v3).toEqual({ vendorId: 'v3', price: 650, rank: 1, tieFlagged: false });
    expect(byVendor.v1.rank).toBe(2);
    expect(byVendor.v2.rank).toBe(2);
    expect(byVendor.v1.tieFlagged).toBe(true);
    expect(byVendor.v2.tieFlagged).toBe(true);
  });

  it('a later, higher (worse) bid never overrides ranking based on an earlier lower bid — only the latest bid counts', () => {
    // decrement rule prevents a vendor from ever submitting a higher bid than
    // their own last one in production, but the ranking function itself must
    // still be latest-bid-wins by construction, not lowest-ever-bid.
    const bids: EnglishBidRecord[] = [{ vendorId: 'v1', price: 100, createdAt: t(1) }];
    const { ranked } = computeEnglishRanking(['v1'], bids, 'earliest');
    expect(ranked[0].price).toBe(100);
  });
});

describe('computeJapaneseRanking', () => {
  it('single active vendor at close ranks L1 untied', () => {
    const vendors: JapaneseVendorState[] = [
      { vendorId: 'v1', active: true, dropPrice: null },
      { vendorId: 'v2', active: false, dropPrice: 900 },
      { vendorId: 'v3', active: false, dropPrice: 950 },
    ];
    const result = computeJapaneseRanking(vendors, 800);
    const v1 = result.find((r) => r.vendorId === 'v1')!;
    expect(v1).toEqual({ vendorId: 'v1', rank: 1, finalRate: 800, tieFlagged: false });
  });

  it('multiple active vendors at close (floor reached) tie for L1 and are flagged', () => {
    const vendors: JapaneseVendorState[] = [
      { vendorId: 'v1', active: true, dropPrice: null },
      { vendorId: 'v2', active: true, dropPrice: null },
    ];
    const result = computeJapaneseRanking(vendors, 500); // floor price
    expect(result).toEqual(
      expect.arrayContaining([
        { vendorId: 'v1', rank: 1, finalRate: 500, tieFlagged: true },
        { vendorId: 'v2', rank: 1, finalRate: 500, tieFlagged: true },
      ]),
    );
  });

  it('dropped vendors rank by drop price ascending — lower drop price (survived longer) ranks better', () => {
    const vendors: JapaneseVendorState[] = [
      { vendorId: 'v1', active: true, dropPrice: null },
      { vendorId: 'v2', active: false, dropPrice: 900 }, // dropped earlier, higher price
      { vendorId: 'v3', active: false, dropPrice: 700 }, // dropped later, lower price -> survived longer
    ];
    const result = computeJapaneseRanking(vendors, 600);
    const byVendor = Object.fromEntries(result.map((r) => [r.vendorId, r]));
    expect(byVendor.v1.rank).toBe(1);
    expect(byVendor.v3.rank).toBe(2); // survived longer than v2
    expect(byVendor.v2.rank).toBe(3);
  });

  it('two vendors auto-dropped in the same tick share a rank and are flagged (assumption, see ranking.util.ts)', () => {
    const vendors: JapaneseVendorState[] = [
      { vendorId: 'v1', active: true, dropPrice: null },
      { vendorId: 'v2', active: false, dropPrice: 800 },
      { vendorId: 'v3', active: false, dropPrice: 800 },
    ];
    const result = computeJapaneseRanking(vendors, 600);
    const byVendor = Object.fromEntries(result.map((r) => [r.vendorId, r]));
    expect(byVendor.v2.rank).toBe(2);
    expect(byVendor.v3.rank).toBe(2);
    expect(byVendor.v2.tieFlagged).toBe(true);
    expect(byVendor.v3.tieFlagged).toBe(true);
  });

  it('zero active vendors remaining (all dropped) still produces a full ranking with no L1 tie', () => {
    const vendors: JapaneseVendorState[] = [
      { vendorId: 'v1', active: false, dropPrice: 750 },
      { vendorId: 'v2', active: false, dropPrice: 800 },
    ];
    const result = computeJapaneseRanking(vendors, 700);
    const byVendor = Object.fromEntries(result.map((r) => [r.vendorId, r]));
    expect(byVendor.v1.rank).toBe(1);
    expect(byVendor.v2.rank).toBe(2);
  });
});
