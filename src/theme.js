/**
 * Read Roam's own theme signals without importing a theme-specific palette.
 *
 * The extension renders its popover on <body>, outside Roam's page-ref CSS
 * inheritance chain. These helpers deliberately sample a real Roam page ref
 * (or a hidden, non-layout probe hosted in Roam's document) and then copy only
 * the resulting values onto extension roots.
 */

export const LIGHT_PAGE_LINK = '#316a9f';
export const DARK_PAGE_LINK = '#7eb7d5';
export const LIGHT_SYNC_GREEN = '#7eb794';
export const DARK_SYNC_GREEN = '#8ed0aa';

const PLUGIN_ROOT_SELECTOR =
    '.rlb-root, .rlb-popover, #roam-logbook-topbar, [data-roam-logbook]';
const PAGE_REF_SELECTORS = [
    '.rm-page-ref--link',
    '.rm-page-ref-link-color',
    '.rm-page-ref',
];
const TOPBAR_SELECTOR = '.rm-topbar';
const THEME_ROOT_ATTRIBUTES = new Set(['class', 'style', 'data-theme']);
const SYNC_ATTRIBUTES = [
    'class',
    'style',
    'aria-label',
    'title',
    'data-state',
    'data-status',
];
const SYNC_STATUS_PATTERN = /saving|saved|sync|synced|synchroniz/i;
const SYNC_GEOMETRY_LIMIT = 200;
const CUSTOM_LINK_PROPERTIES = [
    '--page-link-color',
    '--page-links',
    '--page-reference-color',
    '--page-ref-color',
    '--link-color',
    '--roam-link-color',
    '--rm-page-ref-link-color',
];

const getWindow = (documentRef, windowRef) =>
    windowRef || documentRef?.defaultView || (typeof window !== 'undefined' ? window : null);

const computedStyle = (documentRef, node, pseudo) => {
    const view = getWindow(documentRef);
    try {
        return view?.getComputedStyle?.(node, pseudo) || null;
    } catch {
        return null;
    }
};

const normalized = value => (typeof value === 'string' ? value.trim() : '');

const isUsableColor = value => {
    const color = normalized(value).toLowerCase();
    return Boolean(
        color &&
            color !== 'transparent' &&
            color !== 'currentcolor' &&
            color !== 'inherit' &&
            color !== 'initial' &&
            color !== 'unset' &&
            color !== 'none'
    );
};

const isBrowserDefaultTextColor = value => {
    const color = normalized(value).toLowerCase().replaceAll(' ', '');
    return color === '#000' || color === '#000000' || color === 'rgb(0,0,0)';
};

const isPluginNode = node => Boolean(node?.closest?.(PLUGIN_ROOT_SELECTOR));

const isTagOrNamespaceRef = node => {
    if (!node?.classList) return false;
    const classes = [...node.classList].join(' ').toLowerCase();
    if (/(^|[-_\s])(tag|namespace)([-_\s]|$)/.test(classes)) return true;
    const pageRefType = normalized(node.getAttribute?.('data-page-ref-type')) ||
        normalized(node.getAttribute?.('data-ref-type'));
    if (/^(tag|namespace)$/i.test(pageRefType)) return true;
    return Boolean(
        node.hasAttribute?.('data-tag') ||
            node.hasAttribute?.('data-namespace') ||
            node.hasAttribute?.('data-page-ref-tag') ||
            node.hasAttribute?.('data-page-ref-namespace')
    );
};

const isVisibleRealNode = (documentRef, node) => {
    if (!node?.isConnected || isPluginNode(node) || isTagOrNamespaceRef(node)) return false;
    if (node.getAttribute?.('aria-hidden') === 'true') return false;
    const style = computedStyle(documentRef, node);
    if (!style) return true;
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return false;
    }
    return true;
};

const computedColor = (documentRef, node) => {
    const style = computedStyle(documentRef, node);
    const color = normalized(style?.color);
    return isUsableColor(color) ? color : null;
};

const firstHost = documentRef => {
    // Roam's page/block surfaces may be React-owned. The body is outside those
    // managed roots and is safe for a short-lived, hidden probe.
    return documentRef?.body || documentRef?.documentElement || null;
};

