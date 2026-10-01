import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { queueConnectionSync } from '@root/services/bank-data-providers/sync/sync-manager';
import { z } from 'zod';

export default createController(
  z.object({
    params: z.object({
      connectionId: recordId(),
    }),
  }),
  async ({ user, params }) => {
    const result = await queueConnectionSync({ userId: user.id, connectionId: params.connectionId });

    return {
      data: result,
    };
  },
);
