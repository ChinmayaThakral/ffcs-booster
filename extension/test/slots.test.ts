import { describe, expect, it } from 'vitest';
import { optionId, parseSeats, parseSlotCombo } from '../lib/slots';

describe('parseSlotCombo', () => {
  it('splits plus-separated theory combos', () => {
    expect(parseSlotCombo('A11+A12+A13')).toEqual({
      slotCombo: ['A11', 'A12', 'A13'],
      unknownSlots: [],
    });
  });

  it('tolerates whitespace and slash separators', () => {
    expect(parseSlotCombo(' A14 + D11 / D12 ').slotCombo).toEqual(['A14', 'D11', 'D12']);
  });

  it('flags unknown codes but keeps them in the combo', () => {
    const result = parseSlotCombo('C11+C12+TC1');
    expect(result.slotCombo).toEqual(['C11', 'C12', 'TC1']);
    expect(result.unknownSlots).toEqual(['TC1']);
  });

  it('flags non-slot-shaped tokens as unknown without crashing', () => {
    const result = parseSlotCombo('NPTEL-ONLINE');
    expect(result.slotCombo).toEqual([]);
    expect(result.unknownSlots).toEqual(['NPTEL-ONLINE']);
  });
});

describe('parseSeats', () => {
  it('parses integers', () => {
    expect(parseSeats('91')).toBe(91);
    expect(parseSeats(' 0 ')).toBe(0);
  });

  it('treats Full/FULL/dash/empty as Full', () => {
    expect(parseSeats('Full')).toBe('Full');
    expect(parseSeats('FULL')).toBe('Full');
    expect(parseSeats('-')).toBe('Full');
    expect(parseSeats('')).toBe('Full');
  });
});

describe('optionId', () => {
  it('builds a stable slug', () => {
    expect(optionId('CSA3006', 'NILAMADHAB MISHRA', 'A11+A12+A13')).toBe(
      'csa3006|nilamadhab-mishra|a11+a12+a13',
    );
  });
});
