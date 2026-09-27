/**
 * Short, stable key for a source layout (e.g. a CSV header row), used to look up
 * remembered import presets. Not a security primitive.
 */
export const layoutFingerprint = async ({ value }: { value: string }): Promise<string> => {
  const bytes = new TextEncoder().encode(value);
  // crypto.subtle only exists in secure contexts; a self-hosted app opened over plain
  // http on a LAN IP has none, so fall back to 32-bit FNV-1a there.
  if (!globalThis.crypto?.subtle) {
    let hash = 0x811c9dc5;
    for (const byte of bytes) hash = Math.imul(hash ^ byte, 0x01000193);
    return (hash >>> 0).toString(16).padStart(8, '0');
  }
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};
