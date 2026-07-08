/** Heuristic table helpers — detect tables by header TEXT, never by ids/classes/styles. */

export interface HeaderTable {
  table: HTMLTableElement;
  /** normalized header cell texts, in order */
  headers: string[];
}

function normalize(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** All tables in the document with their normalized header texts (th cells, or first row of td if no th). */
export function tablesWithHeaders(doc: Document): HeaderTable[] {
  const result: HeaderTable[] = [];
  for (const table of Array.from(doc.querySelectorAll('table'))) {
    let headerCells = Array.from(table.querySelectorAll('th'));
    if (headerCells.length === 0) {
      const firstRow = table.querySelector('tr');
      headerCells = firstRow ? (Array.from(firstRow.querySelectorAll('td')) as unknown as HTMLTableCellElement[]) : [];
    }
    const headers = headerCells.map((c) => normalize(c.textContent));
    if (headers.length > 0) result.push({ table: table as HTMLTableElement, headers });
  }
  return result;
}

/** True if every needle appears (as a prefix match) somewhere in the header list. */
export function hasHeaders(ht: HeaderTable, needles: string[]): boolean {
  return needles.every((needle) =>
    ht.headers.some((h) => h === needle || h.startsWith(needle))
  );
}

/** Index of the first header equal to / starting with the needle, or -1. */
export function headerIndex(ht: HeaderTable, needle: string): number {
  return ht.headers.findIndex((h) => h === needle || h.startsWith(needle));
}

/**
 * Looser lookup: index of the first header CONTAINING the needle anywhere.
 * Use for columns whose label varies across portal page layouts, e.g. a
 * "General / Available" two-line header that normalizes to
 * "general available" rather than the plainer "Available Seats".
 */
export function headerIndexContains(ht: HeaderTable, needle: string): number {
  return ht.headers.findIndex((h) => h.includes(needle));
}

/** Data rows of a table: tr elements that contain td cells. */
export function dataRows(table: HTMLTableElement): HTMLTableCellElement[][] {
  const rows: HTMLTableCellElement[][] = [];
  for (const tr of Array.from(table.querySelectorAll('tr'))) {
    const tds = Array.from(tr.querySelectorAll('td')) as HTMLTableCellElement[];
    if (tds.length > 0) rows.push(tds);
  }
  return rows;
}

export function cellText(cell: HTMLTableCellElement | undefined): string {
  return (cell?.textContent ?? '').replace(/\s+/g, ' ').trim();
}
