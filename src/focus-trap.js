const FOCUSABLE_SELECTOR =
    'button, select, input, textarea, a[href], [tabindex]:not([tabindex="-1"])';

/**
 * Keep keyboard focus inside a modal root while it is mounted.
 *
 * The caller owns Escape handling and focus restoration; this helper only
 * supplies the shared Tab-cycle behavior used by the two modal surfaces.
 */
export function createFocusTrap(getRoot, { documentRef = document } = {}) {
    let active = false;

    const onKeyDown = event => {
        if (!active || event.key !== 'Tab') return;
        const root = getRoot?.();
        if (!root) return;
        const focusables = [...root.querySelectorAll(FOCUSABLE_SELECTOR)].filter(
            node => !node.disabled && node.getAttribute('aria-hidden') !== 'true'
        );
        event.preventDefault();
        event.stopPropagation();
        if (focusables.length === 0) {
            root.tabIndex = -1;
            root.focus();
            return;
        }

        const first = focusables[0];
        const last = focusables.at(-1);
        const index = focusables.indexOf(documentRef.activeElement);
        if (event.shiftKey) {
            if (index <= 0) last.focus();
            else focusables[index - 1].focus();
        } else if (index < 0 || index === focusables.length - 1) {
            first.focus();
        } else {
            focusables[index + 1].focus();
        }
    };

    return {
        activate() {
            if (active) return;
            active = true;
            documentRef.addEventListener('keydown', onKeyDown, true);
        },
        deactivate() {
            if (!active) return;
            active = false;
            documentRef.removeEventListener('keydown', onKeyDown, true);
        },
    };
}
