/**
 * Short-lived confirmation state shared by every entry point for one danger
 * action. It is intentionally an in-memory controller: unloading the extension
 * or closing the popover resets it, and it is not a lock or a graph transaction.
 */
export function createConfirmationController({
    timeoutMs = 5_000,
    setTimeoutFn = (callback, delay) => setTimeout(callback, delay),
    clearTimeoutFn = timer => clearTimeout(timer),
    onChange: initialOnChange = () => {},
} = {}) {
    let active = null;
    let timer = null;
    let onChange = initialOnChange;

    const reset = () => {
        if (timer !== null) clearTimeoutFn(timer);
        timer = null;
        active = null;
        onChange();
    };

    const arm = (key, source = 'default') => {
        if (active?.key === key && active.source === source) {
            reset();
            return true;
        }

        // A confirmation armed from another entry point is not silently
        // accepted as the second click. The new entry point starts its own
        // first step, so a command and a popover cannot cross-confirm.
        reset();
        active = { key, source };
        timer = setTimeoutFn(() => reset(), timeoutMs);
        onChange();
        return false;
    };

    const isArmed = (key, source = null) =>
        active?.key === key && (source === null || active.source === source);

    const setOnChange = listener => {
        onChange = typeof listener === 'function' ? listener : () => {};
    };

    return { arm, isArmed, reset, setOnChange };
}
