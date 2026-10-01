import { createController } from '@controllers/helpers/controller-factory';
import { getPortfolioSummaries } from '@services/investments/portfolios/get-portfolio-summaries.service';
import { z } from 'zod';

const schema = z.object({});

export default createController(schema, async ({ user }) => {
  const data = await getPortfolioSummaries({ userId: user.id });
  return { data };
});
