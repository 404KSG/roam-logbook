// Dashboard overlays are allowed to outlive a single render, and hot reloads
// can briefly create more than one controller. Keep the document lock shared
// and reference-counted so the last close restores the exact pre-open state.
const documentScrollLocks = new WeakMap();

const restoreInlineStyle = (node, value) => {
    if (!node) return;
    if (value === null) node.removeAttribute('style');
    else node.setAttribute('style', value);
};

const releaseDocumentScrollLock = (documentRef, windowRef, state) => {
    const current = documentScrollLocks.get(documentRef);
    if (current !== state) return;
    current.count -= 1;
    if (current.count > 0) return;

    restoreInlineStyle(current.html, current.htmlStyle);
    restoreInlineStyle(current.body, current.bodyStyle);
    try {
        windowRef.scrollTo(current.scrollX, current.scrollY);
    } catch {
        // jsdom and older embedded WebViews may not implement scrollTo.
    }
    documentScrollLocks.delete(documentRef);
};

export function acquireDocumentScrollLock({
    documentRef = document,
    windowRef = documentRef.defaultView || window,
} = {}) {
    const html = documentRef.documentElement;
    const body = documentRef.body;
    if (!html || !body) return () => {};

    let state = documentScrollLocks.get(documentRef);
    if (!state) {
        const scrollX = Number(windowRef.scrollX) || 0;
        const scrollY = Number(windowRef.scrollY) || 0;
        const scrollbarWidth = Math.max(0, (Number(windowRef.innerWidth) || 0) - html.clientWidth);
        const computedPadding = Number.parseFloat(windowRef.getComputedStyle(body).paddingRight) || 0;
        state = {
            count: 0,
            html,
            body,
            htmlStyle: html.getAttribute('style'),
            bodyStyle: body.getAttribute('style'),
            scrollX,
            scrollY,
        };
        documentScrollLocks.set(documentRef, state);
        try {
            html.style.overflow = 'hidden';
            body.style.overflow = 'hidden';
            if (scrollbarWidth > 0) {
                body.style.paddingRight = `${computedPadding + scrollbarWidth}px`;
            }
        } catch (error) {
            restoreInlineStyle(html, state.htmlStyle);
            restoreInlineStyle(body, state.bodyStyle);
            documentScrollLocks.delete(documentRef);
            throw error;
        }
    }

    state.count += 1;
    let released = false;
    return () => {
        if (released) return;
        released = true;
        releaseDocumentScrollLock(documentRef, windowRef, state);
    };
}
