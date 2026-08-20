/**
 * Task Tracker — org-mode clock tracking for Roam TODOs.
 *
 * Right-click a TODO bullet to clock in; the topbar shows the live session and
 * the dashboard adds it up. Entries live in the graph as an org LOGBOOK drawer,
 * which is also how a running clock survives a reload.
 */

import * as clock from './clock.js';
import { createConfirmationController } from './confirmation.js';
import { createDashboard } from './dashboard.js';
import { injectStyles, removeStyles } from './dom.js';
import {
    getBlockString,
    getFocusedBlockUid,
    warmRightSidebarWindowCache,
} from './roam.js';
import { isTaskBlock, taskStatus } from './org.js';
import * as pomodoro from './pomodoro.js';
import { mutationResultNotice, presentMutationResult } from './action-result.js';
import {
    initializeDefaultOnSwitches,
    normalizeChecked,
    normalizePositiveHours,
    normalizePositiveMinutes,
    setExtensionAPI,
    SETTING_POMODORO_MINUTES,
    SETTING_STALE_HOURS,
    SETTING_TIMING_LINE_SIDEBAR,
} from './settings.js';
import { STYLES, STYLE_ID } from './styles.js';
import { createTopbar } from './topbar.js';
import { PLUGIN_VERSION } from './version.js';
import { attachCompletionHandling } from './completion.js';
import { createTimingLineSidebarFronting } from './timing-line-sidebar.js';

const CONTEXT_CLOCK_IN = 'Task Tracker: Clock in';
const CONTEXT_CLOCK_OUT = 'Task Tracker: Clock out';
const BRAND_NAME = 'Task Tracker';

const PALETTE_COMMANDS = [
    'Task Tracker: Focus current block',
    'Task Tracker: Clock out Timing Line',
    'Task Tracker: Open dashboard',
];
const RETIRED_PALETTE_COMMANDS = [
    'Logbook: Check for unfinished clocks',
    'Logbook: Clock in current block',
    'Logbook: Clock out current block',
    'Logbook: Clock out all running clocks',
];

