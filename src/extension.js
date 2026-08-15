/**
 * Roam Logbook — org-mode clock tracking for Roam TODOs.
 *
 * Right-click a TODO bullet to clock in; the topbar shows the live session and
 * the dashboard adds it up. Entries live in the graph as an org LOGBOOK drawer,
 * which is also how a running clock survives a reload.
 */

import * as clock from './clock.js';
import { createDashboard } from './dashboard.js';
import { injectStyles, removeStyles } from './dom.js';
import { getBlockString, getFocusedBlockUid } from './roam.js';
import { isTaskBlock } from './org.js';
import * as pomodoro from './pomodoro.js';
import * as paused from './paused.js';
import {
    normalizeChecked,
    normalizePositiveMinutes,
    normalizeSelected,
    setExtensionAPI,
    SETTING_MULTIPLE,
    SETTING_POMODORO_MINUTES,
    SETTING_STALE_HOURS,
    SETTING_TODO_ONLY,
    SETTING_TOPBAR,
    todoBlocksOnly,
} from './settings.js';
import { STYLES, STYLE_ID } from './styles.js';
import { createTopbar } from './topbar.js';
import { PLUGIN_VERSION } from './version.js';

const CONTEXT_CLOCK_IN = 'Logbook: Clock in';
const CONTEXT_CLOCK_OUT = 'Logbook: Clock out';

const PALETTE_COMMANDS = [
    'Logbook: Clock in current block',
    'Logbook: Clock out current block',
    'Logbook: Clock out all running clocks',
    'Logbook: Open dashboard',
    'Logbook: Check for unfinished clocks',
];

function createController({ extensionAPI }) {
    const dashboard = createDashboard();
    const topbar = createTopbar({ onOpenDashboard: trigger => dashboard.open({ returnFocusTo: trigger }) });
    let destroyed = false;
    let detachPomodoro = null;

    /** Task text of the block a menu entry was opened on, following references. */
    const targetString = context => {
        const uid = clock.resolveTaskUid(context?.['block-uid']);
        return getBlockString(uid) ?? context?.['block-string'] ?? '';
    };

    const canClockIn = context => {
        const uid = context?.['block-uid'];
        if (!uid || clock.isBlockRunning(uid)) return false;
        return todoBlocksOnly() ? isTaskBlock(targetString(context)) : true;
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
            await action();
        } catch (error) {
            console.error('[roam-logbook]', error);
            notifyUser(error?.message || 'Logbook could not complete that action.');
        }
    };

    const clockInFocused = () =>
        guard(async () => {
            const uid = getFocusedBlockUid();
            if (!uid) {
                notifyUser('No focused block. Select a block before clocking in.');
                return;
            }
            await clock.clockIn(uid);
        });

    const registerSettings = () => {
        extensionAPI.settings.panel.create({
            tabTitle: 'Logbook',
            settings: [
                {
                    id: SETTING_TOPBAR,
                    name: 'Show topbar widget',
                    description: 'The live counter and its running Session list in Roam’s left navigation.',
                    action: {
                        type: 'switch',
                        defaultValue: true,
                        onChange: event => {
                            extensionAPI.settings.set(SETTING_TOPBAR, normalizeChecked(event));
                            topbar.refresh();
                        },
                    },
                },
                {
                    id: SETTING_TODO_ONLY,
                    name: 'Only offer clock in on TODO blocks',
                    description: 'Turn off to clock any block, not just TODO/DONE ones.',
                    action: {
                        type: 'switch',
                        defaultValue: true,
                        onChange: event =>
                            extensionAPI.settings.set(SETTING_TODO_ONLY, normalizeChecked(event)),
                    },
                },
                {
                    id: SETTING_MULTIPLE,
                    name: 'Allow multiple clocks at once',
                    description:
                        'Off (org-mode behaviour): clocking in closes the running clock. On: several tasks run in parallel.',
                    action: {
                        type: 'switch',
                        defaultValue: false,
                        onChange: event =>
                            extensionAPI.settings.set(SETTING_MULTIPLE, normalizeChecked(event)),
                    },
                },
                {
                    id: SETTING_POMODORO_MINUTES,
                    name: 'Pomodoro duration (minutes)',
                    description:
                        'Every new Session receives this target. Passing it turns elapsed time red; the clock keeps running.',
                    action: {
                        type: 'input',
                        placeholder: '30',
                        defaultValue: '30',
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
                    name: 'Flag unfinished clocks after',
                    description: 'How long a clock may run before it is called out as forgotten.',
                    action: {
                        type: 'select',
                        items: ['2', '4', '8', '12', '24'],
                        defaultValue: '8',
                        onChange: event => {
                            extensionAPI.settings.set(SETTING_STALE_HOURS, normalizeSelected(event));
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

        add(PALETTE_COMMANDS[0], clockInFocused);
        add(PALETTE_COMMANDS[1], () =>
            guard(async () => {
                const uid = getFocusedBlockUid();
                if (!uid) {
                    notifyUser('No focused block. Select a block before clocking out.');
                    return;
                }
                await clock.clockOutBlock(uid);
            })
        );
        add(PALETTE_COMMANDS[2], () => guard(() => paused.clockOutAll()));
        add(PALETTE_COMMANDS[3], () => dashboard.open());
        add(PALETTE_COMMANDS[4], () => {
            clock.refresh();
            dashboard.open();
        });

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
            injectStyles(STYLE_ID, STYLES);
            registerSettings();
            registerCommands();
            pomodoro.load();
            paused.load();
            detachPomodoro = pomodoro.attach();
            topbar.mount();
            // The graph is the source of truth, so a reload picks any clock left
            // running — including one abandoned days ago — straight back up.
            clock.refresh();
        },
        destroy() {
            if (destroyed) return;
            destroyed = true;
            detachPomodoro?.();
            detachPomodoro = null;
            pomodoro.reset();
            topbar.unmount();
            dashboard.destroy();
            clock.reset();
            paused.reset();
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
            for (const label of PALETTE_COMMANDS) {
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
