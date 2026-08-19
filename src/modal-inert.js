const APP_ROOT_SELECTOR = '#app, .roam-app, .roam-body, [data-roam-app]';
const inertStates = new WeakMap();

const findAppRoot = (documentRef, modalRoot) =>
    documentRef.querySelector(APP_ROOT_SELECTOR) ||
    [...(documentRef.body?.children || [])].find(
        node => node !== modalRoot && !node.classList?.contains('rlb-popover')
    ) ||
    null;

/**
 * Temporarily isolate Roam's application shell while a body-mounted modal is
 * open. The returned release function is idempotent and restores a pre-existing
 * inert attribute/property, so error and teardown paths can safely share it.
 */
export function acquireModalInert({
    documentRef = document,
    modalRoot = null,
    appRoot = null,
} = {}) {
    const root = appRoot || findAppRoot(documentRef, modalRoot);
    if (!root || root === modalRoot || modalRoot?.contains(root)) return () => {};

    let state = inertStates.get(root);
    if (!state) {
        state = {
            count: 0,
            hadAttribute: root.hasAttribute('inert'),
            attributeValue: root.getAttribute('inert'),
            propertyValue: 'inert' in root ? root.inert : undefined,
        };
        inertStates.set(root, state);
    }
    state.count += 1;
    try {
        root.inert = true;
    } catch {
        // Older DOM implementations may not expose the property yet.
    }
    root.setAttribute('inert', '');

    let released = false;
    return () => {
        if (released) return;
        released = true;
        state.count -= 1;
        if (state.count > 0) return;
        if (state.hadAttribute) root.setAttribute('inert', state.attributeValue ?? '');
        else root.removeAttribute('inert');
        if (state.propertyValue !== undefined) {
            try {
                root.inert = state.propertyValue;
            } catch {
                // The attribute restoration above remains the safe fallback.
            }
        }
        inertStates.delete(root);
    };
}