const themeSignature = documentRef => {
    const root = documentRef?.documentElement;
    const body = documentRef?.body;
    return [
        root?.getAttribute?.('class'),
        root?.getAttribute?.('style'),
        root?.getAttribute?.('data-theme'),
        body?.getAttribute?.('class'),
        body?.getAttribute?.('style'),
        body?.getAttribute?.('data-theme'),
    ]
        .map(value => normalized(value))
        .join('\u001f');
};

const probePaletteByDocument = new WeakMap();

const findVisiblePageRef = documentRef => {
    for (const selector of PAGE_REF_SELECTORS) {
        for (const node of documentRef?.querySelectorAll?.(selector) || []) {
            if (!isVisibleRealNode(documentRef, node)) continue;
            const color = computedColor(documentRef, node);
            if (color) return { color, source: 'visible' };
        }
    }
    return null;
};

const readCustomLinkColor = (documentRef, host) => {
    const nodes = [];
    const seen = new Set();
    for (let node = host; node; node = node.parentElement) {
        if (seen.has(node)) break;
        seen.add(node);
        nodes.push(node);
    }
    for (const node of [documentRef?.body, documentRef?.documentElement]) {
        if (node && !seen.has(node)) {
            seen.add(node);
            nodes.push(node);
        }
    }
    for (const node of nodes) {
        const style = computedStyle(documentRef, node);
        for (const property of CUSTOM_LINK_PROPERTIES) {
            const value = normalized(style?.getPropertyValue?.(property));
            if (isUsableColor(value)) return { color: value, source: 'custom-property' };
        }
    }
    return null;
};

const isDarkTheme = documentRef => {
    const root = documentRef?.documentElement;
    const body = documentRef?.body;
    const classDark = Boolean(
        root?.classList?.contains('bp3-dark') ||
            body?.classList?.contains('bp3-dark') ||
            root?.classList?.contains('dark') ||
            body?.classList?.contains('dark')
    );
    if (classDark) return true;
    return Boolean(getWindow(documentRef)?.matchMedia?.('(prefers-color-scheme: dark)')?.matches);
};

/**
 * Resolve the page-reference color used by the current Roam document.
 * The hidden probe uses visibility:hidden and a fixed offscreen position, so
 * it cannot flash or contribute layout while still receiving Roam's CSS.
 */
export function readRoamPageLinkPalette(documentRef = document) {
    const visible = findVisiblePageRef(documentRef);
    if (visible) return { color: visible.color, hoverColor: visible.color, source: visible.source };

    const host = firstHost(documentRef);
    const signature = themeSignature(documentRef);
    const cachedProbe = probePaletteByDocument.get(documentRef);
    let probeColor = null;
    if (cachedProbe?.signature === signature) {
        probeColor = cachedProbe.color;
    } else if (host?.appendChild && documentRef?.createElement) {
        const probe = documentRef.createElement('span');
        probe.className = 'rm-page-ref rm-page-ref--link rm-page-ref-link-color';
        probe.textContent = 'Roam Logbook palette probe';
        probe.setAttribute('aria-hidden', 'true');
        probe.setAttribute('data-rlb-palette-probe', 'true');
        probe.style.cssText =
            'position:fixed;left:-10000px;top:-10000px;width:1px;height:1px;' +
            'visibility:hidden;pointer-events:none;contain:strict;';
        try {
            host.appendChild(probe);
            const color = computedColor(documentRef, probe);
            if (color && !isBrowserDefaultTextColor(color)) {
                probeColor = color;
            }
        } finally {
            probe.remove();
        }
    }

    probePaletteByDocument.set(documentRef, { signature, color: probeColor });
    if (probeColor) return { color: probeColor, hoverColor: probeColor, source: 'probe' };

    const custom = readCustomLinkColor(documentRef, host);
    if (custom) return { color: custom.color, hoverColor: custom.color, source: custom.source };

    const color = isDarkTheme(documentRef) ? DARK_PAGE_LINK : LIGHT_PAGE_LINK;
    return { color, hoverColor: color, source: 'fallback' };
}

