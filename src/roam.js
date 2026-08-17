/**
 * Thin wrapper around `window.roamAlphaAPI`.
 *
 * Read helpers keep a successful empty result distinct from a failed graph read.
 * The graph is the source of truth, so treating a temporary failure as an empty
 * graph could make a caller write duplicate or destructive state.
 */

import { referencedBlockUid } from './org.js';

export class GraphReadError extends Error {
    constructor(message, { cause, issue } = {}) {
        super(message, { cause });
        this.name = 'GraphReadError';
        this.issue = issue || {
            kind: 'graph-read',
            source: 'graph',
            message,
        };
    }
}

export function graphReadIssue({ source, message, affectedUid, affectedUids } = {}) {
    const issue = {
        kind: 'graph-read',
        source: source || 'graph',
        message: message || 'The graph could not be read.',
    };
    if (typeof affectedUid === 'string' && affectedUid) issue.affectedUid = affectedUid;
    if (Array.isArray(affectedUids) && affectedUids.length > 0) {
        issue.affectedUids = [...new Set(affectedUids.filter(uid => typeof uid === 'string' && uid))];
    }
    return issue;
}

export function withGraphReadIssue(error, details = {}) {
    const message = error?.message || details.message || 'The graph could not be read.';
    return new GraphReadError(message, {
        cause: error,
        issue: graphReadIssue({ ...details, message }),
    });
}

export function getApi() {
    return (typeof window !== 'undefined' && window.roamAlphaAPI) || null;
}

export function generateUid() {
    const api = getApi();
    if (typeof api?.util?.generateUID === 'function') return api.util.generateUID();
    // Roam uids are 9 url-safe characters; this shape only matters for tests.
    return Math.random().toString(36).slice(2, 11);
}

/**
 * Resolve a method to the namespace that owns it.
 *
 * `q` and the block operations exist both on `roamAlphaAPI` and on the newer
 * `roamAlphaAPI.data.*`; picking the function from one and calling it against
 * the other's `this` breaks, so the owner is chosen alongside the function.
 */
function resolve(namespace, modernName, legacyName = modernName) {
    const api = getApi();
    if (!api) return null;
    const modernOwner = namespace ? api.data?.[namespace] : api.data;
    if (typeof modernOwner?.[modernName] === 'function') {
        return modernOwner[modernName].bind(modernOwner);
    }
    if (typeof api[legacyName] === 'function') return api[legacyName].bind(api);
    return null;
}

/**
 * Read one graph query at the adapter boundary.
 *
 * `ok: true, rows: []` is a valid empty graph result. `ok: false` means the
 * caller cannot know what the graph contains and must not treat it as empty.
 */
export function queryResult(datalog, ...args) {
    const run = resolve(null, 'q');
    if (!run) {
        return {
            ok: false,
            rows: null,
            error: new GraphReadError('roamAlphaAPI q unavailable'),
        };
    }
    try {
        const rows = run(datalog, ...args);
        if (!Array.isArray(rows) || rows.some(row => !Array.isArray(row))) {
            throw new GraphReadError('Graph query returned a non-array result', {
                cause: new TypeError('query rows must be an array of rows'),
            });
        }
        return { ok: true, rows, error: null };
    } catch (error) {
        const graphError =
            error instanceof GraphReadError
                ? error
                : new GraphReadError(error?.message || 'Graph query failed', { cause: error });
        return { ok: false, rows: null, error: graphError };
    }
}

/** Validate the shape of a successful query at the adapter boundary. */
export function validateQueryRows(rows, label, predicate) {
    if (rows.some(row => !predicate(row))) {
        throw new GraphReadError(`Graph query returned malformed ${label} rows`);
    }
    return rows;
}

/** Run a datalog query, letting the caller handle an uncertain graph state. */
export function queryOrThrow(datalog, ...args) {
    const result = queryResult(datalog, ...args);
    if (!result.ok) throw result.error;
    return result.rows;
}

