import { TRANSACTION_TYPES } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';

import {
  type AccountIdentification,
  CreditDebitIndicator,
  type EnableBankingTransaction,
  TransactionStatus,
} from '../types';
import { filterIbanCompatible, haveSameParties, pickNearestByDate } from './candidate-selection';

const IBAN = 'FR7630006000011234567890189';
const OTHER_IBAN = 'DE89370400440532013000';
const REFERENCE_DATE = new Date('2026-05-01T00:00:00.000Z');

function expenseRow({ id, creditorAccount, time }: { id: string; creditorAccount?: string; time?: string }) {
  return {
    id,
    time: time ? new Date(time) : REFERENCE_DATE,
    transactionType: TRANSACTION_TYPES.expense,
    externalData: creditorAccount ? { creditorAccount } : {},
  };
}

function incomeRow({ id, debtorAccount }: { id: string; debtorAccount?: string }) {
  return {
    id,
    time: new Date('2026-05-01T00:00:00.000Z'),
    transactionType: TRANSACTION_TYPES.income,
    externalData: debtorAccount ? { debtorAccount } : {},
  };
}

function datedRow({ id, date }: { id: string; date: string }) {
  return {
    id,
    time: new Date(date),
    transactionType: TRANSACTION_TYPES.expense,
    externalData: {},
  };
}

describe('filterIbanCompatible', () => {
  it('keeps only the candidates carrying the same IBAN as the reference', () => {
    const match = expenseRow({ id: 'a', creditorAccount: IBAN });
    const mismatch = expenseRow({ id: 'b', creditorAccount: OTHER_IBAN });

    const result = filterIbanCompatible({
      candidates: [match, mismatch],
      counterpartyIban: IBAN,
      date: REFERENCE_DATE,
    });

    expect(result).toEqual([match]);
  });

  it('falls back to an IBAN-less candidate when no candidate carries the reference IBAN', () => {
    const ibanLess = expenseRow({ id: 'a' });
    const mismatch = expenseRow({ id: 'b', creditorAccount: OTHER_IBAN });

    const result = filterIbanCompatible({
      candidates: [ibanLess, mismatch],
      counterpartyIban: IBAN,
      date: REFERENCE_DATE,
    });

    expect(result).toEqual([ibanLess]);
  });

  it('prefers an IBAN match over an IBAN-less candidate', () => {
    const match = expenseRow({ id: 'a', creditorAccount: IBAN });
    const ibanLess = expenseRow({ id: 'b' });

    const result = filterIbanCompatible({
      candidates: [ibanLess, match],
      counterpartyIban: IBAN,
      date: REFERENCE_DATE,
    });

    expect(result).toEqual([match]);
  });

  it('only falls back to an IBAN-less candidate dated within the fallback window', () => {
    const inside = expenseRow({ id: 'a', time: '2026-04-26T00:00:00.000Z' });
    const outside = expenseRow({ id: 'b', time: '2026-04-25T00:00:00.000Z' });

    const result = filterIbanCompatible({
      candidates: [inside, outside],
      counterpartyIban: IBAN,
      date: REFERENCE_DATE,
    });

    expect(result).toEqual([inside]);
  });

  it('keeps an IBAN match regardless of the fallback window', () => {
    const match = expenseRow({ id: 'a', creditorAccount: IBAN, time: '2026-04-20T00:00:00.000Z' });

    expect(filterIbanCompatible({ candidates: [match], counterpartyIban: IBAN, date: REFERENCE_DATE })).toEqual([
      match,
    ]);
  });

  it('returns nothing when the only candidate carries a different IBAN', () => {
    const mismatch = expenseRow({ id: 'a', creditorAccount: OTHER_IBAN });

    expect(filterIbanCompatible({ candidates: [mismatch], counterpartyIban: IBAN, date: REFERENCE_DATE })).toEqual([]);
  });

  it('filters nothing when the reference has no IBAN', () => {
    const candidates = [expenseRow({ id: 'a', creditorAccount: IBAN }), expenseRow({ id: 'b' })];

    const result = filterIbanCompatible({ candidates, counterpartyIban: null, date: REFERENCE_DATE });

    expect(result).toEqual(candidates);
  });

  it('reads debtorAccount on income candidates', () => {
    const match = incomeRow({ id: 'a', debtorAccount: IBAN });
    const wrongField = expenseRow({ id: 'b', creditorAccount: IBAN });

    const result = filterIbanCompatible({
      candidates: [match, wrongField],
      counterpartyIban: IBAN,
      date: REFERENCE_DATE,
    });

    expect(result).toEqual([match, wrongField]);
  });

  it('returns an empty list for no candidates', () => {
    expect(filterIbanCompatible({ candidates: [], counterpartyIban: IBAN, date: REFERENCE_DATE })).toEqual([]);
  });
});

