import { describe, expect, it } from '@jest/globals';

import { isAuthApiError } from './error-handler';

const makeApiError = (statusCode: number) => Object.assign(new Error('boom'), { name: 'APIError', statusCode });

describe('isAuthApiError', () => {
  it('matches any Error named APIError with a numeric statusCode', () => {
    expect(isAuthApiError(makeApiError(415))).toBe(true);
    expect(isAuthApiError(makeApiError(500))).toBe(true);
  });

  it('rejects plain errors and APIError-shaped errors without a numeric statusCode', () => {
    expect(isAuthApiError(new Error('boom'))).toBe(false);
    expect(isAuthApiError(Object.assign(new Error('boom'), { name: 'APIError', statusCode: '415' }))).toBe(false);
  });

  it('rejects non-Error throwables without throwing', () => {
    expect(isAuthApiError(undefined)).toBe(false);
    expect(isAuthApiError(null)).toBe(false);
    expect(isAuthApiError('APIError')).toBe(false);
    expect(isAuthApiError({ name: 'APIError', statusCode: 415 })).toBe(false);
  });
});
