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
    if (
        result?.uncertain === true ||
        result?.partial === true ||
        result?.retry ||
        (typeof message === 'string' && /Graph state could not be confirmed/i.test(message))
    ) {
        return GRAPH_SYNC_RETRY_NOTICE;
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
