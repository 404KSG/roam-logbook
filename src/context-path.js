/**
 * Context paths are display/navigation metadata, not task hierarchy.
 *
 * `ancestorPath` belongs to the Today task forest and deliberately contains
 * only visible TODO parents. A context path instead contains every confirmed
 * block ancestor between a task and its enclosing page. The graph adapter
 * stops parent walks at the page because pages do not have :block/string.
 */

const isUid = value => typeof value === 'string' && value.length > 0;

const cleanSegment = segment => {
    if (!segment || typeof segment !== 'object') return null;
    const uid = segment.uid;
    const string = segment.string;
    if (!isUid(uid) || typeof string !== 'string') return null;
    return {
        uid,
        string,
        ...(isUid(segment.sourceUid) ? { sourceUid: segment.sourceUid } : {}),
    };
};

/** Build one root-to-nearest-parent path from a confirmed hierarchy snapshot. */
export function contextPathFromHierarchy(taskUid, hierarchy = {}) {
    if (!isUid(taskUid)) return [];
    const parentOf = hierarchy?.physicalParentOf || hierarchy?.parentOf || {};
    const stringOf = hierarchy?.physicalStringOf || hierarchy?.stringOf || {};
    const canonicalUidOf = hierarchy?.canonicalUidOf || {};
    const canonicalStringOf = hierarchy?.canonicalStringOf || {};
    const path = [];
    const seen = new Set([taskUid]);
    let current = parentOf[taskUid] || null;

    while (isUid(current) && !seen.has(current)) {
        seen.add(current);
        const canonicalUid = canonicalUidOf[current] || current;
        const segment = cleanSegment({
            uid: canonicalUid,
            string: canonicalStringOf[current] ?? stringOf[current],
            ...(canonicalUid !== current ? { sourceUid: current } : {}),
        });
        if (segment) path.unshift(segment);
        current = parentOf[current] || null;
    }
    return path;
}

/** Build paths for a batch of task UIDs at one graph snapshot boundary. */
export function contextPathsFromHierarchy(taskUids = [], hierarchy = {}) {
    const paths = new Map();
    for (const taskUid of new Set(Array.isArray(taskUids) ? taskUids : [])) {
        if (!isUid(taskUid)) continue;
        paths.set(taskUid, contextPathFromHierarchy(taskUid, hierarchy));
    }
    return paths;
}

/** Normalize an already-derived path without mutating its source snapshot. */
export function normalizeContextPath(path = []) {
    return (Array.isArray(path) ? path : []).map(cleanSegment).filter(Boolean);
}
