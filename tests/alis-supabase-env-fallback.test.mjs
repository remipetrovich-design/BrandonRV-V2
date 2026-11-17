import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');

test('A.L.I.S. server and edge storage both use the configured Supabase URL fallback', () => {
  for (const path of ['.alis/license-edge-storage.js', '.alis/license-storage.js']) {
    const source = read(path);
    assert.match(
      source,
      /process\.env\.SUPABASE_URL\s*\|\|\s*process\.env\.NEXT_PUBLIC_SUPABASE_URL/,
      path + ' must fall back to NEXT_PUBLIC_SUPABASE_URL'
    );
  }
});
