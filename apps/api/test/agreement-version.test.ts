import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { SELLER_TERMS_VERSION } from '../src/features/suppliers/go-live';

// The seller site sends the version of the agreement text it shows; the API accepts only the current
// one. If someone edits one and forgets the other, sellers could never accept, so keep them equal.
describe('seller agreement version', () => {
  it('the seller site text and the API agree on the version', () => {
    const page = readFileSync(join(__dirname, '../../seller-web/app/(dashboard)/agreement/page.tsx'), 'utf8');
    const m = page.match(/const TEXT_VERSION = '([^']+)'/);
    expect(m?.[1]).toBe(SELLER_TERMS_VERSION);
  });
});
