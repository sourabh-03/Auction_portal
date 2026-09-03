/**
 * Small pure helpers pulled out of JapaneseEngineService purely so the
 * safety-critical edge cases the build prompt calls out — floor-price as a
 * hard stop, and the min-vendor-remaining check applying uniformly even on
 * the first tick — have direct, DB-free unit test coverage.
 */

/** §5.6 — the call price never drops below the floor, no matter the tick decrement. */
export function nextCallPrice(currentPrice: number, tickDecrement: number, floorPrice: number): number {
  return Math.max(floorPrice, currentPrice - tickDecrement);
}

export function hasReachedFloor(callPrice: number, floorPrice: number): boolean {
  return callPrice <= floorPrice;
}

/**
 * §5.5 — "applies uniformly, including if it would trigger on the very
 * first tick. There is no special-case early exit that skips the check."
 * This function takes no tick-number parameter at all, by design — the
 * absence of that parameter IS the guarantee that tick 1 is never special-cased.
 */
export function shouldFinalizeForMinVendors(activeCount: number, minVendorsRemaining: number): boolean {
  return activeCount <= minVendorsRemaining;
}
