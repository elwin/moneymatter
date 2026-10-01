import { BANK_PROVIDER_TYPE } from '@bt/shared/types';
import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import { redisClient } from '@root/redis-client';
import { buildLockKey } from '@services/currencies/base-currency-lock';
import * as helpers from '@tests/helpers';
import {
  SIMPLEFIN_ACCOUNT_1,
  SIMPLEFIN_ACCOUNT_2,
  getMockedSimplefinAccountSet,
  getMockedSimplefinTransactions,
} from '@tests/mocks/simplefin/data';
import {
  SIMPLEFIN_ACCOUNTS_URL,
  VALID_SIMPLEFIN_SETUP_TOKEN,
  getSimplefinAccountsErrorMock,
  getSimplefinAccountsMock,
} from '@tests/mocks/simplefin/mock-api';
import { HttpResponse, http } from 'msw';

import { SyncStatus } from './sync-status-tracker';

const connectSimplefin = async (): Promise<string> => {
  const { connectionId } = await helpers.bankDataProviders.connectProvider({
    providerType: BANK_PROVIDER_TYPE.SIMPLEFIN,
    credentials: { setupToken: VALID_SIMPLEFIN_SETUP_TOKEN },
    raw: true,
  });
  return connectionId;
};

const buildAccountSet = () =>
  getMockedSimplefinAccountSet({
    account1Transactions: getMockedSimplefinTransactions(2),
    account2Transactions: getMockedSimplefinTransactions(2),
  });

/** Both accounts store a transaction dated today, so the next sync spans a single window. */
const connectTwoAccounts = async (): Promise<{ connectionId: string; accountIds: string[] }> => {
  const connectionId = await connectSimplefin();
  global.mswMockServer.use(getSimplefinAccountsMock({ response: buildAccountSet() }));

  const { syncedAccounts } = await helpers.bankDataProviders.connectSelectedAccounts({
    connectionId,
    accountExternalIds: [SIMPLEFIN_ACCOUNT_1, SIMPLEFIN_ACCOUNT_2],
    raw: true,
  });

  return { connectionId, accountIds: syncedAccounts.map((account) => account.id) };
};

const recordAccountsRequests = ({ delayMs = 0 }: { delayMs?: number } = {}): URL[] => {
  const requests: URL[] = [];

  global.mswMockServer.use(
    http.get(SIMPLEFIN_ACCOUNTS_URL, async ({ request }) => {
      requests.push(new URL(request.url));
      await helpers.sleep(delayMs);
      return HttpResponse.json(buildAccountSet());
    }),
  );

  return requests;
};

describe('Connection sync', () => {
  describe('POST /bank-data-providers/connections/:connectionId/sync', () => {
    it('queues every linked account and responds before the sync finishes', async () => {
      const { connectionId, accountIds } = await connectTwoAccounts();
      recordAccountsRequests({ delayMs: 1500 });

      const result = await helpers.bankDataProviders.syncConnection({ connectionId, raw: true });
      expect(result).toEqual({ totalAccounts: 2, queuedAccounts: 2 });

      const inProgress = await helpers.bankDataProviders.getAccountsSyncStatus({ raw: true });
      expect(inProgress.summary.queued + inProgress.summary.syncing).toBe(2);
      expect(inProgress.lastSyncAt).toBeNull();

      await helpers.bankDataProviders.waitForAccountsSyncToSettle();

      const { accounts } = await helpers.bankDataProviders.getAccountsSyncStatus({ raw: true });
      for (const accountId of accountIds) {
        expect(accounts.find((account) => account.accountId === accountId)?.status).toBe(SyncStatus.COMPLETED);
      }
    });

    it('syncs a multi-account connection with one batched provider request', async () => {
      const { connectionId } = await connectTwoAccounts();
      const requests = recordAccountsRequests();

      await helpers.bankDataProviders.syncConnection({ connectionId, raw: true });
      await helpers.bankDataProviders.waitForAccountsSyncToSettle();

      expect(requests.length).toBe(1);
      expect(requests[0]!.searchParams.get('account')).toBeNull();
    });

    it('queues only the accounts linked to the requested connection', async () => {
      const connectionA = await connectSimplefin();
      const connectionB = await connectSimplefin();
      global.mswMockServer.use(getSimplefinAccountsMock({ response: buildAccountSet() }));

      await helpers.bankDataProviders.connectSelectedAccounts({
        connectionId: connectionA,
        accountExternalIds: [SIMPLEFIN_ACCOUNT_1],
        raw: true,
      });
      await helpers.bankDataProviders.connectSelectedAccounts({
        connectionId: connectionB,
        accountExternalIds: [SIMPLEFIN_ACCOUNT_2],
        raw: true,
      });

      const result = await helpers.bankDataProviders.syncConnection({ connectionId: connectionA, raw: true });
      expect(result).toEqual({ totalAccounts: 1, queuedAccounts: 1 });

      await helpers.bankDataProviders.waitForAccountsSyncToSettle();
    });

    it('queues nothing for a connection with no linked accounts', async () => {
      const connectionId = await connectSimplefin();

      const result = await helpers.bankDataProviders.syncConnection({ connectionId, raw: true });

      expect(result).toEqual({ totalAccounts: 0, queuedAccounts: 0 });
    });

    it('queues nothing for an inactive connection', async () => {
      const { connectionId, accountIds } = await connectTwoAccounts();

      // Two consecutive auth failures deactivate the connection.
      global.mswMockServer.use(getSimplefinAccountsErrorMock({ status: 403 }));
      await helpers.bankDataProviders.syncTransactionsForAccount({ connectionId, accountId: accountIds[0]! });
      await helpers.bankDataProviders.syncTransactionsForAccount({ connectionId, accountId: accountIds[0]! });

      const { connection } = await helpers.bankDataProviders.getConnectionDetails({ connectionId, raw: true });
      expect(connection.isActive).toBe(false);

      const result = await helpers.bankDataProviders.syncConnection({ connectionId, raw: true });

      expect(result).toEqual({ totalAccounts: 0, queuedAccounts: 0 });
    });

    it('returns 404 for an unknown connection', async () => {
      const response = await helpers.bankDataProviders.syncConnection({ connectionId: generateRandomRecordId() });

      expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
    });

    it("returns 404 for another user's connection and queues nothing", async () => {
      const { connectionId } = await connectTwoAccounts();
      const userB = await helpers.provisionSecondUserWithBaseCurrency();

      const response = await helpers.asUser({
        cookies: userB.cookies,
        fn: () => helpers.bankDataProviders.syncConnection({ connectionId }),
      });

      expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);

      const { summary } = await helpers.bankDataProviders.getAccountsSyncStatus({ raw: true });
      expect(summary.queued + summary.syncing).toBe(0);
    });

    it('rejects the sync while a base-currency change holds the lock', async () => {
      const { id: userId } = await helpers.getUserInfo({ raw: true });
      const { connectionId } = await connectTwoAccounts();

      await redisClient.set(buildLockKey(userId), 'test-lock');
      let response;
      try {
        response = await helpers.bankDataProviders.syncConnection({ connectionId });
      } finally {
        await redisClient.del(buildLockKey(userId));
      }

      expect(response.statusCode).toBe(ERROR_CODES.Locked);

      const { summary } = await helpers.bankDataProviders.getAccountsSyncStatus({ raw: true });
      expect(summary.queued + summary.syncing).toBe(0);
    });
  });
});