describe('pickNearestByDate', () => {
  it('picks the candidate closest to the target date', () => {
    const near = datedRow({ id: 'a', date: '2026-05-03T00:00:00.000Z' });
    const far = datedRow({ id: 'b', date: '2026-04-28T00:00:00.000Z' });

    const result = pickNearestByDate({ candidates: [far, near], date: new Date('2026-05-04T00:00:00.000Z') });

    expect(result).toBe(near);
  });

  it('treats earlier and later candidates by absolute distance', () => {
    const before = datedRow({ id: 'a', date: '2026-05-03T00:00:00.000Z' });
    const after = datedRow({ id: 'b', date: '2026-05-08T00:00:00.000Z' });

    const result = pickNearestByDate({ candidates: [after, before], date: new Date('2026-05-04T00:00:00.000Z') });

    expect(result).toBe(before);
  });

  it('breaks ties on id so the choice does not depend on input order', () => {
    const first = datedRow({ id: 'aaa', date: '2026-05-03T00:00:00.000Z' });
    const second = datedRow({ id: 'bbb', date: '2026-05-05T00:00:00.000Z' });
    const date = new Date('2026-05-04T00:00:00.000Z');

    expect(pickNearestByDate({ candidates: [first, second], date })).toBe(first);
    expect(pickNearestByDate({ candidates: [second, first], date })).toBe(first);
  });

  it('leaves the input array untouched', () => {
    const first = datedRow({ id: 'a', date: '2026-05-08T00:00:00.000Z' });
    const second = datedRow({ id: 'b', date: '2026-05-03T00:00:00.000Z' });
    const candidates = [first, second];

    pickNearestByDate({ candidates, date: new Date('2026-05-04T00:00:00.000Z') });

    expect(candidates).toEqual([first, second]);
  });

  it('returns null when there are no candidates', () => {
    expect(pickNearestByDate({ candidates: [], date: new Date('2026-05-04T00:00:00.000Z') })).toBeNull();
  });
});

const OWN_IBAN = 'SE3550000000054910000003';
const PAYEE_BBAN = '58628082';

// Raw ASPSP payloads carry `iban: null` next to a BBAN, which the type does not model.
function bban({ identification }: { identification: string }): AccountIdentification {
  return { iban: null, other: { scheme_name: 'BBAN', identification } } as unknown as AccountIdentification;
}

function rawTx({
  creditorAccount,
  debtorAccount,
  creditDebitIndicator = CreditDebitIndicator.DBIT,
}: {
  creditorAccount?: AccountIdentification;
  debtorAccount?: AccountIdentification;
  creditDebitIndicator?: CreditDebitIndicator;
}): EnableBankingTransaction {
  return {
    transaction_amount: { amount: '140.00', currency: 'EUR' },
    credit_debit_indicator: creditDebitIndicator,
    status: TransactionStatus.BOOK,
    creditor_account: creditorAccount,
    debtor_account: debtorAccount,
  };
}

describe('haveSameParties', () => {
  it('matches payloads naming the same BBAN creditor, whatever the direction flag says', () => {
    const pending = rawTx({
      creditorAccount: bban({ identification: PAYEE_BBAN }),
      creditDebitIndicator: CreditDebitIndicator.CRDT,
    });
    const booked = rawTx({
      creditorAccount: bban({ identification: PAYEE_BBAN }),
      debtorAccount: { iban: OWN_IBAN },
    });

    expect(haveSameParties({ incoming: booked, stored: pending, ownAccountIds: [OWN_IBAN] })).toBe(true);
  });

  it('rejects a purchase and a refund, whose parties swap sides', () => {
    const purchase = rawTx({ creditorAccount: { iban: IBAN }, debtorAccount: { iban: OWN_IBAN } });
    const refund = rawTx({
      creditorAccount: { iban: OWN_IBAN },
      debtorAccount: { iban: IBAN },
      creditDebitIndicator: CreditDebitIndicator.CRDT,
    });

    expect(haveSameParties({ incoming: refund, stored: purchase, ownAccountIds: [OWN_IBAN] })).toBe(false);
  });

  it('rejects payloads naming different creditors', () => {
    const stored = rawTx({ creditorAccount: bban({ identification: PAYEE_BBAN }) });
    const incoming = rawTx({ creditorAccount: bban({ identification: '11112222' }) });

    expect(haveSameParties({ incoming, stored, ownAccountIds: [OWN_IBAN] })).toBe(false);
  });

  it('does not treat the own account as a shared party', () => {
    const stored = rawTx({ debtorAccount: { iban: OWN_IBAN } });
    const incoming = rawTx({ debtorAccount: { iban: OWN_IBAN } });

    expect(haveSameParties({ incoming, stored, ownAccountIds: [OWN_IBAN] })).toBe(false);
  });

  it('rejects payloads without any identifiers', () => {
    expect(haveSameParties({ incoming: rawTx({}), stored: rawTx({}), ownAccountIds: [] })).toBe(false);
  });

  it('matches on one side when the other side is absent on one payload', () => {
    const stored = rawTx({ creditorAccount: { iban: IBAN } });
    const incoming = rawTx({ creditorAccount: { iban: IBAN }, debtorAccount: { iban: OTHER_IBAN } });

    expect(haveSameParties({ incoming, stored, ownAccountIds: [OWN_IBAN] })).toBe(true);
  });

  it('ignores whitespace and case in identifiers', () => {
    const stored = rawTx({ creditorAccount: { iban: 'fr76 3000 6000 0112 3456 7890 189' } });
    const incoming = rawTx({ creditorAccount: { iban: IBAN }, debtorAccount: { iban: OWN_IBAN } });

    expect(haveSameParties({ incoming, stored, ownAccountIds: ['se35 5000 0000 0549 1000 0003'] })).toBe(true);
  });
});
