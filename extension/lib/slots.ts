/**
 * VIT Bhopal theory slot grid. Mirrors models/slot.py (the authoritative map).
 * Codes not in this grid (labs, TC*, ...) are preserved raw and flagged as unknown.
 */

export const KNOWN_SLOTS = new Set([
  // MON
  'A11', 'B11', 'C11', 'A21', 'A14', 'B21', 'C21',
  // TUE
  'D11', 'E11', 'F11', 'D21', 'E14', 'E21', 'F21',
  // WED
  'A12', 'B12', 'C12', 'A22', 'B14', 'B22', 'A24',
  // THU
  'D12', 'E12', 'F12', 'D22', 'F14', 'E22', 'F22',
  // FRI
  'A13', 'B13', 'C13', 'A23', 'C14', 'B23', 'B24',
  // SAT
  'D13', 'E13', 'F13', 'D23', 'D14', 'D24', 'E23',
]);

const SLOT_CODE_RE = /^[A-Z]{1,3}\d{1,2}$/;

export interface ParsedCombo {
  slotCombo: string[];
  unknownSlots: string[];
}

/**
 * Parse a raw combo string like "A11+A12+A13" (also tolerates "/" separators
 * and stray whitespace) into individual codes, flagging unknown ones.
 */
export function parseSlotCombo(rawSlotText: string): ParsedCombo {
  const parts = rawSlotText
    .split(/[+/]/)
    .map((p) => p.trim().toUpperCase())
    .filter((p) => p.length > 0);

  const slotCombo: string[] = [];
  const unknownSlots: string[] = [];

  for (const part of parts) {
    if (SLOT_CODE_RE.test(part)) {
      slotCombo.push(part);
      if (!KNOWN_SLOTS.has(part)) unknownSlots.push(part);
    } else {
      // Not even shaped like a slot code — keep it visible as unknown
      unknownSlots.push(part);
    }
  }

  return { slotCombo, unknownSlots };
}

/** Seats cell → integer or the literal "Full". Tolerates "FULL", "full", "-", "". */
export function parseSeats(text: string): number | 'Full' {
  const cleaned = text.trim();
  if (/^\d+$/.test(cleaned)) return parseInt(cleaned, 10);
  if (/^full$/i.test(cleaned)) return 'Full';
  return 'Full';
}

export function optionId(courseCode: string, faculty: string, rawSlotText: string): string {
  const slug = (s: string) => s.toLowerCase().trim().replace(/\s+/g, '-');
  return `${slug(courseCode)}|${slug(faculty)}|${slug(rawSlotText)}`;
}
