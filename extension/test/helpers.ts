import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export function loadFixture(name: string): Document {
  const html = readFileSync(join(here, 'fixtures', name), 'utf-8');
  return new DOMParser().parseFromString(html, 'text/html');
}