const parseColor = value => {
    const text = normalized(value).toLowerCase();
    const hex = text.match(/^#([0-9a-f]{3,8})$/i);
    if (hex) {
        const raw = hex[1];
        const expanded = raw.length <= 4 ? [...raw].map(char => char + char).join('') : raw;
        return {
            r: Number.parseInt(expanded.slice(0, 2), 16),
            g: Number.parseInt(expanded.slice(2, 4), 16),
            b: Number.parseInt(expanded.slice(4, 6), 16),
        };
    }
    const rgb = text.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
    if (rgb) return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) };
    return null;
};

const isStableGreen = color => {
    const rgb = parseColor(color);
    if (!rgb) return false;
    return rgb.g >= 90 && rgb.g > rgb.r * 1.12 && rgb.g >= rgb.b * 0.9;
};

const semanticSyncCandidate = node => {
    if (!node || isPluginNode(node)) return false;
    const signal = [
        node.getAttribute?.('class'),
        node.getAttribute?.('aria-label'),
        node.getAttribute?.('title'),
        node.getAttribute?.('data-state'),
        node.getAttribute?.('data-status'),
    ]
        .filter(Boolean)
        .join(' ');
    return SYNC_STATUS_PATTERN.test(signal);
};

const syncSignal = node =>
    [
        node?.getAttribute?.('class'),
        node?.getAttribute?.('style'),
        node?.getAttribute?.('aria-label'),
        node?.getAttribute?.('title'),
        node?.getAttribute?.('data-state'),
        node?.getAttribute?.('data-status'),
        semanticSyncCandidate(node) ? node?.textContent : '',
    ]
        .map(value => normalized(value))
        .join('\u001f');

const candidateColors = (documentRef, node) => {
    const values = [];
    for (const pseudo of [undefined, '::before', '::after']) {
        const style = computedStyle(documentRef, node, pseudo);
        for (const property of ['backgroundColor', 'borderColor', 'color', 'fill', 'stroke']) {
            const value = normalized(style?.[property]);
            if (isUsableColor(value)) values.push(value);
        }
    }
    return values;
};

const smallGeometry = node => {
    try {
        const rect = node.getBoundingClientRect?.();
        return Boolean(
            rect &&
                rect.width >= 6 &&
                rect.width <= 12 &&
                rect.height >= 6 &&
                rect.height <= 12
        );
    } catch {
        return false;
    }
};

const syncGeometryCacheByDocument = new WeakMap();

const sameNodes = (left, right) =>
    Boolean(
        left &&
            right &&
            left.length === right.length &&
            left.every((node, index) => node === right[index])
    );

const syncPaletteCacheKey = (documentRef, all, semantic) =>
    [
        themeSignature(documentRef),
        all.length,
        semantic.map(syncSignal).join('\u001e'),
        all.slice(0, SYNC_GEOMETRY_LIMIT).map(syncSignal).join('\u001e'),
    ].join('\u001d');

/** Find Roam's stable synced/save green, ignoring transient orange/red states. */
export function readRoamSyncPalette(documentRef = document) {
    const topbar = documentRef?.querySelector?.('.rm-topbar') || documentRef?.body;
    if (!topbar) {
        return { color: isDarkTheme(documentRef) ? DARK_SYNC_GREEN : LIGHT_SYNC_GREEN, source: 'fallback' };
    }
    const all = [...topbar.querySelectorAll?.('*') || []];
    const semantic = all.filter(semanticSyncCandidate);
    for (const node of semantic) {
        const color = candidateColors(documentRef, node).find(isStableGreen);
        if (color) return { color, source: 'semantic' };
    }

    const sampledNodes = all.slice(0, SYNC_GEOMETRY_LIMIT);
    const cacheKey = syncPaletteCacheKey(documentRef, all, semantic);
    const documentCache = syncGeometryCacheByDocument.get(documentRef) || new WeakMap();
    const cached = documentCache.get(topbar);
    if (
        cached?.key === cacheKey &&
        sameNodes(cached.sampledNodes, sampledNodes)
    ) {
        return cached.palette;
    }

    // A few Roam builds expose only a small colored status dot. Geometry is a
    // fallback for candidate selection; color still comes from computed CSS.
    for (const node of sampledNodes) {
        if (isPluginNode(node) || !smallGeometry(node)) continue;
        const color = candidateColors(documentRef, node).find(isStableGreen);
        if (color) {
            const palette = { color, source: 'geometry' };
            documentCache.set(topbar, { key: cacheKey, palette, sampledNodes });
            syncGeometryCacheByDocument.set(documentRef, documentCache);
            return palette;
        }
    }
    const palette = {
        color: isDarkTheme(documentRef) ? DARK_SYNC_GREEN : LIGHT_SYNC_GREEN,
        source: 'fallback',
    };
    documentCache.set(topbar, { key: cacheKey, palette, sampledNodes });
    syncGeometryCacheByDocument.set(documentRef, documentCache);
    return palette;
}

