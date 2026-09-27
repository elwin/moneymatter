import { afterEach, describe, expect, it } from 'vitest';

import { layoutFingerprint } from './layout-fingerprint';

describe('layoutFingerprint', () => {
  const subtle = globalThis.crypto.subtle;

  afterEach(() => {
    Object.defineProperty(globalThis.crypto, 'subtle', { value: subtle, configurable: true });
  });

  it('returns sha256 hex in a secure context', async () => {
    const fp = await layoutFingerprint({ value: '["date","amount"]' });
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
    expect(fp).toBe(await layoutFingerprint({ value: '["date","amount"]' }));
    expect(fp).not.toBe(await layoutFingerprint({ value: '["date","amount","category"]' }));
  });

  it('falls back to FNV-1a hex when crypto.subtle is unavailable (plain-http self-hosted setup)', async () => {
    Object.defineProperty(globalThis.crypto, 'subtle', { value: undefined, configurable: true });
    const fp = await layoutFingerprint({ value: '["date","amount"]' });
    expect(fp).toMatch(/^[0-9a-f]{8}$/);
    expect(fp).toBe(await layoutFingerprint({ value: '["date","amount"]' }));
    expect(fp).not.toBe(await layoutFingerprint({ value: '["date","amount","category"]' }));
  });
});
