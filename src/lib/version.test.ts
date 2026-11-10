import { describe, expect, it } from 'vitest';
import { formatBuildLabel, type BuildInfo } from './version';

describe('formatBuildLabel', () => {
  it('shows version and short sha', () => {
    const info: BuildInfo = { version: '0.1.0', sha: '8551b1b', time: '2026-11-10T09:00:00Z' };
    expect(formatBuildLabel(info)).toBe('v0.1.0 · 8551b1b');
  });

  it('never renders an empty label when the stamp is missing', () => {
    const info: BuildInfo = { version: '0.0.0', sha: 'unknown', time: '1970-01-01T00:00:00Z' };
    expect(formatBuildLabel(info)).toContain('v0.0.0');
    expect(formatBuildLabel(info)).toContain('unknown');
  });
});
