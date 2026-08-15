/**
 * Present graph-mutation outcomes at the public UI boundary.
 *
 * Mutation modules return structured uncertainty so callers can retain retry
 * state. This module keeps the user-facing wording in one place and leaves
 * successful actions silent.
 */

export const GRAPH_SYNC_RETRY_NOTICE =
    'Graph state could not be confirmed; no further changes were made. Retry after Roam finishes syncing.';

const presentedResults = new WeakSet();

export function mutationResultNotice(result) {
    if (!result) return '';
    const message = typeof result?.message === 'string' ? result.message : result?.error?.message;
    if (result?.uncertain === true || (typeof message === 'string' && /Graph state could not be confirmed/i.test(message))) {
        return GRAPH_SYNC_RETRY_NOTICE;
    }
    const failed = Number.isFinite(Number(result?.failed)) ? Number(result.failed) : 0;
    const pending = Number.isFinite(Number(result?.pending)) ? Number(result.pending) : 0;
    if (result?.partial === true || failed > 0 || pending > 0 || result?.retry) {
        const completed = Number.isFinite(Number(result?.completed))
            ? Number(result.completed)
            : Number.isFinite(Number(result?.count))
              ? Number(result.count)
              : 0;
        const noun = result?.item || 'Session';
        const completedVerb = result?.completedVerb || 'updated';
        const failedCount = failed || pending;
        const completedText = `${completed} ${noun}${completed === 1 ? '' : 's'} ${completedVerb}`;
        const failedText = `${failedCount} could not be updated`;
        const detail =
            result?.action === 'resume-one' && typeof message === 'string' && message.trim()
                ? ` ${message.trim()}`
                : '';
        return completed > 0
            ? `${completedText}; ${failedText}.${detail} Retry after Roam finishes syncing.`
            : `${failedText[0].toUpperCase()}${failedText.slice(1)}.${detail} Retry after Roam finishes syncing.`;
    }
    return '';
}

export function presentMutationResult(result, notifyUser) {
    if (!result || (typeof result !== 'object' && typeof result !== 'function')) return result;
    if (presentedResults.has(result)) return result;
    presentedResults.add(result);
    const notice = mutationResultNotice(result);
    if (notice) notifyUser?.(notice);
    return result;
}