function createController({ extensionAPI }) {
    const dashboard = createDashboard();
    const confirmation = createConfirmationController();
    const topbar = createTopbar({
        confirmation,
        onOpenDashboard: trigger => dashboard.open({ returnFocusTo: trigger }),
        onMutationResult: result => presentMutationResult(result, notifyUser),
    });
    let destroyed = false;
    let detachPomodoro = null;
    let detachCompletion = null;
    let detachTimingLineSidebar = null;
    let timingLineSidebar = null;
    let sidebarWarmupTimer = null;

    /** Task text of the block a menu entry was opened on, following references. */
    const targetString = context => {
        try {
            const uid = clock.resolveTaskUid(context?.['block-uid']);
            return getBlockString(uid) ?? context?.['block-string'] ?? '';
        } catch {
            return context?.['block-string'] ?? '';
        }
    };

    const canClockIn = context => {
        const uid = context?.['block-uid'];
        if (!uid || clock.isBlockRunning(uid)) return false;
        const string = targetString(context);
        if (taskStatus(string) === 'DONE') return false;
        return isTaskBlock(string);
    };

    const notifyUser = message => {
        try {
            const showToast = extensionAPI?.ui?.showToast || window.roamAlphaAPI?.ui?.showToast;
            showToast?.({ content: message, intent: 'warning' });
        } catch (error) {
            console.warn('[roam-logbook] could not show notification', error);
        }
    };

    const guard = async action => {
        try {
            const result = await action();
            return presentMutationResult(result, notifyUser);
        } catch (error) {
            console.error('[roam-logbook]', error);
            notifyUser(
                mutationResultNotice(error) ||
                    error?.message ||
                    `${BRAND_NAME} could not complete that action.`
            );
        }
    };

    const clockInFocused = () =>
        guard(async () => {
            const uid = getFocusedBlockUid();
            if (!uid) {
                notifyUser('No focused block. Select a block before clocking in.');
                return;
            }
            const string = targetString({ 'block-uid': uid });
            if (!isTaskBlock(string) || taskStatus(string) === 'DONE') {
                notifyUser('Focus is only available on an unfinished TODO block.');
                return;
            }
            return clock.clockIn(uid);
        });

    const registerSettings = () => {
        extensionAPI.settings.panel.create({
            tabTitle: BRAND_NAME,
            settings: [
                {
                    id: SETTING_TIMING_LINE_SIDEBAR,
                    name: 'Open Timing Line in right sidebar',
                    description:
                        'After Clock In or a task switch, keep the Timing Line first in Roam’s right sidebar.',
                    action: {
                        type: 'switch',
                        defaultValue: true,
                        onChange: event =>
                            extensionAPI.settings.set(
                                SETTING_TIMING_LINE_SIDEBAR,
                                normalizeChecked(event)
                            ),
                    },
                },
                {
                    id: SETTING_POMODORO_MINUTES,
                    name: 'Work-cycle duration (minutes)',
                    description:
                        'Passing the threshold turns elapsed time red; seamless task switches keep the cycle.',
                    action: {
                        type: 'input',
                        placeholder: '45',
                        defaultValue: '45',
                        onChange: event => {
                            extensionAPI.settings.set(
                                SETTING_POMODORO_MINUTES,
                                normalizePositiveMinutes(event)
                            );
                            topbar.refresh();
                        },
                    },
                },
                {
                    id: SETTING_STALE_HOURS,
                    name: 'Forgotten timer warning (hours)',
                    description: 'How long a clock may run before it is called out as forgotten.',
                    action: {
                        type: 'input',
                        placeholder: '1.5',
                        defaultValue: '1.5',
                        onChange: event => {
                            extensionAPI.settings.set(
                                SETTING_STALE_HOURS,
                                normalizePositiveHours(event)
                            );
                            topbar.refresh();
                        },
                    },
                },
            ],
        });
    };

    const registerCommands = () => {
        const add = (label, callback) =>
            extensionAPI.ui.commandPalette.addCommand({ label, callback });

        // Remove labels from a previously loaded beta before registering the
        // smaller surface. This also makes manual hot reloads deterministic if
        // the host skipped the prior controller's unload callback.
        for (const label of RETIRED_PALETTE_COMMANDS) {
            try {
                extensionAPI.ui.commandPalette.removeCommand({ label });
            } catch {
                // Not registered in this host session.
            }
        }

        add(PALETTE_COMMANDS[0], clockInFocused);
        add(PALETTE_COMMANDS[1], () => guard(() => clock.clockOutAll()));
        add(PALETTE_COMMANDS[2], () => dashboard.open());

        window.roamAlphaAPI.ui.blockContextMenu.addCommand({
            label: CONTEXT_CLOCK_IN,
            'display-conditional': canClockIn,
            callback: context => guard(() => clock.clockIn(context['block-uid'])),
        });
        window.roamAlphaAPI.ui.blockContextMenu.addCommand({
            label: CONTEXT_CLOCK_OUT,
            'display-conditional': context => clock.isBlockRunning(context?.['block-uid']),
            callback: context => guard(() => clock.clockOutBlock(context['block-uid'])),
        });
    };

    return {
        init() {
            setExtensionAPI(extensionAPI);
            initializeDefaultOnSwitches();
            timingLineSidebar = createTimingLineSidebarFronting({ onNotice: notifyUser });
            detachTimingLineSidebar = clock.subscribeClockInIntents(
                timingLineSidebar.handleAction
            );
            injectStyles(STYLE_ID, STYLES);
            registerSettings();
            registerCommands();
            pomodoro.load();
            detachPomodoro = pomodoro.attach();
            detachCompletion = attachCompletionHandling({
                onResult: result => presentMutationResult(result, notifyUser),
            });
            topbar.mount();
            // The graph is the source of truth, so a reload picks any clock left
            // running — including one abandoned days ago — straight back up.
            clock.refresh();
            const snapshot = clock.getEntriesSnapshot();
            if (snapshot.filter(entry => entry.running).length > 1) {
                void clock.reconcileOpenClocks({ entries: snapshot });
            }
            // Cache warmup is an optional performance hint, not startup work.
            // A task boundary keeps even a synchronous host getWindows() call
            // out of mount and its microtask checkpoint.
            sidebarWarmupTimer = setTimeout(() => {
                sidebarWarmupTimer = null;
                if (!destroyed) void warmRightSidebarWindowCache();
            }, 0);
        },
        destroy() {
            if (destroyed) return;
            destroyed = true;
            if (sidebarWarmupTimer !== null) clearTimeout(sidebarWarmupTimer);
            sidebarWarmupTimer = null;
            confirmation.reset();
            detachTimingLineSidebar?.();
            detachTimingLineSidebar = null;
            timingLineSidebar?.dispose();
            timingLineSidebar = null;
            detachCompletion?.();
            detachCompletion = null;
            detachPomodoro?.();
            detachPomodoro = null;
            pomodoro.reset();
            topbar.unmount();
            dashboard.destroy();
            clock.reset();
            removeStyles(STYLE_ID);
            for (const label of [CONTEXT_CLOCK_IN, CONTEXT_CLOCK_OUT]) {
                try {
                    window.roamAlphaAPI.ui.blockContextMenu.removeCommand({ label });
                } catch (error) {
                    console.error('[roam-logbook] could not remove context command', error);
                }
            }
            // Palette commands added through extensionAPI are cleaned up by Roam,
            // but removing them keeps a hot reload from leaving duplicates behind.
            for (const label of [...PALETTE_COMMANDS, ...RETIRED_PALETTE_COMMANDS]) {
                try {
                    extensionAPI.ui.commandPalette.removeCommand({ label });
                } catch {
                    // Already gone.
                }
            }
            setExtensionAPI(null);
        },
    };
}

let controller = null;

export default {
    version: PLUGIN_VERSION,
    onload: ({ extensionAPI }) => {
        controller?.destroy();
        controller = createController({ extensionAPI });
        controller.init();
    },
    onunload: () => {
        controller?.destroy();
        controller = null;
    },
};
