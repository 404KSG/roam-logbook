export const REFRESH_MESSAGES = {
    activeWork: {
        loading: 'Refreshing Active Work from graph…',
        success: 'Updated just now',
        error: 'Refresh failed; last valid snapshot kept. Retry.',
    },
    dashboard: {
        loading: 'Refreshing Dashboard from graph…',
        success: 'Dashboard updated just now',
        error: 'Dashboard refresh failed; last valid snapshot kept. Retry.',
    },
};

/**
 * Shared idle/loading/success/error state with one in-flight request and a
 * bounded success announcement. Rendering remains with the owning surface.
 */
export function createRefreshState({
    onRender = () => {},
    messages = REFRESH_MESSAGES.activeWork,
    successDuration = 1_800,
    setTimeoutFn = (callback, delay) => setTimeout(callback, delay),
    clearTimeoutFn = timer => clearTimeout(timer),
} = {}) {
    let current = { state: 'idle', message: '' };
    let inFlight = null;
    let clearTimer = null;

    const clearSuccessTimer = () => {
        if (clearTimer !== null) clearTimeoutFn(clearTimer);
        clearTimer = null;
    };

    const set = (state, message, { clearAfter = false } = {}) => {
        clearSuccessTimer();
        current = { state, message };
        onRender(current);
        if (clearAfter && Number.isFinite(successDuration) && successDuration > 0) {
            clearTimer = setTimeoutFn(() => {
                clearTimer = null;
                if (current.state !== 'success') return;
                current = { state: 'idle', message: '' };
                onRender(current);
            }, successDuration);
        }
    };

    const run = (
        operation,
        { onSuccess, onFailure, onError, isSuccess = result => result?.ok } = {}
    ) => {
        if (inFlight) return inFlight;
        set('loading', messages.loading);
        const request = Promise.resolve()
            .then(operation)
            .then(
                result => {
                    if (isSuccess(result)) {
                        onSuccess?.(result);
                        set('success', messages.success, { clearAfter: true });
                    } else {
                        onFailure?.(result);
                        set('error', messages.error);
                    }
                    return result;
                },
                error => {
                    const result = onError?.(error) ?? { ok: false, error };
                    set('error', messages.error);
                    return result;
                }
            );
        inFlight = request.finally(() => {
            inFlight = null;
        });
        return inFlight;
    };

    const reset = () => {
        clearSuccessTimer();
        current = { state: 'idle', message: '' };
        onRender(current);
    };

    return {
        get state() {
            return current;
        },
        get inFlight() {
            return inFlight;
        },
        set,
        run,
        reset,
        dispose() {
            clearSuccessTimer();
            inFlight = null;
        },
    };
}
