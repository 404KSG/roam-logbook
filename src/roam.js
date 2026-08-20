/**
 * Thin wrapper around `window.roamAlphaAPI`.
 *
 * Read helpers keep a successful empty result distinct from a failed graph read.
 * The graph is the source of truth, so treating a temporary failure as an empty
 * graph could make a caller write duplicate or destructive state.
 */

import { referencedBlockUid } from './org.js';
import { dateToPageTitle } from './today-todos.js';
import { ACTIVE_WORK_WINDOW_MS } from './active-work.js';

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
 * `q`, pull, and the block operations exist both on `roamAlphaAPI` and on
 * the newer `roamAlphaAPI.data.*`; picking the function from one and calling
 * it against the other's `this` breaks, so the owner is chosen alongside it.
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
 * Roam's experimental fast namespace can return a JS proxy around a Clojure
 * sequence/vector rather than a plain Array. Keep the graph adapter's public
 * query contract stable for the rest of the extension.
 */
function normalizeSequence(value) {
    if (Array.isArray(value)) return value;
    if (value === null || value === undefined || typeof value === 'string') return null;
    if (typeof value !== 'object' && typeof value !== 'function') return null;

    try {
        if (typeof value[Symbol.iterator] === 'function') return [...value];
    } catch {
        // Fall through to the array-like and numeric-key representations.
    }

    if (Number.isInteger(value.length) && value.length >= 0) {
        try {
            return Array.from(value);
        } catch {
            // Treat an unreadable proxy as a malformed graph response.
        }
    }

    const keys = Object.keys(value);
    if (keys.length === 0) return null;
    if (keys.every(key => /^\d+$/.test(key))) {
        return keys
            .sort((a, b) => Number(a) - Number(b))
            .map(key => value[key]);
    }
    return null;
}

function normalizeQueryRows(value) {
    const rows = normalizeSequence(value);
    if (!rows) {
        throw new GraphReadError('Graph query returned a non-array result', {
            cause: new TypeError('query rows must be an array of rows'),
        });
    }
    return rows.map(row => {
        const tuple = normalizeSequence(row);
        if (!tuple) {
            throw new GraphReadError('Graph query returned a non-array row', {
                cause: new TypeError('query rows must contain array-like rows'),
            });
        }
        return tuple;
    });
}

/**
 * Read one graph query at the adapter boundary.
 *
 * `ok: true, rows: []` is a valid empty graph result. `ok: false` means the
 * caller cannot know what the graph contains and must not treat it as empty.
 */
export function queryResult(datalog, ...args) {
    const fastRun = resolve('fast', 'q');
    const queryRun = resolve(null, 'q');
    const runs = [];
    if (fastRun) runs.push(fastRun);
    if (queryRun && queryRun !== fastRun) runs.push(queryRun);
    if (runs.length === 0) {
        return {
            ok: false,
            rows: null,
            error: new GraphReadError('roamAlphaAPI q unavailable'),
        };
    }

    let lastError = null;
    for (const run of runs) {
        try {
            return { ok: true, rows: normalizeQueryRows(run(datalog, ...args)), error: null };
        } catch (error) {
            lastError =
                error instanceof GraphReadError
                    ? error
                    : new GraphReadError(error?.message || 'Graph query failed', { cause: error });
        }
    }

    return { ok: false, rows: null, error: lastError };
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

const blockLookupRef = uid => [':block/uid', uid];

/**
 * Pull results use keyword-shaped object keys in current Roam builds. The
 * unprefixed fallback keeps this adapter tolerant of older/translated wrappers
 * without turning a missing attribute into a successful non-empty read.
 */
export function pullAttribute(entity, attribute) {
    if (entity === null || entity === undefined || typeof entity !== 'object') return undefined;
    if (entity[attribute] !== undefined) return entity[attribute];
    return entity[attribute.replace(/^:/, '')];
}

function pulledString(entity, label) {
    if (entity === null || entity === undefined) return null;
    if (typeof entity !== 'object' || Array.isArray(entity)) {
        throw new GraphReadError(`Graph pull returned malformed ${label}`);
    }
    const value = pullAttribute(entity, ':block/string');
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string') {
        throw new GraphReadError(`Graph pull returned malformed ${label}`);
    }
    return value;
}

