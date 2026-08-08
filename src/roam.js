/**
 * Thin wrapper around `window.roamAlphaAPI`.
 *
 * Every helper degrades to `null` / `[]` when the API (or a namespace within it)
 * is missing, so callers never have to guard, and the module stays importable in
 * a plain Node test process.
 */

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

/** Run a datalog query, letting failures surface to the caller. */
export function queryOrThrow(datalog, ...args) {
    const run = resolve(null, 'q');
    if (!run) throw new Error('roamAlphaAPI q unavailable');
    return run(datalog, ...args) || [];
}

/** Run a datalog query. Returns `[]` rather than throwing on a bad graph state. */
export function query(datalog, ...args) {
    try {
        return queryOrThrow(datalog, ...args);
    } catch (error) {
        console.error('[roam-logbook] query failed', error);
        return [];
    }
}

export function getBlockString(uid) {
    if (!uid) return null;
    const rows = query(
        '[:find ?s :in $ ?uid :where [?b :block/uid ?uid] [?b :block/string ?s]]',
        uid
    );
    return rows[0]?.[0] ?? null;
}

/** Direct children of a block, in sibling order. */
export function getChildren(uid) {
    if (!uid) return [];
    const rows = query(
        `[:find ?uid ?string ?order
          :in $ ?parent
          :where
          [?p :block/uid ?parent]
          [?p :block/children ?c]
          [?c :block/uid ?uid]
          [?c :block/string ?string]
          [?c :block/order ?order]]`,
        uid
    );
    return rows
        .map(([childUid, string, order]) => ({ uid: childUid, string, order }))
        .sort((a, b) => a.order - b.order);
}

export function getPageTitleOfBlock(uid) {
    if (!uid) return null;
    const rows = query(
        `[:find ?title :in $ ?uid
          :where [?b :block/uid ?uid] [?b :block/page ?p] [?p :node/title ?title]]`,
        uid
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
