import { connection } from '@models/connection';
import ExchangeRates from '@models/exchange-rates.model';
import { API_LAYER_BASE_CURRENCY_CODE } from '@services/exchange-rates/constants';
import { format, parseISO, startOfDay } from 'date-fns';
import { QueryTypes } from 'sequelize';

const formatDate = (date: Date | string): string => format(date, 'yyyy-MM-dd');

type UsdRateRow = Pick<ExchangeRates, 'quoteCode' | 'date' | 'rate'>;

interface UsdRateLookup {
  /** `${quoteCode}_${yyyy-MM-dd}` -> `1 USD = N quoteCode`. */
  usdRatesMap: Map<string, number>;
  /** quoteCode -> ascending yyyy-MM-dd dates present in `usdRatesMap`. */
  usdRateDatesByQuote: Map<string, string[]>;
}

/**
 * Build the USD-pivot rate lookup the balance-history walkers use, seeded with one
 * "last known" anchor per currency from strictly BEFORE the chart window.
 *
 * Balance-history readers preload system rates only within `[windowStart, windowEnd]`.
 * A currency whose most recent stored rate predates `windowStart` then has zero rows in
 * the lookup, so the per-day backward walk (`findLatestUsdRate`) finds nothing and the
 * caller silently collapses that currency's value to a wrong 1:1 — e.g. a USD asset on
 * a base whose rate stopped updating reads ~40x off. Querying the single latest rate
 * before `windowStart` per currency gives the walk a valid prior rate to carry forward.
 * A currency whose first stored rate falls inside the window has no anchor;
 * `findLatestUsdRate` resolves the days before it at that first rate. A currency
 * with no stored rate up to the window end gets its earliest stored rate, dated
 * after the window, and resolves every day at it the same way. Only a currency
 * with no stored rate anywhere is absent here and converts 1:1.
 *
 * `systemRates` MUST already be sorted ascending by date within each quoteCode (the
 * callers order their query by quoteCode, date ASC). Pre-window anchors are inserted
 * first so each quote's date list stays globally ascending, which `findLatestUsdRate`
 * relies on for its backward walk.
 */
export const buildUsdRateLookup = async ({
  systemRates,
  quoteCodes,
  windowStart,
}: {
  systemRates: UsdRateRow[];
  quoteCodes: string[];
  /** yyyy-MM-dd — inclusive lower bound of the preloaded window. */
  windowStart: string;
}): Promise<UsdRateLookup> => {
  const anchorCodes = quoteCodes.filter((code) => code !== API_LAYER_BASE_CURRENCY_CODE);

  // Only one row per currency is ever needed (the latest rate before the
  // window), so DISTINCT ON does the per-currency top-1 inside Postgres and
  // returns ~30 anchor rows — ExchangeRates is a global every-currency×every-day
  // table, so anything broader ships tens of thousands of rows. A
  // findOne-per-currency Promise.all would fan out into N parallel
  // `pg.connect` spans that Sentry's detector flags as N+1.
  // TIMESTAMPTZ `date` comes back as a JS Date and FLOAT `rate` as a number,
  // matching UsdRateRow.
  const preWindowAnchors = anchorCodes.length
    ? ((await connection.sequelize.query(
        `
        SELECT DISTINCT ON ("quoteCode") "quoteCode", "date", "rate"
          FROM "ExchangeRates"
         WHERE "baseCode" = :baseCode
           AND "quoteCode" IN (:anchorCodes)
           AND "date" < :windowStart
         ORDER BY "quoteCode", "date" DESC
        `,
        {
          type: QueryTypes.SELECT,
          replacements: {
            baseCode: API_LAYER_BASE_CURRENCY_CODE,
            anchorCodes,
            windowStart: startOfDay(parseISO(windowStart)),
          },
        },
      )) as UsdRateRow[])
    : [];

  // A currency with no anchor and no in-window row has no rate up to the window
  // end, so its earliest stored rate overall is the first one after the window.
  const coveredCodes = new Set([...preWindowAnchors, ...systemRates].map((row) => row.quoteCode));
  const uncoveredCodes = anchorCodes.filter((code) => !coveredCodes.has(code));
  const earliestRatesAfterWindow = uncoveredCodes.length
    ? ((await connection.sequelize.query(
        `
        SELECT DISTINCT ON ("quoteCode") "quoteCode", "date", "rate"
          FROM "ExchangeRates"
         WHERE "baseCode" = :baseCode
           AND "quoteCode" IN (:uncoveredCodes)
         ORDER BY "quoteCode", "date" ASC
        `,
        {
          type: QueryTypes.SELECT,
          replacements: { baseCode: API_LAYER_BASE_CURRENCY_CODE, uncoveredCodes },
        },
      )) as UsdRateRow[])
    : [];

  const usdRatesMap = new Map<string, number>();
  const usdRateDatesByQuote = new Map<string, string[]>();

  // Anchors first (each strictly older than every in-window date), then the in-window
  // rows in ascending date order — keeps each quote's date list ascending. An
  // after-window rate is the only row of its quote.
  for (const row of [...preWindowAnchors, ...systemRates, ...earliestRatesAfterWindow]) {
    const dateStr = formatDate(row.date);
    usdRatesMap.set(`${row.quoteCode}_${dateStr}`, row.rate);

    const dates = usdRateDatesByQuote.get(row.quoteCode);
    if (dates) dates.push(dateStr);
    else usdRateDatesByQuote.set(row.quoteCode, [dateStr]);
  }

  return { usdRatesMap, usdRateDatesByQuote };
};
