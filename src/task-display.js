/**
 * Display-only task title formatting shared by Active Work and Dashboard.
 *
 * The canonical org-mode taskTitle() remains the normalized/reporting title.
 * This boundary is deliberately more faithful to Roam's writing surface: page
 * references and tags stay visible, while task macros and presentation markup
 * stay out of the UI label.
 */

const TASK_MARKER_RE = /\{\{\[\[(?:TODO|DONE)\]\]\}\}|\{\{(?:TODO|DONE)\}\}/gi;

const stripRoamMacros = string => {
    let cleaned = '';
    let depth = 0;
    for (let index = 0; index < string.length; index += 1) {
        const pair = string.slice(index, index + 2);
        if (pair === '{{') {
            depth += 1;
            index += 1;
            continue;
        }
        if (pair === '}}' && depth > 0) {
            depth -= 1;
            index += 1;
            continue;
        }
        if (depth === 0) cleaned += string[index];
    }
    return cleaned;
};

/** Format a raw Roam task string for visible navigation surfaces. */
export function formatDisplayTitle({ taskString, title, taskUid } = {}) {
    const fallback = String(title || taskUid || '(untitled)').trim() || '(untitled)';
    if (typeof taskString !== 'string' || taskString.trim() === '') return fallback;

    const cleaned = stripRoamMacros(taskString.replace(TASK_MARKER_RE, ''))
        .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/\(\([a-zA-Z0-9_-]{6,}\)\)/g, '')
        .replace(/\^\^|\*\*|__|~~/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    return cleaned || fallback;
}
