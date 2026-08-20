/**
 * UI orchestration for immediate, user-initiated Timing Line navigation.
 *
 * The graph mutation remains authoritative for timing. This seam responds to
 * the reversible navigation intent early, so native sidebar rendering can run
 * alongside graph confirmation. Requests are serialized so a slow older intent
 * cannot finish after and displace the newest requested Timing Line.
 */

import { frontBlockInRightSidebar } from './roam.js';
import { keepTimingLineAtTopOfRightSidebar } from './settings.js';

const USER_CLOCK_IN_SOURCES = new Set(['user', 'active-work-switch']);
const DEFAULT_FAILURE_NOTICE =
    'Timing Line started, but Roam could not move it to the top of the right sidebar.';

export function isTimingLineFrontIntent(action) {
    return (
        action?.type === 'clock-in-intent' &&
        USER_CLOCK_IN_SOURCES.has(action.source) &&
        typeof action.taskUid === 'string' &&
        action.taskUid.length > 0
    );
}

export function createTimingLineSidebarFronting({
    frontBlock = frontBlockInRightSidebar,
    isEnabled = keepTimingLineAtTopOfRightSidebar,
    onNotice = () => {},
} = {}) {
    let latestIntent = 0;
    const inFlight = new Set();
    let disposed = false;

    const isFrontingEnabled = () => {
        try {
            return Boolean(isEnabled());
        } catch (error) {
            console.debug('[roam-logbook] sidebar setting check failed', error);
            return false;
        }
    };

    const isCurrent = intent => {
        if (disposed || intent !== latestIntent) return false;
        return isFrontingEnabled();
    };

    const runIntent = async (action, intent) => {
        if (!isCurrent(intent)) {
            return { ok: false, skipped: true, reason: 'superseded' };
        }
        let result;
        try {
            result = await frontBlock(action.taskUid, {
                isCurrent: () => isCurrent(intent),
            });
        } catch (error) {
            result = {
                ok: false,
                reason: 'sidebar-front-failed',
                message: error?.message || DEFAULT_FAILURE_NOTICE,
                error,
            };
        }
        if (result?.ok === false && !result?.skipped && isCurrent(intent)) {
            try {
                onNotice(result.message || DEFAULT_FAILURE_NOTICE);
            } catch (error) {
                // A removed or host-owned notice surface cannot reject the
                // detached navigation request or poison later switches.
                console.debug('[roam-logbook] sidebar notice failed', error);
            }
        }
        return result;
    };

    const handleAction = action => {
        if (disposed || !isTimingLineFrontIntent(action) || !isFrontingEnabled()) return false;
        const intent = ++latestIntent;

        // Every accepted intent receives its own one-microtask launch. The
        // adapter keeps authoritative window mutations serialized, while its
        // reversible preview lane lets the latest task become visible without
        // waiting for an older native operation to settle.
        const request = Promise.resolve().then(() => runIntent(action, intent));
        inFlight.add(request);
        const release = () => inFlight.delete(request);
        void request.then(release, release);
        return true;
    };

    const whenIdle = async () => {
        while (inFlight.size > 0) {
            await Promise.allSettled([...inFlight]);
        }
    };

    return {
        handleAction,
        whenIdle,
        dispose() {
            disposed = true;
            latestIntent += 1;
        },
    };
}
