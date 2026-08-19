const DEFAULT_SELECTOR = '.rm-topbar';
const RECOVERY_TIMEOUT_MS = 15_000;
const RECOVERY_FLUSH_LIMIT = 32;

/**
 * Own the narrow host/recovery observer seam for the Roam topbar.
 *
 * The widget controller supplies the actual attach operation; this module
 * keeps all observer lifetime, debouncing, and bounded boot recovery together.
 */
export function createTopbarHost({
    selector = DEFAULT_SELECTOR,
    getContainer = () => null,
    getPopover = () => null,
    isDestroyed = () => false,
    onAttach = () => {},
    onMissing = () => {},
    onDisabled = () => {},
    documentRef = document,
    mutationObserver = MutationObserver,
    setTimeoutFn = (callback, delay) => setTimeout(callback, delay),
    clearTimeoutFn = timer => clearTimeout(timer),
    recoveryTimeoutMs = RECOVERY_TIMEOUT_MS,
    recoveryFlushLimit = RECOVERY_FLUSH_LIMIT,
} = {}) {
    let observer = null;
    let hostObserver = null;
    let recoveryObserver = null;
    let outerRecoveryObserver = null;
    let recoveryTarget = null;
    let outerRecoveryTarget = null;
    let observedTopbar = null;
    let attachQueued = false;
    let attachTimer = null;
    let attachCount = 0;
    let recoveryShutdownTimer = null;
    let recoveryFlushes = 0;
    let recoveryDisabled = false;

    const isPluginNode = node => {
        const container = getContainer();
        const popover = getPopover();
        return Boolean(
            node &&
                (node === container ||
                    node === popover ||
                    container?.contains(node) ||
                    popover?.contains(node))
        );
    };

    const hasNonPluginMutation = record => {
        if (isPluginNode(record.target)) return false;
        const nodes = [...record.addedNodes, ...record.removedNodes];
        return nodes.length === 0 || nodes.some(node => !isPluginNode(node));
    };

    const touchesTopbar = record => {
        if (isPluginNode(record.target)) return false;
        const nodes = [...record.addedNodes, ...record.removedNodes];
        // Inserting or updating our widget is expected to happen inside the
        // observed host. Do not let that self-mutation trigger a re-attach.
        if (nodes.length > 0 && nodes.every(isPluginNode)) return false;
        const target = record.target;
        if (target?.matches?.(selector) || target?.closest?.(selector)) return true;

        // During boot the observer is the body subtree. Most records are
        // ordinary descendants, so only the subtree root is allowed to fall
        // through to a descendant query; direct topbar insertions are enough
        // for the other targets.
        if (recoveryTarget === documentRef.body && target !== recoveryTarget) {
            return nodes.some(node => node?.matches?.(selector));
        }
        return nodes.some(
            node => node?.matches?.(selector) || node?.querySelector?.(selector)
        );
    };

    const scheduleAttach = () => {
        if (isDestroyed() || attachQueued) return;
        attachQueued = true;
        const flush = () => {
            attachQueued = false;
            attachTimer = null;
            attach();
        };
        if (typeof queueMicrotask === 'function') queueMicrotask(flush);
        else attachTimer = setTimeoutFn(flush, 0);
    };

    const observeTopbar = topbar => {
        hostObserver?.disconnect();
        observedTopbar = topbar;
        hostObserver = new mutationObserver(records => {
            if (records.some(hasNonPluginMutation)) scheduleAttach();
        });
        // The topbar is the stable host seam. We only observe its descendants;
        // recoveryObserver below is filtered to host replacement signals.
        hostObserver.observe(topbar, { childList: true, subtree: true });
    };

    const clearRecoveryShutdown = () => {
        if (recoveryShutdownTimer) clearTimeoutFn(recoveryShutdownTimer);
        recoveryShutdownTimer = null;
    };

    const disableRecovery = () => {
        if (recoveryDisabled) return;
        recoveryDisabled = true;
        clearRecoveryShutdown();
        recoveryObserver?.disconnect();
        recoveryObserver = null;
        outerRecoveryObserver?.disconnect();
        outerRecoveryObserver = null;
        observer = null;
        recoveryTarget = null;
        outerRecoveryTarget = null;
        onDisabled();
    };

    const armRecoveryShutdown = () => {
        if (recoveryDisabled || recoveryShutdownTimer) return;
        recoveryShutdownTimer = setTimeoutFn(() => {
            recoveryShutdownTimer = null;
            if (!isDestroyed() && !documentRef.querySelector(selector)) disableRecovery();
        }, recoveryTimeoutMs);
    };

    const noteRecoveryMiss = () => {
        recoveryFlushes += 1;
        if (recoveryFlushes >= recoveryFlushLimit) disableRecovery();
    };

    /**
     * Observe only the shell that owns the topbar after the host is found.
     *
     * A body-wide subtree observer is useful during initial boot, when Roam
     * has not mounted its shell yet. Once the shell exists, its immediate
     * parent is enough to notice replacement; descendants are handled above.
     */
    const observeRecoveryTarget = topbar => {
        if (!topbar && recoveryDisabled) return;
        if (topbar) {
            clearRecoveryShutdown();
            recoveryFlushes = 0;
            recoveryDisabled = false;
        } else {
            armRecoveryShutdown();
        }
        const target = topbar?.parentElement || documentRef.body;
        const subtree = !topbar;
        const outerTarget = topbar?.parentElement?.parentElement || null;
        if (
            recoveryObserver &&
            recoveryTarget === target &&
            outerRecoveryTarget === outerTarget
        ) return;
        recoveryObserver?.disconnect();
        outerRecoveryObserver?.disconnect();
        recoveryObserver = new mutationObserver(records => {
            if (records.some(touchesTopbar)) scheduleAttach();
        });
        recoveryTarget = target;
        recoveryObserver.observe(target, { childList: true, ...(subtree ? { subtree: true } : {}) });

        // Observe only the direct outer shell. This catches replacement of the
        // navigation wrapper while avoiding a body subtree observer afterwards.
        outerRecoveryTarget = outerTarget;
        if (outerTarget && outerTarget !== target) {
            outerRecoveryObserver = new mutationObserver(records => {
                if (records.some(touchesTopbar)) scheduleAttach();
            });
            outerRecoveryObserver.observe(outerTarget, { childList: true });
        } else {
            outerRecoveryObserver = null;
        }
        observer = recoveryObserver;
    };

    function attach() {
        if (isDestroyed()) return;
        attachCount += 1;
        const topbar = documentRef.querySelector(selector);
        observeRecoveryTarget(topbar);
        if (!topbar) {
            onMissing();
            noteRecoveryMiss();
            return;
        }
        clearRecoveryShutdown();
        recoveryFlushes = 0;
        recoveryDisabled = false;
        if (topbar !== observedTopbar) observeTopbar(topbar);
        onAttach(topbar);
    }

    const stop = () => {
        clearRecoveryShutdown();
        observer?.disconnect();
        observer = null;
        hostObserver?.disconnect();
        hostObserver = null;
        recoveryObserver?.disconnect();
        recoveryObserver = null;
        outerRecoveryObserver?.disconnect();
        outerRecoveryObserver = null;
        recoveryTarget = null;
        outerRecoveryTarget = null;
        observedTopbar = null;
        attachQueued = false;
        if (attachTimer) clearTimeoutFn(attachTimer);
        attachTimer = null;
    };

    return {
        attach,
        refresh: attach,
        stop,
        scheduleAttach,
        getPerformanceSnapshot() {
            return { attachCount };
        },
    };
}