/** Compatibility alias for callers that require a confirmed graph read. */
export function query(datalog, ...args) {
    return queryOrThrow(datalog, ...args);
}

export function getBlockString(uid) {
    if (!uid) return null;
    let rows;
    try {
        rows = validateQueryRows(
            queryOrThrow(
                '[:find ?s :in $ ?uid :where [?b :block/uid ?uid] [?b :block/string ?s]]',
                uid
            ),
            'block string',
            row => row.length >= 1 && typeof row[0] === 'string'
        );
    } catch (error) {
        throw withGraphReadIssue(error, { source: 'block-string', affectedUid: uid });
    }
    return rows[0]?.[0] ?? null;
}

/**
 * Watch one block's graph text through Roam's Pull Watch API.
 *
 * The returned detach function is safe to call more than once. Installation and
 * removal are explicit results because a missing or throwing Pull Watch API must
 * never be mistaken for a healthy watcher.
 */
export function watchBlockString(uid, onChange) {
    const add = resolve(null, 'addPullWatch');
    const remove = resolve(null, 'removePullWatch');
    const pattern = '[:block/string]';
    const entity = `[:block/uid ${JSON.stringify(uid)}]`;
    let detached = false;

    const installationError =
        typeof uid !== 'string' || uid.length === 0
            ? new Error('Pull Watch requires a block UID')
            : typeof onChange !== 'function'
              ? new Error('Pull Watch requires a change callback')
              : !add
                ? new Error('roamAlphaAPI addPullWatch unavailable')
                : null;

    if (installationError) {
        return {
            ok: false,
            uid,
            error: installationError,
            detach: () => ({ ok: false, detached: false, error: installationError }),
        };
    }

    const handler = (before, after) => {
        try {
            onChange({ uid, before, after });
        } catch (error) {
            console.error('[roam-logbook] pull-watch callback failed', error);
        }
    };

    try {
        add(pattern, entity, handler);
    } catch (error) {
        return {
            ok: false,
            uid,
            error,
            detach: () => ({ ok: false, detached: false, error }),
        };
    }

    return {
        ok: true,
        uid,
        detach: () => {
            if (detached) return { ok: true, detached: false };
            const remover = remove || resolve(null, 'removePullWatch');
            if (!remover) {
                const error = new Error('roamAlphaAPI removePullWatch unavailable');
                return { ok: false, detached: false, error };
            }
            try {
                remover(pattern, entity, handler);
                detached = true;
                return { ok: true, detached: true };
            } catch (error) {
                detached = false;
                return { ok: false, detached: false, error };
            }
        },
    };
}

/**
 * Follow a block that is nothing but a `((reference))` through to what it points at.
 *
 * A bare reference is transparent everywhere in this extension: clocking one logs
 * against the original, and walking past one in the ancestor chain lands on the
 * original — which is what makes sub-tasks written under a reference belong to the
 * task it mirrors.
 *
 * @returns {string} the underlying uid, or `uid` itself when it is not a reference
 */
export function resolveReferencedUid(uid) {
    const seen = new Set();
    let current = uid;
    while (current && !seen.has(current)) {
        seen.add(current);
        const referenced = referencedBlockUid(getBlockString(current));
        if (!referenced) return current;
        current = referenced;
    }
    return current || uid;
}

/** Direct children of a block, in sibling order. */
export function getChildren(uid) {
    if (!uid) return [];
    const rows = validateQueryRows(
        queryOrThrow(
            `[:find ?uid ?string ?order
          :in $ ?parent
          :where
          [?p :block/uid ?parent]
          [?p :block/children ?c]
          [?c :block/uid ?uid]
          [?c :block/string ?string]
          [?c :block/order ?order]]`,
            uid
        ),
        'children',
        row => row.length >= 3 && typeof row[0] === 'string' && typeof row[1] === 'string' && Number.isFinite(row[2])
    );
    return rows
        .map(([childUid, string, order]) => ({ uid: childUid, string, order }))
        .sort((a, b) => a.order - b.order);
}

