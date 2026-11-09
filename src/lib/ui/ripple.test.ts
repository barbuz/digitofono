import { describe, expect, it } from 'vitest';
import { EXPAND_MS, RING_RADIUS, rippleAlive, rippleVisual } from './ripple';

describe('rippleVisual', () => {
  it('starts small and faint and expands to the full radius', () => {
    const start = rippleVisual(0, 2500);
    expect(start.radius).toBeCloseTo(4, 5);
    expect(start.radius).toBeLessThan(RING_RADIUS);

    const grown = rippleVisual(EXPAND_MS, 2500);
    expect(grown.radius).toBeCloseTo(RING_RADIUS, 5);
  });

  it('holds its size once expanded, so a slow fade is a linger not a zoom', () => {
    const mid = rippleVisual(1000, 2500);
    const late = rippleVisual(2400, 2500);
    expect(mid.radius).toBeCloseTo(RING_RADIUS, 5);
    expect(late.radius).toBeCloseTo(RING_RADIUS, 5);
  });

  it('fades monotonically towards nothing', () => {
    let previous = Infinity;
    for (const age of [0, 200, 800, 1500, 2400]) {
      const { alpha } = rippleVisual(age, 2500);
      expect(alpha).toBeLessThan(previous);
      previous = alpha;
    }
    expect(rippleVisual(2500, 2500).alpha).toBe(0);
  });

  it('lingers longer when the decay is longer', () => {
    const shortLived = rippleVisual(1000, 1000);
    const longLived = rippleVisual(1000, 6000);
    expect(longLived.alpha).toBeGreaterThan(shortLived.alpha);
  });

  it('treats a decay shorter than the expansion as a full expansion', () => {
    const { radius } = rippleVisual(EXPAND_MS, 0);
    expect(radius).toBeCloseTo(RING_RADIUS, 5);
  });

  it('clamps ages outside its window', () => {
    expect(rippleVisual(-50, 2500).radius).toBeCloseTo(4, 5);
    expect(rippleVisual(9999, 2500).alpha).toBe(0);
  });
});

describe('rippleAlive', () => {
  it('keeps a marker alive for the whole decay window', () => {
    expect(rippleAlive(0, 2500)).toBe(true);
    expect(rippleAlive(2499, 2500)).toBe(true);
    expect(rippleAlive(2500, 2500)).toBe(false);
  });

  it('never drops a marker before it has expanded', () => {
    expect(rippleAlive(EXPAND_MS - 1, 0)).toBe(true);
  });
});
