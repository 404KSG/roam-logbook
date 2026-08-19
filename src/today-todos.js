/**
 * Pure model for the Today task pool.
 *
 * The graph adapter returns the Daily Notes page as a bounded physical tree.
 * This module deliberately knows nothing about Roam or the timer: it turns
 * that tree into the visible unfinished-TODO hierarchy used by the popover.
 */

import { isTaskBlock, referencedBlockUid, taskStatus } from './org.js';

const ordinal = day => {
    const mod100 = day % 100;
    if (mod100 >= 11 && mod100 <= 13) return `${day}th`;
    if (day % 10 === 1) return `${day}st`;
    if (day % 10 === 2) return `${day}nd`;
    if (day % 10 === 3) return `${day}rd`;
    return `${day}th`;
};

/** Roam's English Daily Notes title for a local calendar date. */
export function dateToPageTitle(date = new Date()) {
    const value = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(value.getTime())) return '';
    return `${value.toLocaleString('en-US', { month: 'long' })} ${ordinal(value.getDate())}, ${value.getFullYear()}`;
}

const isNode = value => value && typeof value === 'object' && typeof value.uid === 'string';

const makeVisibleNode = ({ uid, string, sourceUid = uid, orderPath = [] }) => ({
    uid,
    string: typeof string === 'string' ? string : '',
    sourceUid,
    status: 'TODO',
    orderPath: [...orderPath],
    children: [],
});

const countDescendants = node =>
    node.children.reduce((total, child) => total + 1 + countDescendants(child), 0);

const appendTo = (parent, node, roots) => {
    if (parent) parent.children.push(node);
    else roots.push(node);
};

/**
 * Build a visible task forest.
 *
 * Plain blocks and DONE blocks are structural only. A bare reference whose
 * target is an unfinished TODO is a structural alias for that target, so its
 * children are nested below the referenced task rather than below the mirror.
 * The first physical occurrence wins when a reference target is encountered
 * more than once; the source occurrence still contributes its descendants.
 */
export function buildTodayTodoTree(roots = [], { referenceStrings = {} } = {}) {
    const outputRoots = [];
    const visibleByUid = new Map();
    const parentByUid = new Map();
    const occurrences = new Set();

    const addVisible = ({ uid, string, sourceUid = uid, orderPath, parent }) => {
        let visible = visibleByUid.get(uid);
        if (!visible) {
            visible = makeVisibleNode({ uid, string, sourceUid, orderPath });
            visibleByUid.set(uid, visible);
            parentByUid.set(uid, parent?.uid || null);
            appendTo(parent, visible, outputRoots);
        }
        return visible;
    };

    const walk = (node, nearestVisible, orderPath) => {
        if (!isNode(node) || occurrences.has(node.uid)) return;
        occurrences.add(node.uid);

        const rawString = typeof node.string === 'string' ? node.string : '';
        const status = taskStatus(rawString);
        const referenceUid = referencedBlockUid(rawString);
        let nextParent = nearestVisible;

        // A pure reference is a context block. Resolve only its target string;
        // unresolved references remain structural and cannot invent a task.
        if (referenceUid) {
            const referencedString = referenceStrings?.[referenceUid];
            if (typeof referencedString === 'string' && taskStatus(referencedString) === 'TODO') {
                nextParent = addVisible({
                    uid: referenceUid,
                    string: referencedString,
                    sourceUid: node.uid,
                    orderPath,
                    parent: nearestVisible,
                });
            }
        } else if (status === 'TODO') {
            nextParent = addVisible({
                uid: node.uid,
                string: rawString,
                orderPath,
                parent: nearestVisible,
            });
        }

        const children = Array.isArray(node.children) ? node.children : [];
        children
            .slice()
            .sort((a, b) => Number(a?.order ?? 0) - Number(b?.order ?? 0))
            .forEach((child, index) => walk(child, nextParent, [...orderPath, index]));
    };

    roots
        .slice()
        .sort((a, b) => Number(a?.order ?? 0) - Number(b?.order ?? 0))
        .forEach((root, index) => walk(root, null, [index]));

    const all = [...visibleByUid.values()];
    for (const node of all) {
        node.hiddenDescendantCount = countDescendants(node);
        node.hasChildren = node.children.length > 0;
    }
    return {
        roots: outputRoots,
        nodes: all,
        count: all.length,
        parentByUid,
    };
}

export function currentTodayPath(model, taskUid) {
    if (!model || typeof taskUid !== 'string' || !model.nodes?.some(node => node.uid === taskUid)) {
        return new Set();
    }
    const path = new Set();
    const seen = new Set();
    let current = taskUid;
    while (current && !seen.has(current)) {
        seen.add(current);
        path.add(current);
        current = model.parentByUid?.get(current) || null;
    }
    return path;
}

const walkVisible = (nodes, rows, expanded, forcedPath, depth = 0) => {
    for (const node of nodes || []) {
        const forced = forcedPath?.has(node.uid);
        const isExpanded = node.children.length > 0 && (forced || expanded?.has(node.uid));
        rows.push({ node, depth, expanded: isExpanded, hiddenDescendantCount: node.hiddenDescendantCount });
        if (isExpanded) walkVisible(node.children, rows, expanded, forcedPath, depth + 1);
    }
    return rows;
};

/** Return the rows visible under the current collapse state. */
export function flattenTodayRows(model, { expanded = new Set(), currentPath = new Set() } = {}) {
    if (!model) return [];
    return walkVisible(model.roots, [], expanded, currentPath);
}

export const todayTodoStatus = string => (isTaskBlock(string) ? taskStatus(string) : null);
