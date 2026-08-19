/**
 * An in-memory stand-in for `window.roamAlphaAPI`.
 *
 * It does not run datalog — it recognises the handful of queries `src/roam.js`
 * issues by their shape and answers them from a plain block map. That is enough
 * to exercise the real clock logic (drawer creation, ordering, reference
 * resolution) without a browser or a graph.
 */

let nextUid = 0;

export function installGraph(blocks = []) {
    nextUid = 0;
    const store = new Map();
    const pullWatches = new Map();
    const pullCalls = { pull: 0, pullMany: 0, fastQ: 0 };

    const nextOrderByParent = new Map();
    for (const block of blocks) {
        const parent = block.parent ?? null;
        const nextOrder = nextOrderByParent.get(parent) || 0;
        const blockOrder = Number.isFinite(block.order) ? block.order : nextOrder;
        store.set(block.uid, {
            uid: block.uid,
            string: block.string,
            parent,
            order: blockOrder,
            open: block.open === undefined ? true : block.open,
            page: block.page === undefined ? 'Test Page' : block.page,
        });
        nextOrderByParent.set(parent, Math.max(nextOrder, blockOrder + 1));
    }

    const childrenOf = uid =>
        [...store.values()]
            .filter(block => block.parent === uid)
            .sort((a, b) => a.order - b.order);

    const uidFromEntity = entity => {
        if (Array.isArray(entity)) return entity[1];
        const match = String(entity).match(/\[:block\/uid\s+"([^"]+)"\]/);
        return match?.[1] || null;
    };

    const pull = (pattern, entity) => {
        pullCalls.pull += 1;
        const block = store.get(uidFromEntity(entity));
        if (!block) return null;
        const result = {};
        if (pattern.includes(':block/uid')) result[':block/uid'] = block.uid;
        if (pattern.includes(':block/string')) result[':block/string'] = block.string;
        if (pattern.includes(':block/order')) result[':block/order'] = block.order;
        if (pattern.includes(':block/children')) {
            result[':block/children'] = childrenOf(block.uid).map(child => ({
                ':block/uid': child.uid,
                ':block/string': child.string,
                ':block/order': child.order,
            }));
        }
        return result;
    };

    const pullMany = (pattern, entities) => {
        pullCalls.pullMany += 1;
        return entities.map(entity => pull(pattern, entity));
    };

    const q = (datalog, ...args) => {
        if (
            datalog.includes(':find ?clock-uid ?clock-string') &&
            datalog.includes(':in $ [?drawer-string ...]') &&
            datalog.includes('[?d :block/string ?drawer-string]')
        ) {
            const wanted = new Set(Array.isArray(args[0]) ? args[0] : []);
            const rows = [];
            for (const drawer of store.values()) {
                if (!wanted.has(drawer.string)) continue;
                const task = drawer.parent ? store.get(drawer.parent) : null;
                if (!task) continue;
                for (const child of childrenOf(drawer.uid)) {
                    rows.push([child.uid, child.string, drawer.string, task.uid, task.string, task.page]);
                }
            }
            return rows;
        }
        if (datalog.includes(':find ?uid ?string') && datalog.includes(':in $ [?uid ...]')) {
            const wanted = new Set(args[0]);
            return [...store.values()]
                .filter(block => wanted.has(block.uid) && typeof block.string === 'string')
                .map(block => [block.uid, block.string]);
        }
        if (datalog.includes(':find ?uid ?parent-uid')) {
            const wanted = new Set(args[0]);
            return [...store.values()]
                .filter(block => wanted.has(block.uid) && block.parent && store.has(block.parent))
                .map(block => [block.uid, block.parent, store.get(block.parent).string]);
        }
        if (datalog.includes(':find ?target-uid ?mirror-uid')) {
            // Stands in for `:block/refs`: any block whose text mentions ((uid)).
            const wanted = new Set(args[0]);
            const rows = [];
            for (const block of store.values()) {
                if (typeof block.string !== 'string') continue;
                for (const [, refUid] of block.string.matchAll(/\(\(([a-zA-Z0-9_-]+)\)\)/g)) {
                    if (wanted.has(refUid)) rows.push([refUid, block.uid, block.string]);
                }
            }
            return rows;
        }
        if (datalog.includes(':find ?uid ?string ?order')) {
            return childrenOf(args[0]).map(block => [block.uid, block.string, block.order]);
        }
        if (datalog.includes(':find ?s')) {
            const block = store.get(args[0]);
            return block ? [[block.string]] : [];
        }
        throw new Error(`graph-stub: unrecognised query ${datalog}`);
    };

    const api = {
        util: { generateUID: () => `uid${++nextUid}` },
        data: {
            q,
            fast: {
                q: (...args) => {
                    pullCalls.fastQ += 1;
                    return api.data.q(...args);
                },
            },
            pull,
            pull_many: pullMany,
            addPullWatch: (pattern, entity, callback) => {
                const match = String(entity).match(/\[:block\/uid\s+"([^"]+)"\]/);
                if (!match) throw new Error(`graph-stub: unsupported pull-watch entity ${entity}`);
                const uid = match[1];
                const watchers = pullWatches.get(uid) || new Set();
                watchers.add(callback);
                pullWatches.set(uid, watchers);
            },
            removePullWatch: (pattern, entity, callback) => {
                const match = String(entity).match(/\[:block\/uid\s+"([^"]+)"\]/);
                if (!match) throw new Error(`graph-stub: unsupported pull-watch entity ${entity}`);
                const uid = match[1];
                const watchers = pullWatches.get(uid);
                watchers?.delete(callback);
                if (watchers?.size === 0) pullWatches.delete(uid);
            },
            block: {
                create: async ({ location, block }) => {
                    const siblings = [...store.values()].filter(
                        existing => existing.parent === location['parent-uid']
                    );
                    const requestedOrder = Number.isFinite(location.order)
                        ? Math.max(0, Math.min(location.order, siblings.length))
                        : siblings.length;
                    for (const sibling of siblings) {
                        if (sibling.order >= requestedOrder) sibling.order += 1;
                    }
                    store.set(block.uid, {
                        uid: block.uid,
                        string: block.string,
                        parent: location['parent-uid'],
                        order: requestedOrder,
                        open: block.open === undefined ? true : block.open,
                        page: store.get(location['parent-uid'])?.page ?? 'Test Page',
                    });
                },
                update: async ({ block }) => {
                    const existing = store.get(block.uid);
                    if (!existing) return;
                    const before = { ':block/string': existing.string };
                    existing.string = block.string;
                    const after = { ':block/string': block.string };
                    for (const callback of [...(pullWatches.get(block.uid) || [])]) {
                        callback(before, after);
                    }
                },
                delete: async ({ block }) => {
                    for (const child of childrenOf(block.uid)) store.delete(child.uid);
                    store.delete(block.uid);
                },
            },
        },
        ui: {
            getFocusedBlock: () => null,
            mainWindow: { openBlock: async () => {} },
        },
    };

    // Attach to a real window when one exists (the jsdom lifecycle test) so its
    // event and layout APIs stay available; otherwise stand in for it.
    if (globalThis.window) globalThis.window.roamAlphaAPI = api;
    else globalThis.window = { roamAlphaAPI: api };

    return {
        store,
        childrenOf,
        api,
        pullWatchCount: () => [...pullWatches.values()].reduce((count, watchers) => count + watchers.size, 0),
        pullWatchUids: () => [...pullWatches.keys()],
        pullCount: () => pullCalls.pull,
        pullManyCount: () => pullCalls.pullMany,
        fastQueryCount: () => pullCalls.fastQ,
    };
}

export function uninstallGraph() {
    delete globalThis.window;
}
