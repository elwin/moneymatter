// BullMQ sets this failedReason in its stalled-check Lua script and exports no
// constant for it.
const STALLED_PAST_LIMIT_REASON = 'job stalled more than allowable limit';

/** True when BullMQ failed the job because the process running it died mid-run. */
export const isStalledPastLimitFailure = ({ reason }: { reason: string | undefined }): boolean =>
  reason === STALLED_PAST_LIMIT_REASON;
