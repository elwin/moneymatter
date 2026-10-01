import { logger } from '@js/utils';
import UserExchangeRates from '@models/user-exchange-rates.model';
import { API_LAYER_BASE_CURRENCY_CODE } from '@services/exchange-rates/constants';

import { formatDateKey } from './types';

type UserExchangeRateRow = Pick<UserExchangeRates, 'baseCode' | 'quoteCode' | 'date' | 'rate'>;

/**
 * Index user-set overrides by `${baseCode}_${dateStr}`. User overrides are
 * stored as `currencyCode → userBase` directly (not via USD pivot), so they
 * short-circuit the cross-rate maths in `createGetExchangeRate`.
 */
export const buildUserRatesMap = (rows: UserExchangeRateRow[]): Map<string, number> => {
  const map = new Map<string, number>();
  for (const r of rows) {
    map.set(`${r.baseCode}_${formatDateKey(r.date)}`, r.rate);
  }
  return map;
};

/** `approximated` marks the earliest stored rate standing in for a date that predates it. */
interface UsdRate {
  rate: number;
  approximated: boolean;
}

/**
 * Closure factory: looks up `1 USD = ? quoteCode` for `dateStr`. Resolution
 * order: exact day, most recent prior rate (weekends, holidays, sparse
 * coverage), then the earliest stored rate for a date that predates all of
 * them. Returns `null` only when no rate at all is known for this currency.
 *
 * `usdRateDatesByQuote` MUST be ascending per quote — the walk stops at the
 * first date strictly greater than `dateStr` and relies on lexicographic order
 * to keep "most recent prior" correct, and the first entry is read as the
 * earliest rate.
 */
export const createFindLatestUsdRate = ({
  usdRatesMap,
  usdRateDatesByQuote,
}: {
  usdRatesMap: Map<string, number>;
  usdRateDatesByQuote: Map<string, string[]>;
}) => {
  return (quoteCode: string, dateStr: string): UsdRate | null => {
    if (quoteCode === API_LAYER_BASE_CURRENCY_CODE) return { rate: 1, approximated: false };

    const exact = usdRatesMap.get(`${quoteCode}_${dateStr}`);
    if (exact !== undefined) return { rate: exact, approximated: false };

    const dates = usdRateDatesByQuote.get(quoteCode);
    if (!dates || dates.length === 0) return null;

    let candidate: number | null = null;
    for (const d of dates) {
      if (d <= dateStr) {
        candidate = usdRatesMap.get(`${quoteCode}_${d}`) ?? candidate;
      } else {
        break;
      }
    }
    if (candidate !== null) return { rate: candidate, approximated: false };

    const earliest = usdRatesMap.get(`${quoteCode}_${dates[0]!}`);
    return earliest === undefined ? null : { rate: earliest, approximated: true };
  };
};

/**
 * Closure factory: resolves `currencyCode → userBase` for `dateStr`. Order of
 * precedence: user override > USD-pivot cross-rate > 1:1 fallback.
 *
 * `onMissingRate` fires whenever the result is not a real rate for that day:
 * with `approximated: true` when a leg used its earliest stored rate for an
 * earlier date, with `approximated: false` when the conversion fell to 1:1.
 *
 * A stored zero USD-rate is treated as data corruption (only a bad DB write or
 * an upstream provider bug can produce it) — surfaced as an error and declined
 * like a missing rate so the divisor is never zero.
 *
 * Uses the same USD-pivot cross-rate formula as `getExchangeRate` in
 * `services/user-exchange-rate/get-exchange-rate.service.ts` — keep the
 * divisor logic in sync if you touch either.
 */
export const createGetExchangeRate = ({
  userBaseCurrencyCode,
  userRatesMap,
  findLatestUsdRate,
  onMissingRate,
}: {
  userBaseCurrencyCode: string;
  userRatesMap: Map<string, number>;
  findLatestUsdRate: (quoteCode: string, dateStr: string) => UsdRate | null;
  onMissingRate: ({ currencyCode, approximated }: { currencyCode: string; approximated: boolean }) => void;
}) => {
  return (currencyCode: string, dateStr: string): number => {
    if (currencyCode === userBaseCurrencyCode) return 1;

    const userOverride = userRatesMap.get(`${currencyCode}_${dateStr}`);
    if (userOverride !== undefined) return userOverride;

    // Cross-rate via USD pivot: value_in_userBase = value_in_currencyCode *
    // (USD→userBase) / (USD→currencyCode).
    const usdToCurrency = findLatestUsdRate(currencyCode, dateStr);
    const usdToBase = findLatestUsdRate(userBaseCurrencyCode, dateStr);

    if (usdToCurrency == null || usdToBase == null) {
      onMissingRate({ currencyCode, approximated: false });
      return 1;
    }

    if (usdToCurrency.rate === 0) {
      logger.error(`Stored exchange rate is zero for USD->${currencyCode} on ${dateStr}; treating as missing.`);
      onMissingRate({ currencyCode, approximated: false });
      return 1;
    }

    if (usdToCurrency.approximated || usdToBase.approximated) {
      onMissingRate({ currencyCode, approximated: true });
    }

    return usdToBase.rate / usdToCurrency.rate;
  };
};
