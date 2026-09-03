import { hasReachedFloor, nextCallPrice, shouldFinalizeForMinVendors } from './japanese.util';

describe('nextCallPrice — floor price is a hard stop (§5.6)', () => {
  it('decrements normally when the result stays above the floor', () => {
    expect(nextCallPrice(1000, 100, 500)).toBe(900);
  });

  it('clamps to the floor when a full decrement would go below it', () => {
    expect(nextCallPrice(550, 100, 500)).toBe(500);
  });

  it('never goes below the floor even with an oversized decrement', () => {
    expect(nextCallPrice(600, 5000, 500)).toBe(500);
  });

  it('stays exactly at the floor once already there', () => {
    expect(nextCallPrice(500, 100, 500)).toBe(500);
  });
});

describe('hasReachedFloor', () => {
  it('is true once the call price equals the floor', () => {
    expect(hasReachedFloor(500, 500)).toBe(true);
  });
  it('is false while still above the floor', () => {
    expect(hasReachedFloor(501, 500)).toBe(false);
  });
});

describe('shouldFinalizeForMinVendors — checked uniformly, including tick 1 (§5.5)', () => {
  it('triggers at go-live if invited vendor count already does not exceed the minimum', () => {
    // e.g. minVendorsRemaining=4 configured on a 4-vendor auction — every
    // seat is still "active" at go-live, so this must fire before any tick.
    expect(shouldFinalizeForMinVendors(4, 4)).toBe(true);
  });

  it('does not trigger when there is healthy headroom above the minimum', () => {
    expect(shouldFinalizeForMinVendors(4, 2)).toBe(false);
  });

  it('triggers the moment active count drops to the minimum mid-auction', () => {
    expect(shouldFinalizeForMinVendors(2, 2)).toBe(true);
  });

  it('triggers even if a mass-drop overshoots below the minimum in one tick', () => {
    expect(shouldFinalizeForMinVendors(1, 2)).toBe(true);
  });
});