const runtimeByDocument = new WeakMap();

const scheduleWith = (documentRef, callback) => {
    const view = getWindow(documentRef);
    if (typeof view?.requestAnimationFrame === 'function') {
        const id = view.requestAnimationFrame(callback);
        return { kind: 'raf', id };
    }
    const id = setTimeout(callback, 0);
    return { kind: 'timer', id };
};

const cancelScheduled = (documentRef, scheduled) => {
    if (!scheduled) return;
    const view = getWindow(documentRef);
    if (scheduled.kind === 'raf') view?.cancelAnimationFrame?.(scheduled.id);
    else clearTimeout(scheduled.id);
};

const isSyncCandidate = node => semanticSyncCandidate(node);

const isPreviousSyncCandidate = record => {
    const node = record?.target;
    if (record?.type !== 'attributes' || !node) return false;
    const values = [
        record.attributeName === 'class' ? record.oldValue : node.getAttribute?.('class'),
        record.attributeName === 'aria-label' ? record.oldValue : node.getAttribute?.('aria-label'),
        record.attributeName === 'title' ? record.oldValue : node.getAttribute?.('title'),
        record.attributeName === 'data-state' ? record.oldValue : node.getAttribute?.('data-state'),
        record.attributeName === 'data-status' ? record.oldValue : node.getAttribute?.('data-status'),
    ];
    return SYNC_STATUS_PATTERN.test(values.filter(Boolean).join(' '));
};

const containsSyncCandidate = node =>
    isSyncCandidate(node) ||
    Boolean([...node?.querySelectorAll?.('*') || []].some(child => isSyncCandidate(child)));

const isDocumentThemeNode = node =>
    Boolean(
        node?.nodeType === 1 &&
            (node === node.ownerDocument?.documentElement || node === node.ownerDocument?.body)
    );

const isRelevantThemeMutation = record =>
    record?.type === 'attributes' &&
    THEME_ROOT_ATTRIBUTES.has(record.attributeName) &&
    isDocumentThemeNode(record.target);

/**
 * The sync observer is attached to one topbar only. Its filter is deliberately
 * string/attribute based; computed styles and geometry belong to the rAF read.
 */
const isRelevantSyncMutation = record => {
    const target = record?.target;
    if (!target || target?.closest?.(PLUGIN_ROOT_SELECTOR)) return false;

    if (record.type === 'attributes') {
        if (isSyncCandidate(target) || isPreviousSyncCandidate(record)) return true;
        return false;
    }

    if (record.type === 'childList') {
        if (isSyncCandidate(target)) return true;
        const nodes = [...(record.addedNodes || []), ...(record.removedNodes || [])].filter(
            node => !node?.closest?.(PLUGIN_ROOT_SELECTOR)
        );
        return nodes.some(containsSyncCandidate);
    }

    return false;
};

const applyPalette = (root, palette) => {
    if (!root?.style || !palette) return;
    root.style.setProperty('--rlb-surface-link', palette.link);
    root.style.setProperty('--rlb-surface-link-hover', palette.linkHover);
    root.style.setProperty('--rlb-session-running', palette.sync);
};

/**
 * Shared, reference-counted theme observer. Controllers get a small handle so
 * dashboard/popover/sidebar roots all receive the same last-good palette while
 * one observer is cleaned up when the extension unloads.
 */
