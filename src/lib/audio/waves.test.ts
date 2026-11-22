import { describe, expect, it } from 'vitest';
import { harmonicTable } from './waves';

describe('harmonicTable', () => {
  it('zeroes even partials when the even weight is 0', () => {
    const table = harmonicTable(1.2, 0, 8);
    expect(table[0]).toBeGreaterThan(0);
    expect(table[1]).toBe(0);
    expect(table[2]).toBeGreaterThan(0);
    expect(table[3]).toBe(0);
  });

  it('keeps every partial when the even weight is 1', () => {
    const table = harmonicTable(1.2, 1, 8);
    expect(table.every((amplitude) => amplitude > 0)).toBe(true);
  });

  it('rolls the upper partials off faster as tilt rises', () => {
    const soft = harmonicTable(0.8, 1, 8);
    const hard = harmonicTable(2, 1, 8);
    expect(hard[7] / hard[0]).toBeLessThan(soft[7] / soft[0]);
  });

  it('leaves the fundamental at 1', () => {
    const table = harmonicTable(1.5, 0.5, 4);
    expect(table[0]).toBeCloseTo(1, 9);
  });
});
