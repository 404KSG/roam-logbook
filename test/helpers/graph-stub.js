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

    for (const block of blocks) {
        store.set(block.uid, {
            uid: block.uid,
            string: block.string,
            parent: block.parent ?? null,
            page: block.page ?? 'Test Page',
        });
    }

    const childrenOf = uid =>
        [...store.values()]
            .filter(block => block.parent === uid)
            .sort((a, b) => a.order - b.order);

    // Order is implicit in insertion for seeds; explicit once blocks are created.
    let order = 0;
    for (const block of store.values()) block.order = order++;

    const q = (datalog, ...args) => {
        if (datalog.includes('LOGBOOK:')) {
            const rows = [];
            for (const drawer of store.values()) {
                if (!drawer.string.includes('LOGBOOK:')) continue;
                const task = drawer.parent ? store.get(drawer.parent) : null;
                if (!task) continue;
                for (const child of childrenOf(drawer.uid)) {
                    rows.push([child.uid, child.string, drawer.string, task.uid, task.string, task.page]);
                }
            }
            return rows;
        }
        if (datalog.includes(':find ?title')) {
            const block = store.get(args[0]);
            return block ? [[block.page]] : [];
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
            block: {
                create: async ({ location, block }) => {
                    store.set(block.uid, {
                        uid: block.uid,
                        string: block.string,
                        parent: location['parent-uid'],
                        order: location.order,
                        page: store.get(location['parent-uid'])?.page ?? 'Test Page',
                    });
                },
                update: async ({ block }) => {
                    const existing = store.get(block.uid);
                    if (existing) existing.string = block.string;
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

    return { store, childrenOf, api };
}

export function uninstallGraph() {
    delete globalThis.window;
}