export function acquireThemeRuntime({ documentRef = document, onChange = () => {} } = {}) {
    let state = runtimeByDocument.get(documentRef);
    if (!state) {
        const page = readRoamPageLinkPalette(documentRef);
        const sync = readRoamSyncPalette(documentRef);
        state = {
            refs: 0,
            listeners: new Set(),
            page,
            sync,
            scheduled: null,
            themeObserver: null,
            syncObserver: null,
            syncTopbar: null,
            media: null,
            mediaListener: null,
        };
        runtimeByDocument.set(documentRef, state);
    }

    const palette = () => ({
        link: state.page.color,
        linkHover: state.page.hoverColor || state.page.color,
        sync: state.sync.color,
    });

    const notify = () => {
        const current = palette();
        for (const listener of state.listeners) listener(current);
    };

    const MutationObserverCtor =
        getWindow(documentRef)?.MutationObserver || globalThis.MutationObserver;

    const connectSyncObserver = () => {
        if (!MutationObserverCtor) return;
        const topbar = documentRef?.querySelector?.(TOPBAR_SELECTOR) || null;
        if (state.syncTopbar === topbar && (topbar === null || state.syncObserver)) return;
        state.syncObserver?.disconnect();
        state.syncObserver = null;
        state.syncTopbar = topbar;
        if (!topbar) return;
        state.syncObserver = new MutationObserverCtor(records => {
            if (records.some(isRelevantSyncMutation)) scheduleRefresh();
        });
        state.syncObserver.observe(topbar, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeOldValue: true,
            attributeFilter: SYNC_ATTRIBUTES,
        });
    };

    const refresh = () => {
        connectSyncObserver();
        const page = readRoamPageLinkPalette(documentRef);
        const sync = readRoamSyncPalette(documentRef);
        // A real source wins. If it temporarily disappears, keep the last-good
        // value instead of flashing the plugin back to an unrelated fallback.
        if (page.source !== 'fallback' || state.page.source === 'fallback') state.page = page;
        if (sync.source !== 'fallback' || state.sync.source === 'fallback') state.sync = sync;
        notify();
    };

    const scheduleRefresh = () => {
        if (state.scheduled) return;
        state.scheduled = scheduleWith(documentRef, () => {
            state.scheduled = null;
            refresh();
        });
    };

    if (state.refs === 0) {
        if (MutationObserverCtor) {
            state.themeObserver = new MutationObserverCtor(records => {
                if (records.some(isRelevantThemeMutation)) scheduleRefresh();
            });
            for (const target of [documentRef?.documentElement, documentRef?.body]) {
                if (!target) continue;
                state.themeObserver.observe(target, {
                    subtree: false,
                    attributes: true,
                    attributeFilter: [...THEME_ROOT_ATTRIBUTES],
                });
            }
            connectSyncObserver();
        }
        const view = getWindow(documentRef);
        state.media = view?.matchMedia?.('(prefers-color-scheme: dark)') || null;
        state.mediaListener = () => scheduleRefresh();
        if (state.media?.addEventListener) state.media.addEventListener('change', state.mediaListener);
        else state.media?.addListener?.(state.mediaListener);
    }
    state.refs += 1;
    state.listeners.add(onChange);
    onChange(palette());

    let released = false;
    return {
        getPalette: palette,
        refresh,
        apply(root) {
            applyPalette(root, palette());
        },
        release() {
            if (released) return;
            released = true;
            state.listeners.delete(onChange);
            state.refs -= 1;
            if (state.refs > 0) return;
            state.themeObserver?.disconnect();
            state.themeObserver = null;
            state.syncObserver?.disconnect();
            state.syncObserver = null;
            state.syncTopbar = null;
            if (state.media?.removeEventListener) state.media.removeEventListener('change', state.mediaListener);
            else state.media?.removeListener?.(state.mediaListener);
            state.media = null;
            state.mediaListener = null;
            cancelScheduled(documentRef, state.scheduled);
            state.scheduled = null;
            runtimeByDocument.delete(documentRef);
        },
    };
}

export function applyRoamThemePalette(root, palette) {
    applyPalette(root, palette);
}
