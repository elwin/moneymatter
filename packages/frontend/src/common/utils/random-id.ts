/**
 * Opaque client-generated id (32 hex chars). crypto.randomUUID needs a secure context,
 * which a self-hosted app opened over plain http lacks; getRandomValues does not.
 */
export const randomId = (): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');