export function getPageTitleOfBlock(uid) {
    if (!uid) return null;
    const rows = validateQueryRows(
        queryOrThrow(
            `[:find ?title :in $ ?uid
          :where [?b :block/uid ?uid] [?b :block/page ?p] [?p :node/title ?title]]`,
            uid
        ),
        'page title',
        row => row.length >= 1 && typeof row[0] === 'string'
    );
    return rows[0]?.[0] ?? null;
}

export async function createBlock({ parentUid, order, string, uid, open }) {
    const create = resolve('block', 'create', 'createBlock');
    if (!create) throw new Error('roamAlphaAPI block.create unavailable');
    const blockUid = uid || generateUid();
    const block = { string, uid: blockUid };
    if (open !== undefined) block.open = open;
    await create({
        location: { 'parent-uid': parentUid, order },
        block,
    });
    return blockUid;
}

export async function updateBlock({ uid, string }) {
    const update = resolve('block', 'update', 'updateBlock');
    if (!update) throw new Error('roamAlphaAPI block.update unavailable');
    await update({ block: { uid, string } });
}

export async function deleteBlock(uid) {
    const remove = resolve('block', 'delete', 'deleteBlock');
    if (!remove) throw new Error('roamAlphaAPI block.delete unavailable');
    await remove({ block: { uid } });
}

/** Uid of the block the cursor is in, or null when nothing is being edited. */
export function getFocusedBlockUid() {
    const api = getApi();
    try {
        return api?.ui?.getFocusedBlock?.()?.['block-uid'] ?? null;
    } catch {
        return null;
    }
}

/** Zoom the main window onto a block. */
export async function openBlock(uid) {
    const api = getApi();
    try {
        await api?.ui?.mainWindow?.openBlock?.({ block: { uid } });
    } catch (error) {
        console.error('[roam-logbook] could not open block', uid, error);
    }
}

// Roam owns the right-sidebar window stack. Keep the small extension-level
// dedupe here so repeated Shift+Click does not create an unbounded set of the
// same block windows when an older Roam build does not dedupe addWindow itself.
const requestedSidebarBlocks = new WeakMap();

const blockSidebarWindow = (uid, order) => {
    const sidebarWindow = { type: 'block', 'block-uid': uid };
    if (Number.isFinite(order)) sidebarWindow.order = order;
    return sidebarWindow;
};

const sidebarFailure = (reason, message, error) => ({
    ok: false,
    reason,
    message,
    ...(error ? { error } : {}),
});

/**
 * Put a block at order 0 in Roam's native right sidebar without changing focus.
 *
 * `isCurrent` lets the UI orchestration layer cancel a superseded intent after
 * asynchronous native reads. This adapter never closes, pins, removes, focuses,
 * or reorders an unrelated window.
 */
