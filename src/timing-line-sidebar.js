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
    let queue = Promise.resolve();
    let disposed = false;

    const isCurrent = intent =>
        !disposed && intent === latestIntent && Boolean(isEnabled());

    const handleAction = action => {
        if (disposed || !isTimingLineFrontIntent(action) || !isEnabled()) return false;
        const intent = ++latestIntent;

        queue = queue
            .catch(() => undefined)
            .then(async () => {
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
                    onNotice(result.message || DEFAULT_FAILURE_NOTICE);
                }
                return result;
            });
        return true;
    };

    return {
        handleAction,
        whenIdle: () => queue,
        dispose() {
            disposed = true;
            latestIntent += 1;
        },
    };
}