function normalizePullEntities(value) {
    const entities = normalizeSequence(value);
    if (!entities) {
        throw new GraphReadError('Graph pull_many returned a non-array result', {
            cause: new TypeError('pull_many results must be an array of entities'),
        });
    }
    for (const entity of entities) {
        if (entity !== null && (typeof entity !== 'object' || Array.isArray(entity))) {
            throw new GraphReadError('Graph pull_many returned a malformed entity');
        }
    }
    return entities;
}

/** Pull many entities through modern or legacy Roam API names. */
export function pullMany(pattern, eids) {
    const run = resolve(null, 'pull_many');
    if (!run) throw new GraphReadError('roamAlphaAPI pull_many unavailable');
    try {
        return normalizePullEntities(run(pattern, eids));
    } catch (error) {
        if (error instanceof GraphReadError) throw error;
        throw new GraphReadError(error?.message || 'Graph pull_many failed', { cause: error });
    }
}

const readBlockStringFromQuery = uid =>
    validateQueryRows(
        queryOrThrow(
            '[:find ?s :in $ ?uid :where [?b :block/uid ?uid] [?b :block/string ?s]]',
            uid
        ),
        'block string',
        row => row.length >= 1 && typeof row[0] === 'string'
    )[0]?.[0] ?? null;

export function getBlockString(uid) {
    if (!uid) return null;

    const pull = resolve(null, 'pull');
    if (pull) {
        try {
            return pulledString(pull('[:block/string]', blockLookupRef(uid)), 'block string');
        } catch {
            // A partially deployed/older Roam build may expose q but not a
            // working pull implementation. Preserve the q fallback below.
        }
    }

    try {
        return readBlockStringFromQuery(uid);
    } catch (error) {
        throw withGraphReadIssue(error, { source: 'block-string', affectedUid: uid });
    }
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

const CHILDREN_PULL_PATTERN =
    '[{:block/children [:block/uid :block/string :block/order]}]';

function readChildrenFromPull(pull, uid) {
    const entity = pull(CHILDREN_PULL_PATTERN, blockLookupRef(uid));
    if (entity === null || entity === undefined) return [];
    if (typeof entity !== 'object' || Array.isArray(entity)) {
        throw new GraphReadError('Graph pull returned malformed children');
    }
    const children = pullAttribute(entity, ':block/children');
    if (children === null || children === undefined) return [];
    const childEntities = normalizeSequence(children);
    if (!childEntities) {
        throw new GraphReadError('Graph pull returned malformed children');
    }
    return childEntities
        .map(child => {
            if (child === null || typeof child !== 'object' || Array.isArray(child)) {
                throw new GraphReadError('Graph pull returned malformed child');
            }
            const childUid = pullAttribute(child, ':block/uid');
            const string = pullAttribute(child, ':block/string');
            const order = pullAttribute(child, ':block/order');
            if (typeof childUid !== 'string' || typeof string !== 'string' || !Number.isFinite(order)) {
                throw new GraphReadError('Graph pull returned malformed child');
            }
            return { uid: childUid, string, order };
        })
        .sort((a, b) => a.order - b.order);
}

function readChildrenFromQuery(uid) {
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
        row =>
            row.length >= 3 &&
            typeof row[0] === 'string' &&
            typeof row[1] === 'string' &&
            Number.isFinite(row[2])
    );
    return rows
        .map(([childUid, string, order]) => ({ uid: childUid, string, order }))
        .sort((a, b) => a.order - b.order);
}

/** Direct children of a block, in sibling order. */
export function getChildren(uid) {
    if (!uid) return [];

    const pull = resolve(null, 'pull');
    if (pull) {
        try {
            return readChildrenFromPull(pull, uid);
        } catch {
            // Fall through to the proven q path when pull is unavailable or
            // rejected by an older Roam build.
        }
    }

    try {
        return readChildrenFromQuery(uid);
    } catch (error) {
        throw withGraphReadIssue(error, { source: 'children', affectedUid: uid });
    }
}

const DAILY_PAGE_TREE_QUERY = `[:find ?page-uid ?uid ?string ?order ?parent-uid
  :in $ ?page-title
  :where
  [?page :node/title ?page-title]
  [?page :block/uid ?page-uid]
  [?block :block/page ?page]
  [?block :block/uid ?uid]
  [?block :block/string ?string]
  [?block :block/order ?order]
  [?parent :block/children ?block]
  [?parent :block/uid ?parent-uid]]`;

