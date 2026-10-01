import { describe, expect, it } from 'vitest';
import { createI18n } from 'vue-i18n';

import { createSlavicPluralRule } from './index';

const buildT = ({ locale, message }: { locale: string; message: string }) => {
  const { global: g } = createI18n<false>({
    legacy: false,
    locale,
    pluralRules: { [locale]: createSlavicPluralRule({ locale }) },
    messages: { [locale]: { key: message } },
  });
  return (count: number) => g.t('key', { count }, count);
};

describe('createSlavicPluralRule', () => {
  it.each([
    [1, '1 sekunda'],
    [2, '2 sekundy'],
    [4, '4 sekundy'],
    [5, '5 sekúnd'],
    [0, '0 sekúnd'],
    [21, '21 sekúnd'],
  ])('sk: %i -> %s', (count, expected) => {
    const t = buildT({ locale: 'sk', message: '{count} sekunda | {count} sekundy | {count} sekúnd' });
    expect(t(count)).toBe(expected);
  });

  it.each([
    [1, '1 секунда'],
    [3, '3 секунды'],
    [5, '5 секунд'],
    [11, '11 секунд'],
    [21, '21 секунда'],
    [22, '22 секунды'],
    [0, '0 секунд'],
  ])('ru: %i -> %s', (count, expected) => {
    const t = buildT({ locale: 'ru', message: '{count} секунда | {count} секунды | {count} секунд' });
    expect(t(count)).toBe(expected);
  });

  it.each([
    [1, '1 sekunda'],
    [3, '3 sekúnd'],
    [0, '0 sekúnd'],
  ])('clamps a two-form message to its last branch: %i -> %s', (count, expected) => {
    const t = buildT({ locale: 'sk', message: '{count} sekunda | {count} sekúnd' });
    expect(t(count)).toBe(expected);
  });
});
