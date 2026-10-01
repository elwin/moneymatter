import { describe, expect, it } from '@jest/globals';
import fs from 'fs';
import path from 'path';

import { isStalledPastLimitFailure } from './stalled-job-failure';

const BULLMQ_STALLED_REASON = 'job stalled more than allowable limit';

describe('isStalledPastLimitFailure', () => {
  it('matches the reason of a job stalled past maxStalledCount', () => {
    expect(isStalledPastLimitFailure({ reason: BULLMQ_STALLED_REASON })).toBe(true);
  });

  it('rejects every other failure reason', () => {
    expect(isStalledPastLimitFailure({ reason: 'Account with ID 1 not found' })).toBe(false);
    expect(isStalledPastLimitFailure({ reason: `Error: ${BULLMQ_STALLED_REASON}` })).toBe(false);
    expect(isStalledPastLimitFailure({ reason: '' })).toBe(false);
    expect(isStalledPastLimitFailure({ reason: undefined })).toBe(false);
  });

  it('matches the reason the installed BullMQ stalled-check script writes', () => {
    const scriptsDir = path.join(path.dirname(require.resolve('bullmq')), 'scripts');
    const scriptName = fs.readdirSync(scriptsDir).find((name) => /^moveStalledJobsToWait-\d+\.js$/.test(name));

    expect(scriptName).toBeDefined();
    const script = fs.readFileSync(path.join(scriptsDir, scriptName ?? ''), 'utf-8');

    expect(script).toContain(`"${BULLMQ_STALLED_REASON}"`);
  });
});