const REFERENCED_BLOCK_STRINGS_QUERY = `[:find ?uid ?string
  :in $ [?uid ...]
  :where
  [?b :block/uid ?uid]
  [?b :block/string ?string]]`;

export const DAILY_NOTE_READ_LIMITS = Object.freeze({
    maxDepth: 24,
    maxNodes: 500,
});

const boundedReadError = message =>
    new GraphReadError(message, {
        issue: graphReadIssue({ source: 'daily-note', message }),
    });

const normalizeBound = (value, fallback) =>
    Number.isInteger(value) && value > 0 ? value : fallback;

const readDailyPageRows = pageTitle =>
    validateQueryRows(
        queryOrThrow(DAILY_PAGE_TREE_QUERY, pageTitle),
        'daily note page tree',
        row =>
            row.length >= 5 &&
            typeof row[0] === 'string' &&
            row[0].length > 0 &&
            typeof row[1] === 'string' &&
            row[1].length > 0 &&
            typeof row[2] === 'string' &&
            Number.isFinite(row[3]) &&
            typeof row[4] === 'string' &&
            row[4].length > 0
    );

const readReferencedBlockStrings = uids => {
    if (uids.length === 0) return {};
    const rows = validateQueryRows(
        queryOrThrow(REFERENCED_BLOCK_STRINGS_QUERY, uids),
        'daily note reference',
        row => row.length >= 2 && typeof row[0] === 'string' && typeof row[1] === 'string'
    );
    return Object.fromEntries(rows.map(([uid, string]) => [uid, string]));
};

/**
 * Read one page's bounded block tree and the strings for its bare references.
 *
 * The page title is an exact Datalog input. One page-scoped query returns the
 * direct-parent edge for every descendant, then the tree is rebuilt in memory
 * with hard depth/node caps. This avoids one Pull/query per nested block.
 * Reference targets are a second, finite lookup because a daily note commonly
 * contains `((uid))` rather than a copied task string. A missing page is a
 * confirmed empty result; an unavailable or malformed read is not.
 */
export function readDailyNoteTree(
    pageTitle,
    { maxDepth = DAILY_NOTE_READ_LIMITS.maxDepth, maxNodes = DAILY_NOTE_READ_LIMITS.maxNodes } = {}
) {
    if (typeof pageTitle !== 'string' || pageTitle.trim() === '') {
        return { ok: false, roots: null, pageUid: null, error: boundedReadError('Daily note title is required.') };
    }

    const depthLimit = normalizeBound(maxDepth, DAILY_NOTE_READ_LIMITS.maxDepth);
    const nodeLimit = normalizeBound(maxNodes, DAILY_NOTE_READ_LIMITS.maxNodes);

    try {
        const rows = readDailyPageRows(pageTitle);
        if (rows.length === 0) {
            return { ok: true, pageUid: null, roots: [], referenceStrings: {} };
        }
        if (rows.length > nodeLimit) {
            throw boundedReadError(
                `Today's Daily Note exceeds the safe ${nodeLimit}-block read limit.`
            );
        }

        const pageUids = new Set(rows.map(row => row[0]));
        if (pageUids.size !== 1) {
            throw boundedReadError('Daily note returned blocks from more than one page.');
        }
        const pageUid = rows[0][0];
        const referencedUids = new Set();
        const nodes = new Map();
        const parentByUid = new Map();
        for (const [, uid, string, order, parentUid] of rows) {
            if (nodes.has(uid)) {
                throw boundedReadError('Daily note returned a duplicate block.');
            }
            nodes.set(uid, { uid, string, order, children: [] });
            parentByUid.set(uid, parentUid);
            const reference = referencedBlockUid(string);
            if (reference) referencedUids.add(reference);
        }

        const rootNodes = [];
        for (const node of nodes.values()) {
            const parentUid = parentByUid.get(node.uid);
            if (parentUid === pageUid) {
                rootNodes.push(node);
                continue;
            }
            const parent = nodes.get(parentUid);
            if (!parent) {
                throw boundedReadError('Daily note returned a block outside its page tree.');
            }
            parent.children.push(node);
        }
        for (const node of nodes.values()) {
            node.children.sort((a, b) => a.order - b.order);
        }
        rootNodes.sort((a, b) => a.order - b.order);

        const visiting = new Set();
        const visited = new Set();
        const validateTree = (node, depth) => {
            if (depth > depthLimit) {
                throw boundedReadError(
                    `Today's Daily Note exceeds the safe ${depthLimit}-level read limit.`
                );
            }
            if (visiting.has(node.uid)) {
                throw boundedReadError('Daily note returned a cyclic block tree.');
            }
            if (visited.has(node.uid)) return;
            visiting.add(node.uid);
            node.children.forEach(child => validateTree(child, depth + 1));
            visiting.delete(node.uid);
            visited.add(node.uid);
        };
        rootNodes.forEach(root => validateTree(root, 0));
        if (visited.size !== nodes.size) {
            throw boundedReadError('Daily note returned an unreachable block tree.');
        }

        const roots = rootNodes;
        let referenceStrings = {};
        try {
            referenceStrings = readReferencedBlockStrings([...referencedUids]);
        } catch (error) {
            throw withGraphReadIssue(error, {
                source: 'daily-note-reference',
                affectedUids: [...referencedUids],
            });
        }
        return { ok: true, pageUid, roots, referenceStrings };
    } catch (error) {
        const wrapped =
            error instanceof GraphReadError
                ? error
                : withGraphReadIssue(error, { source: 'daily-note' });
        return { ok: false, roots: null, pageUid: null, error: wrapped };
    }
}

