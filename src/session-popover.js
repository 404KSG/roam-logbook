import { el } from './dom.js';
import { createFocusTrap } from './focus-trap.js';
import { acquireModalInert } from './modal-inert.js';

const FOCUSABLE_SELECTOR =
    'button, select, input, textarea, a[href], [tabindex]:not([tabindex="-1"])';

/**
 * Own the body-mounted Session popover: lifecycle, positioning, Escape,
 * outside-click dismissal, and modal keyboard focus.
 */
export function createSessionPopover({
    id,
    titleId,
    getTrigger = () => null,
    onRender = () => {},
    onBeforeOpen = () => {},
    onOpened = () => {},
    onBeforeClose = () => {},
    acquireInert = acquireModalInert,
    documentRef = document,
    windowRef = window,
} = {}) {
    let root = null;
    let releaseInert = null;
    const focusTrap = createFocusTrap(() => root, { documentRef });

    const syncTriggerAria = expanded => {
        const trigger = getTrigger();
        trigger?.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        trigger?.setAttribute('aria-controls', id);
    };

    const position = () => {
        const trigger = getTrigger();
        const anchor = trigger?.getBoundingClientRect();
        if (!anchor || !root) return;
        const width = root.offsetWidth || 340;
        const viewport = windowRef.innerWidth || width + 16;
        root.style.top = `${anchor.bottom + 6}px`;
        // Hangs from the trigger's left edge, then pulls back if that would run
        // off-screen — the widget sits at the left of the topbar.
        root.style.left = `${Math.max(8, Math.min(anchor.left, viewport - width - 8))}px`;
    };

    function onDocumentMouseDown(event) {
        if (!root) return;
        const trigger = getTrigger();
        if (trigger?.contains(event.target) || root.contains(event.target)) return;
        close();
    }

    function onKeyDown(event) {
        if (!root || event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        close();
    }

    const close = ({ restoreFocus = true } = {}) => {
        if (!root) return;
        const current = root;
        let closeError = null;
        try {
            onBeforeClose({ restoreFocus, root: current });
        } catch (error) {
            closeError = error;
        } finally {
            focusTrap.deactivate();
            releaseInert?.();
            releaseInert = null;
            current.remove();
            root = null;
            documentRef.removeEventListener('mousedown', onDocumentMouseDown, true);
            documentRef.removeEventListener('keydown', onKeyDown, true);
            windowRef.removeEventListener('resize', close);
            syncTriggerAria(false);
            if (restoreFocus && getTrigger()?.isConnected) getTrigger().focus();
        }
        if (closeError) throw closeError;
    };

    const render = () => {
        if (root) onRender(root);
    };

    const open = () => {
        if (root) return root;
        onBeforeOpen();
        root = el('div', 'bp3-card bp3-elevation-3 rlb-popover');
        root.id = id;
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-labelledby', titleId);
        try {
            documentRef.body.appendChild(root);
            releaseInert = acquireInert?.({ documentRef, modalRoot: root }) || null;
            syncTriggerAria(true);
            onRender(root);
            position();
            documentRef.addEventListener('mousedown', onDocumentMouseDown, true);
            documentRef.addEventListener('keydown', onKeyDown, true);
            windowRef.addEventListener('resize', close);
            focusTrap.activate();
            const firstFocusable = root.querySelector(FOCUSABLE_SELECTOR);
            if (firstFocusable) firstFocusable.focus();
            else {
                root.tabIndex = -1;
                root.focus();
            }
            onOpened(root);
            return root;
        } catch (error) {
            focusTrap.deactivate();
            releaseInert?.();
            releaseInert = null;
            root.remove();
            root = null;
            documentRef.removeEventListener('mousedown', onDocumentMouseDown, true);
            documentRef.removeEventListener('keydown', onKeyDown, true);
            windowRef.removeEventListener('resize', close);
            syncTriggerAria(false);
            throw error;
        }
    };

    return {
        get root() {
            return root;
        },
        get isOpen() {
            return Boolean(root);
        },
        open,
        close,
        render,
        position,
        toggle(event) {
            if (event?.shiftKey) {
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            if (root) close();
            else open();
        },
        destroy() {
            close({ restoreFocus: false });
        },
    };
}
