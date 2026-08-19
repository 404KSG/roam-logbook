const FORWARD_PATTERN = /\b(forward|arrow-right|chevron-right)\b/i;
const BACK_PATTERN = /\b(back|arrow-left|chevron-left)\b/i;
const MENU_PATTERN = /\b(menu|left-sidebar|navigation)\b/i;
const MAIN_CONTROL_PATTERN = /\b(find-or-create|search|topbar(?:__|-)?(?:main|right))\b/i;

/** Classes and accessible metadata are more stable than one Roam class name. */
export const controlSignals = element =>
    [
        element.className,
        element.getAttribute?.('data-icon'),
        element.getAttribute?.('aria-label'),
        element.getAttribute?.('title'),
        element.getAttribute?.('data-name'),
    ]
        .filter(value => typeof value === 'string')
        .join(' ')
        .replaceAll('_', '-')
        .toLowerCase();

export const isMainControl = element =>
    element.matches?.('input, textarea, select, [contenteditable="true"]') ||
    MAIN_CONTROL_PATTERN.test(controlSignals(element));

export const containsMainControl = element =>
    isMainControl(element) ||
    Boolean(
        element.querySelector?.('input, textarea, select, [contenteditable="true"]') ||
            [...(element.querySelectorAll?.('*') || [])].some(isMainControl)
    );

/** Climb through icon/button wrappers, but stop before the main/right shell. */
export const navigationCluster = (signal, topbar) => {
    let anchor = signal.closest?.('button, a, [role="button"]') || signal;
    while (
        anchor.parentElement &&
        anchor.parentElement !== topbar &&
        ![...anchor.parentElement.querySelectorAll('*')].some(isMainControl)
    ) {
        anchor = anchor.parentElement;
    }
    return anchor;
};

/** Resolve a nested search/main signal to the sibling owned by its layout surface. */
export const surfaceChild = (signal, topbar) => {
    let boundary = signal;
    while (
        boundary.parentElement &&
        boundary.parentElement !== topbar &&
        !boundary.previousElementSibling
    ) {
        boundary = boundary.parentElement;
    }
    return boundary;
};

/**
 * The node to insert before, so the widget lands just past the navigation.
 *
 * Roam currently nests Back/Forward inside a left-navigation wrapper, but
 * older layouts expose the buttons directly. Search by observable control
 * signals, then resolve the match back to the smallest navigation cluster
 * whose parent also owns the main controls.
 */
export const afterNavigation = (topbar, { container = null } = {}) => {
    const descendants = [...topbar.querySelectorAll('*')].filter(
        node => node !== container && !container?.contains(node)
    );
    const mainIndex = descendants.findIndex(isMainControl);
    const leading = mainIndex >= 0 ? descendants.slice(0, mainIndex) : descendants;
    const signal =
        leading.find(node => FORWARD_PATTERN.test(controlSignals(node))) ||
        leading.find(node => BACK_PATTERN.test(controlSignals(node))) ||
        leading.find(node => MENU_PATTERN.test(controlSignals(node)));

    if (signal) {
        const anchor = navigationCluster(signal, topbar);
        const next = anchor.nextSibling;
        return {
            parent: anchor.parentNode,
            before: next === container ? container.nextSibling : next,
        };
    }

    // Unknown layouts still stay on the left. Prefer the first recognisable
    // main/search surface; if none exists, preserve the leading control and
    // insert after it rather than falling through to the far-right actions.
    const main = descendants.find(isMainControl);
    if (main) {
        const boundary = surfaceChild(main, topbar);
        return { parent: boundary.parentNode, before: boundary };
    }

    let surface = topbar;
    while (
        surface.children.length === 1 &&
        surface.firstElementChild !== container &&
        surface.firstElementChild.children.length > 0
    ) {
        surface = surface.firstElementChild;
    }
    return { parent: surface, before: surface.firstElementChild?.nextSibling ?? null };
};

const restoreLayoutHostDisplay = (host, layoutHostDisplay) => {
    const previous = layoutHostDisplay.get(host);
    if (!previous || !host?.style) return;
    if (previous.value) host.style.setProperty('display', previous.value, previous.priority);
    else host.style.removeProperty('display');
    layoutHostDisplay.delete(host);
};

const clearLayoutHost = (host, layoutHostDisplay) => {
    host.classList.remove('rlb-topbar__layout');
    restoreLayoutHostDisplay(host, layoutHostDisplay);
};

const ensureLayoutHostDisplay = (host, layoutHostDisplay, documentRef) => {
    if (!host?.style) return;
    let display = '';
    try {
        display = documentRef.defaultView?.getComputedStyle?.(host)?.display || '';
    } catch {
        // Fall back to the inline write when an embedded host has no style view.
    }
    if (display === 'flex') return;
    if (!layoutHostDisplay.has(host)) {
        layoutHostDisplay.set(host, {
            value: host.style.getPropertyValue('display'),
            priority: host.style.getPropertyPriority('display'),
        });
    }
    host.style.setProperty('display', 'flex');
};

export const syncTopbarLayout = (
    placement,
    {
        container = null,
        layoutHosts = new Set(),
        searchHosts = new Set(),
        layoutHostDisplay = new Map(),
        documentRef = document,
    } = {}
) => {
    for (const host of layoutHosts) clearLayoutHost(host, layoutHostDisplay);
    for (const host of searchHosts) host.classList.remove('rlb-topbar__search');
    layoutHosts.clear();
    searchHosts.clear();

    const host = placement.parent;
    if (!host?.classList) return;
    host.classList.add('rlb-topbar__layout');
    ensureLayoutHostDisplay(host, layoutHostDisplay, documentRef);
    layoutHosts.add(host);
    for (const child of host.children) {
        if (child === container || !containsMainControl(child)) continue;
        child.classList.add('rlb-topbar__search');
        searchHosts.add(child);
        break;
    }
};
