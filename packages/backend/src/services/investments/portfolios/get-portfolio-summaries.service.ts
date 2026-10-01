import type { PortfolioSummaryModel } from '@bt/shared/types/investments/portfolio-summary.model';
import { CustomError } from '@js/errors';
import { logger } from '@js/utils';
import Portfolios from '@models/investments/portfolios.model';
import { getPortfolioSummary } from '@services/investments/portfolios/get-portfolio-summary.service';

// Never wrap this in withTransaction: each getPortfolioSummary runs in its own transaction,
// so a failed statement in one portfolio cannot abort the summaries computed after it.
// ponytail: one getPortfolioSummary per portfolio. Batch the holdings and price lookups
// across portfolios if the request gets slow.
export const getPortfolioSummaries = async ({ userId }: { userId: number }): Promise<PortfolioSummaryModel[]> => {
  const portfolios = await Portfolios.findAll({ where: { userId }, attributes: ['id'] });

  const summaries: PortfolioSummaryModel[] = [];
  let lastError: CustomError | undefined;
  for (const { id } of portfolios) {
    try {
      summaries.push(await getPortfolioSummary({ userId, portfolioId: id }));
    } catch (error) {
      // Only a domain error belongs to one portfolio. Anything else (database, bug) fails
      // the request, so the client retries it and never caches a partial list as fresh.
      if (!(error instanceof CustomError)) throw error;
      lastError = error;
      logger.info('Portfolio summary failed; portfolio is omitted from the summaries list', {
        userId,
        portfolioId: id,
        error: error.message,
      });
    }
  }

  // Never return [] when every portfolio failed: the client caches it as "user has no portfolios".
  if (!summaries.length && lastError) throw lastError;

  return summaries;
};