/**
 * Read today's Daily Notes page as a cacheable, explicitly tri-stated result.
 * `empty` means the page was confirmed absent or contained no blocks; `error`
 * means callers must retain any last successful snapshot instead of clearing it.
 */
export function readTodayTodoSnapshot(date = new Date(), limits = {}) {
    const pageTitle = dateToPageTitle(date);
    const result = readDailyNoteTree(pageTitle, limits);
    if (!result.ok) {
        return {
            ok: false,
            status: 'error',
            pageTitle,
            pageUid: result.pageUid || null,
            roots: null,
            referenceStrings: null,
            error: result.error,
        };
    }
    return {
        ok: true,
        status: result.pageUid && result.roots.length > 0 ? 'success' : 'empty',
        pageTitle,
        pageUid: result.pageUid,
        roots: result.roots,
        referenceStrings: result.referenceStrings || {},
        error: null,
    };
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
const sidebarOperationQueues = new WeakMap();
// A confirmed native window can be fronted without reopening the sidebar or
// asking Roam for the complete window list again. The cache is deliberately
// weakly keyed by the native sidebar object and time-bounded: Roam remains the
// authority, while a recently closed window is recovered through the fallback
// path below instead of being treated as permanently present.
const knownSidebarBlockWindows = new WeakMap();
const SIDEBAR_WINDOW_CACHE_TTL_MS = ACTIVE_WORK_WINDOW_MS;

const sidebarWindowCache = sidebar => {
    let cache = knownSidebarBlockWindows.get(sidebar);
    if (!cache) {
        cache = new Map();
        knownSidebarBlockWindows.set(sidebar, cache);
    }
    return cache;
};

const rememberSidebarWindows = (sidebar, windows) => {
    if (!Array.isArray(windows)) return;
    const cache = sidebarWindowCache(sidebar);
    cache.clear();
    for (const sidebarWindow of windows) {
        const uid = sidebarWindow?.['block-uid'];
        if (sidebarWindow?.type === 'block' && typeof uid === 'string' && uid) {
            cache.set(uid, Date.now());
        }
    }
};

const rememberSidebarWindow = (sidebar, uid) => {
    sidebarWindowCache(sidebar).set(uid, Date.now());
};

const forgetSidebarWindow = (sidebar, uid) => {
    sidebarWindowCache(sidebar).delete(uid);
};

const hasRecentlyKnownSidebarWindow = (sidebar, uid) => {
    const knownAt = sidebarWindowCache(sidebar).get(uid);
    if (!Number.isFinite(knownAt) || Date.now() - knownAt > SIDEBAR_WINDOW_CACHE_TTL_MS) {
        forgetSidebarWindow(sidebar, uid);
        return false;
    }
    return true;
};

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

/** Start the native sidebar open without making reveal/add wait for it. */
const openSidebarForIntent = sidebar => {
    if (typeof sidebar?.open !== 'function') return Promise.resolve();
    try {
        return Promise.resolve(sidebar.open()).catch(error => {
            // A sidebar failure is isolated from the timing mutation. Older
            // Roam builds may still open the sidebar as part of addWindow, so
            // continue with the authoritative reveal/add path after the failed
            // best effort. Catching here also prevents an unhandled rejection
            // when the optimistic native call succeeds first.
            console.debug('[roam-logbook] sidebar open failed', error);
        });
    } catch (error) {
        console.debug('[roam-logbook] sidebar open failed', error);
        return Promise.resolve();
    }
};

/** Serialize native sidebar reads/writes shared by Timing Line fronting and
 * direct task navigation, so a switch cannot race a Shift+Click into a pair
 * of duplicate addWindow calls. */
const runSidebarOperation = (sidebar, operation) => {
    const previous = sidebarOperationQueues.get(sidebar);
    let current;
    if (previous) {
        // One continuation also recovers a rejected predecessor; there is no
        // need for a separate catch reaction before the next native request.
        current = previous.then(operation, operation);
    } else {
        // Start the first native operation in the caller's stack. The old
        // resolved/catch/then chain added two microtasks before even calling
        // Roam's sidebar API, which was visible next to native Shift+Click.
        try {
            current = Promise.resolve(operation());
        } catch (error) {
            current = Promise.reject(error);
        }
    }
    sidebarOperationQueues.set(sidebar, current);
    return current.finally(() => {
        if (sidebarOperationQueues.get(sidebar) === current) {
            sidebarOperationQueues.delete(sidebar);
        }
    });
};

/** Make an already-open block window visible without touching other windows. */
const revealExistingBlockWindow = async (
    sidebar,
    uid,
    { isCurrent = () => true, requireOrder = false, unavailableMessage } = {}
) => {
    let reordered = false;
    if (typeof sidebar.setWindowOrder === 'function') {
        await sidebar.setWindowOrder({ window: blockSidebarWindow(uid, 0) });
        if (!isCurrent()) return { ok: false, skipped: true, reason: 'superseded' };
        reordered = true;
    } else if (requireOrder) {
        return sidebarFailure(
            'order-unavailable',
            unavailableMessage || 'Roam could not move the sidebar block window to the top.'
        );
    }

    if (typeof sidebar.expandWindow === 'function') {
        await sidebar.expandWindow({ window: blockSidebarWindow(uid) });
        if (!isCurrent()) return { ok: false, skipped: true, reason: 'superseded' };
    }

    return { ok: true, reordered };
};

/**
 * Put a block at order 0 in Roam's native right sidebar without changing focus.
 *
 * `isCurrent` lets the UI orchestration layer cancel a superseded intent after
 * asynchronous native reads. This adapter never closes, pins, removes, focuses,
 * or reorders an unrelated window.
 */
export async function frontBlockInRightSidebar(
    uid,
    { isCurrent = () => true, preferExisting = false } = {}
) {
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

    if (!isCurrent()) return { ok: false, skipped: true, reason: 'superseded' };

    // Start the reversible host work before entering the authoritative queue.
    // A rapid newer switch can therefore reveal an existing native window even
    // while an older get/add operation is still unresolved. The queued pass
    // below remains responsible for dedupe and final ordering.
    const hadPendingOperation = sidebarOperationQueues.has(sidebar);
    const recentlyKnown = hasRecentlyKnownSidebarWindow(sidebar, uid);
    const shouldPreview =
        typeof sidebar.setWindowOrder === 'function' &&
        (hadPendingOperation || recentlyKnown || preferExisting);
    const sidebarOpen = openSidebarForIntent(sidebar);
    let previewPromise = null;
    if (shouldPreview) {
        previewPromise = revealExistingBlockWindow(sidebar, uid, {
            isCurrent,
            requireOrder: true,
            unavailableMessage: 'Roam could not move the Timing Line sidebar window to the top.',
        }).catch(error => ({ ok: false, previewFailed: true, error }));
    }

    try {
        return await runSidebarOperation(sidebar, async () => {
            if (!isCurrent()) return { ok: false, skipped: true, reason: 'superseded' };

            const findExisting = windows =>
                Array.isArray(windows)
                    ? windows.find(
                          sidebarWindow =>
                              sidebarWindow?.type === 'block' &&
                              sidebarWindow?.['block-uid'] === uid
                      )
                    : null;

            const revealAuthoritative = async windows => {
                rememberSidebarWindows(sidebar, windows);
                const existing = findExisting(windows);
                if (!existing) return null;
                const visibility = await revealExistingBlockWindow(sidebar, uid, {
                    isCurrent,
                    requireOrder: true,
                    unavailableMessage:
                        'Roam could not move the Timing Line sidebar window to the top.',
                });
                if (visibility.ok === false) return visibility;
                rememberSidebarWindow(sidebar, uid);
                return { ok: true, deduped: true, reordered: visibility.reordered };
            };

            const readAfterOpen = async () => {
                await sidebarOpen;
                if (!isCurrent()) return { ok: false, skipped: true, reason: 'superseded' };
                if (typeof sidebar.getWindows !== 'function') return null;
                return sidebar.getWindows();
            };

            let previewSettled = false;
            let previewResult = null;
            const settlePreview = async () => {
                // Do not race native sidebar work with a timeout. Roam does
                // not expose cancellation here, so advancing the authority
                // queue early could let an older host call reorder the
                // sidebar after the newest intent was reconciled.
                if (!previewSettled && previewPromise) {
                    previewResult = await previewPromise;
                    previewSettled = true;
                }
                return previewResult;
            };

            const revealConfirmedWindow = async windows => {
                const existing = findExisting(windows);
                if (!existing) return null;

                const preview = await settlePreview();
                if (!isCurrent() || preview?.skipped) {
                    return { ok: false, skipped: true, reason: 'superseded' };
                }
                // A successful native preview is the fastest path when no
                // older sidebar operation can still land out of order. When
                // there is older work, fall through to the authoritative
                // reveal below so the newest intent always finishes last.
                if (preview?.ok && !hadPendingOperation) {
                    rememberSidebarWindows(sidebar, windows);
                    rememberSidebarWindow(sidebar, uid);
                    return {
                        ok: true,
                        deduped: true,
                        reordered: preview.reordered,
                    };
                }
                return revealAuthoritative(windows);
            };

            if (!isCurrent()) return { ok: false, skipped: true, reason: 'superseded' };
            if (typeof sidebar.getWindows === 'function') {
                let windows;
                try {
                    // This read intentionally races the sidebar animation. In
                    // Roam builds that reject while closed, the catch below
                    // waits for open and retries once against the real list.
                    windows = await sidebar.getWindows();
                } catch {
                    windows = await readAfterOpen();
                    if (windows?.skipped) return windows;
                }
                if (!isCurrent()) return { ok: false, skipped: true, reason: 'superseded' };
                let revealed;
                try {
                    revealed = await revealConfirmedWindow(windows);
                } catch {
                    // The list can already contain the target while Roam still
                    // rejects the reveal call during its sidebar animation.
                    // Wait only on that failed path, then retry from a fresh
                    // authoritative list instead of falling back to addWindow.
                    const retryWindows = await readAfterOpen();
                    if (retryWindows?.skipped) return retryWindows;
                    if (retryWindows !== null) {
                        revealed = await revealConfirmedWindow(retryWindows);
                    }
                }
                if (revealed) return revealed;

                const preview = await settlePreview();
                if (!isCurrent() || preview?.skipped) {
                    return { ok: false, skipped: true, reason: 'superseded' };
                }
                if (preview?.previewFailed || recentlyKnown) {
                    // A manually closed native window invalidates only the
                    // local hint. The authoritative empty list below decides
                    // whether exactly one replacement should be added.
                    forgetSidebarWindow(sidebar, uid);
                }

                if (preview?.ok) {
                    // A successful preview and an empty list can occur while
                    // Roam is opening. Re-read once after the open barrier
                    // before adding so the preview cannot create a duplicate.
                    const retryWindows = await readAfterOpen();
                    if (retryWindows?.skipped) return retryWindows;
                    if (retryWindows !== null) {
                        const retryRevealed = await revealConfirmedWindow(retryWindows);
                        if (retryRevealed) return retryRevealed;
                    }
                }

                if (!isCurrent()) return { ok: false, skipped: true, reason: 'superseded' };
                try {
                    await sidebar.addWindow({ window: blockSidebarWindow(uid, 0) });
                } catch {
                    // addWindow can lose a race with the sidebar animation even
                    // after getWindows returned an empty list. Re-open is only
                    // a fallback barrier; the second get/reveal/add remains
                    // authoritative and deduped.
                    const retryWindows = await readAfterOpen();
                    if (retryWindows?.skipped) return retryWindows;
                    if (retryWindows !== null) {
                        const retryRevealed = await revealAuthoritative(retryWindows);
                        if (retryRevealed) return retryRevealed;
                    }
                    if (!isCurrent()) return { ok: false, skipped: true, reason: 'superseded' };
                    await sidebar.addWindow({ window: blockSidebarWindow(uid, 0) });
                }
                rememberSidebarWindow(sidebar, uid);
                if (!isCurrent()) return { ok: false, skipped: true, reason: 'superseded' };
                return { ok: true, added: true };
            }

            // Older Roam builds have no authoritative window list. Reuse the
            // existing best-effort dedupe marker and include order 0 on first
            // open. Settle the preview before completing this queued pass: a
            // newer queued intent can then perform the final reveal/add after
            // any stale native side effect has landed.
            const preview = await settlePreview();
            if (!isCurrent() || preview?.skipped) {
                return { ok: false, skipped: true, reason: 'superseded' };
            }
            let requested = requestedSidebarBlocks.get(sidebar);
            if (!requested) {
                requested = new Set();
                requestedSidebarBlocks.set(sidebar, requested);
            }
            const wasRequested = requested.has(uid);
            if (preview?.ok) {
                if (hadPendingOperation) {
                    const visibility = await revealExistingBlockWindow(sidebar, uid, {
                        isCurrent,
                        requireOrder: true,
                        unavailableMessage:
                            'Roam could not move the Timing Line sidebar window to the top.',
                    });
                    if (visibility.ok === false) return visibility;
                    requested.add(uid);
                    rememberSidebarWindow(sidebar, uid);
                    return {
                        ok: true,
                        deduped: true,
                        reordered: visibility.reordered,
                    };
                }
                // Legacy Roam cannot provide an authoritative list. A
                // successful native reveal is the strongest available proof
                // that the window survived a reload, so retain the dedupe
                // marker instead of adding a duplicate.
                requested.add(uid);
                rememberSidebarWindow(sidebar, uid);
                return { ok: true, deduped: true, reordered: preview.reordered === true };
            }
            if (preview?.previewFailed && wasRequested) {
                // A previously requested legacy window may have been closed
                // manually. A failed reveal invalidates only that local hint;
                // addWindow below recreates it once.
                requested.delete(uid);
                forgetSidebarWindow(sidebar, uid);
            } else if (wasRequested) {
                return { ok: true, deduped: true };
            }
            if (!isCurrent()) return { ok: false, skipped: true, reason: 'superseded' };

            try {
                await sidebar.addWindow({ window: blockSidebarWindow(uid, 0) });
                requested.add(uid);
                rememberSidebarWindow(sidebar, uid);
                if (!isCurrent()) return { ok: false, skipped: true, reason: 'superseded' };
            } catch (error) {
                requested.delete(uid);
                forgetSidebarWindow(sidebar, uid);
                await sidebarOpen;
                if (!isCurrent()) return { ok: false, skipped: true, reason: 'superseded' };
                try {
                    await sidebar.addWindow({ window: blockSidebarWindow(uid, 0) });
                    requested.add(uid);
                    rememberSidebarWindow(sidebar, uid);
                    if (!isCurrent()) return { ok: false, skipped: true, reason: 'superseded' };
                } catch {
                    throw error;
                }
            }
            return { ok: true, added: true };
        });
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
        return await runSidebarOperation(sidebar, async () => {
            await sidebar.open?.();

            // Prefer Roam's own window list whenever the API exposes it. Roam is
            // authoritative here: a user can close a sidebar window outside this
            // extension, so an extension-local Set is not allowed to suppress a
            // later request when the block is no longer genuinely open.
            if (typeof sidebar.getWindows === 'function') {
                const windows = await sidebar.getWindows();
                const existing = Array.isArray(windows)
                    ? windows.some(
                          window =>
                              window?.type === 'block' && window?.['block-uid'] === uid
                      )
                    : false;
                if (existing) {
                    const visibility = await revealExistingBlockWindow(sidebar, uid);
                    if (visibility.ok === false) return visibility;
                    return {
                        ok: true,
                        deduped: true,
                        ...(visibility.reordered ? { reordered: true } : {}),
                    };
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
        });
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
