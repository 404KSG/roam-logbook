/**
 * Thin wrapper around `window.roamAlphaAPI`.
 *
 * Read helpers keep a successful empty result distinct from a failed graph read.
 * The graph is the source of truth, so treating a temporary failure as an empty
 * graph could make a caller write duplicate or destructive state.
 */

import { referencedBlockUid } from './org.js';

export class GraphReadError extends Error {
    constructor(message, { cause } = {}) {
        super(message, { cause });
        this.name = 'GraphReadError';
    }
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
    const rows = validateQueryRows(
        queryOrThrow(
        '[:find ?s :in $ ?uid :where [?b :block/uid ?uid] [?b :block/string ?s]]',
        uid
        ),
        'block string',
        row => row.length >= 1 && typeof row[0] === 'string'
    );
    return rows[0]?.[0] ?? null;
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

export async function createBlock({ parentUid, order, string, uid }) {
    const create = resolve('block', 'create', 'createBlock');
    if (!create) throw new Error('roamAlphaAPI block.create unavailable');
    const blockUid = uid || generateUid();
    await create({
        location: { 'parent-uid': parentUid, order },
        block: { string, uid: blockUid },
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