export async function frontBlockInRightSidebar(uid, { isCurrent = () => true } = {}) {
    if (typeof uid !== 'string' || uid.length === 0) {
        return sidebarFailure('missing-uid', 'This Timing Line has no block UID.');
    }

    const sidebar = getApi()?.ui?.rightSidebar;
    if (typeof sidebar?.addWindow !== 'function') {
        return sidebarFailure(
            'unavailable',
            'Roam right-sidebar block windows are unavailable.'
        );
    }

    const target = blockSidebarWindow(uid);
    try {
        await sidebar.open?.();
        if (!isCurrent()) return { ok: false, skipped: true, reason: 'superseded' };

        if (typeof sidebar.getWindows === 'function') {
            const windows = await sidebar.getWindows();
            if (!isCurrent()) return { ok: false, skipped: true, reason: 'superseded' };
            const existing = Array.isArray(windows)
                ? windows.find(
                      sidebarWindow =>
                          sidebarWindow?.type === 'block' &&
                          sidebarWindow?.['block-uid'] === uid
                  )
                : null;

            if (existing) {
                if (typeof sidebar.setWindowOrder !== 'function') {
                    return sidebarFailure(
                        'order-unavailable',
                        'Roam could not move the Timing Line sidebar window to the top.'
                    );
                }
                await sidebar.setWindowOrder({ window: blockSidebarWindow(uid, 0) });
                if (!isCurrent()) return { ok: false, skipped: true, reason: 'superseded' };
                if (typeof sidebar.expandWindow === 'function') {
                    await sidebar.expandWindow({ window: target });
                }
                return { ok: true, deduped: true, reordered: true };
            }

            if (!isCurrent()) return { ok: false, skipped: true, reason: 'superseded' };
            await sidebar.addWindow({ window: blockSidebarWindow(uid, 0) });
            return { ok: true, added: true };
        }

        // Older Roam builds have no authoritative window list. Reuse the
        // existing best-effort dedupe marker and include order 0 on first open.
        let requested = requestedSidebarBlocks.get(sidebar);
        if (!requested) {
            requested = new Set();
            requestedSidebarBlocks.set(sidebar, requested);
        }
        if (requested.has(uid)) return { ok: true, deduped: true };
        if (!isCurrent()) return { ok: false, skipped: true, reason: 'superseded' };

        try {
            await sidebar.addWindow({ window: blockSidebarWindow(uid, 0) });
            requested.add(uid);
        } catch (error) {
            requested.delete(uid);
            throw error;
        }
        return { ok: true, added: true };
    } catch (error) {
        console.debug('[roam-logbook] could not front Timing Line in right sidebar', uid, error);
        return sidebarFailure(
            'sidebar-front-failed',
            error?.message || 'Roam could not move the Timing Line to the top of the right sidebar.',
            error
        );
    }
}

/** Open a task in Roam's native right-sidebar block window. */
export async function openBlockInRightSidebar(uid) {
    if (typeof uid !== 'string' || uid.length === 0) {
        return { ok: false, reason: 'missing-uid', message: 'This Task has no block UID.' };
    }

    const sidebar = getApi()?.ui?.rightSidebar;
    if (typeof sidebar?.addWindow !== 'function') {
        return {
            ok: false,
            reason: 'unavailable',
            message: 'Roam right-sidebar block windows are unavailable.',
        };
    }

    try {
        await sidebar.open?.();

        // Prefer Roam's own window list whenever the API exposes it. Roam is
        // authoritative here: a user can close a sidebar window outside this
        // extension, so an extension-local Set is not allowed to suppress a
        // later request when the block is no longer genuinely open.
        if (typeof sidebar.getWindows === 'function') {
            const windows = await sidebar.getWindows();
            if (
                Array.isArray(windows) &&
                windows.some(
                    window =>
                        window?.type === 'block' && window?.['block-uid'] === uid
                )
            ) {
                return { ok: true, deduped: true };
            }

            await sidebar.addWindow({
                window: { type: 'block', 'block-uid': uid },
            });
            return { ok: true };
        }

        // Older Roam builds do not expose getWindows. Keep a best-effort
        // fallback only for those builds, and clear a pending marker whenever
        // addWindow rejects so a later attempt can retry safely.
        let requested = requestedSidebarBlocks.get(sidebar);
        if (!requested) {
            requested = new Set();
            requestedSidebarBlocks.set(sidebar, requested);
        }
        if (requested.has(uid)) return { ok: true, deduped: true };

        try {
            await sidebar.addWindow({
                window: { type: 'block', 'block-uid': uid },
            });
            requested.add(uid);
        } catch (error) {
            requested.delete(uid);
            throw error;
        }
        return { ok: true };
    } catch (error) {
        console.debug('[roam-logbook] could not open task in right sidebar', uid, error);
        return {
            ok: false,
            reason: 'sidebar-open-failed',
            message: error?.message || 'Roam could not open this Task in the right sidebar.',
            error,
        };
    }
}
