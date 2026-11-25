import { describe, it, expect } from 'vitest';
import { schoolTimeToUtc } from './school-date';
describe('School-local planning time', () => {
  it('uses the Vilnius winter and summer offsets', () => {
    expect(schoolTimeToUtc('2030-01-15T12:00')).toBe('2030-01-15T10:00:00.000Z');
    expect(schoolTimeToUtc('2030-07-15T12:00')).toBe('2030-07-15T09:00:00.000Z');
  });
  it('rejects daylight-saving gaps and ambiguous repeated times', () => {
    expect(() => schoolTimeToUtc('2026-03-29T03:30')).toThrow('ambiguous');
    expect(() => schoolTimeToUtc('2026-10-25T03:30')).toThrow('ambiguous');
  });
});
