import type { AccountIdentification, EnableBankingTransaction } from '../types';
import { IBAN_LESS_FALLBACK_WINDOW_DAYS, MS_PER_DAY } from './constants';
import { type CounterpartyRow, getCounterpartyIban } from './transaction-metadata';

/**
 * Drops candidates whose counterparty IBAN contradicts the reference row's.
 * When the reference has an IBAN, exact matches win; without any, IBAN-less
 * candidates dated within IBAN_LESS_FALLBACK_WINDOW_DAYS of `date` survive,
 * since ASPSPs often omit the counterparty on the pending payload and fill it
 * at booking. A different IBAN never survives. When the reference has none
 * (card purchases) nothing is filtered.
 */
export function filterIbanCompatible<T extends CounterpartyRow & { time: Date }>({
  candidates,
  counterpartyIban,
  date,
}: {
  candidates: T[];
  counterpartyIban: string | null;
  date: Date;
}): T[] {
  if (!counterpartyIban) return candidates;
  const matches = candidates.filter((candidate) => getCounterpartyIban({ tx: candidate }) === counterpartyIban);
  if (matches.length > 0) return matches;
  return candidates.filter(
    (candidate) =>
      getCounterpartyIban({ tx: candidate }) === null &&
      Math.abs(candidate.time.getTime() - date.getTime()) <= IBAN_LESS_FALLBACK_WINDOW_DAYS * MS_PER_DAY,
  );
}

/**
 * Nearest-dated candidate wins, so a booked re-issue pairs with its own
 * pending row instead of a stale never-booked one that shares the amount.
 */
export function pickNearestByDate<T extends { id: string; time: Date }>({
  candidates,
  date,
}: {
  candidates: T[];
  date: Date;
}): T | null {
  const target = date.getTime();
  const sorted = [...candidates].sort((a, b) => {
    const distance = Math.abs(a.time.getTime() - target) - Math.abs(b.time.getTime() - target);
    return distance !== 0 ? distance : a.id.localeCompare(b.id);
  });

  return sorted[0] ?? null;
}

function normalizeIdentifier({ value }: { value: string | null | undefined }): string | null {
  return value?.replace(/\s+/g, '').toUpperCase() || null;
}

function sideIdentifiers({
  account,
  ownIds,
}: {
  account: AccountIdentification | null | undefined;
  ownIds: Set<string>;
}): string[] {
  return [account?.iban, account?.other?.identification]
    .map((value) => normalizeIdentifier({ value }))
    .filter((id): id is string => id !== null && !ownIds.has(id));
}

/**
 * Whether two raw payloads name the same counterparty on the same side
 * (creditor vs debtor). Own account ids are ignored, and a side populated on
 * both payloads with disjoint identifiers rules the pair out.
 */
export function haveSameParties({
  incoming,
  stored,
  ownAccountIds,
}: {
  incoming: EnableBankingTransaction;
  stored: EnableBankingTransaction;
  ownAccountIds: string[];
}): boolean {
  const ownIds = new Set(
    ownAccountIds.map((value) => normalizeIdentifier({ value })).filter((id): id is string => id !== null),
  );
  let shared = false;
  for (const side of ['creditor_account', 'debtor_account'] as const) {
    const incomingIds = sideIdentifiers({ account: incoming[side], ownIds });
    const storedIds = sideIdentifiers({ account: stored[side], ownIds });
    if (incomingIds.length === 0 || storedIds.length === 0) continue;
    if (!incomingIds.some((id) => storedIds.includes(id))) return false;
    shared = true;
  }
  return shared;
}
