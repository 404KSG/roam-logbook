import test from 'node:test';
import assert from 'node:assert/strict';

import {
    allowMultipleClocks,
    initializeDefaultOnSwitches,
    keepTimingLineAtTopOfRightSidebar,
    SETTING_MULTIPLE,
    SETTING_POMODORO_MINUTES,
    SETTING_STALE_HOURS,
    SETTING_TIMING_LINE_SIDEBAR,
    SETTING_TODO_ONLY,
    SETTING_TOPBAR,
    setExtensionAPI,
    showTopbarWidget,
    pomodoroMinutes,
    staleHours,
    todoBlocksOnly,
    writeSetting,
} from '../src/settings.js';

const withValues = values => {
    const store = new Map(Object.entries(values));
    setExtensionAPI({ settings: { get: key => store.get(key) } });
};

test('legacy topbar and TODO settings are inert while the current switch remains configurable', () => {
    for (const value of [true, 'true', 1, '1']) {
        withValues({
            [SETTING_MULTIPLE]: value,
            [SETTING_TOPBAR]: value,
            [SETTING_TODO_ONLY]: value,
            [SETTING_TIMING_LINE_SIDEBAR]: value,
        });
        assert.equal(allowMultipleClocks(), true);
        assert.equal(showTopbarWidget(), true);
        assert.equal(todoBlocksOnly(), true);
        assert.equal(keepTimingLineAtTopOfRightSidebar(), true);
    }

    for (const value of [false, 'false', 0, '0']) {
        withValues({
            [SETTING_MULTIPLE]: value,
            [SETTING_TOPBAR]: value,
            [SETTING_TODO_ONLY]: value,
            [SETTING_TIMING_LINE_SIDEBAR]: value,
        });
        assert.equal(allowMultipleClocks(), false);
        assert.equal(showTopbarWidget(), true);
        assert.equal(todoBlocksOnly(), true);
        assert.equal(keepTimingLineAtTopOfRightSidebar(), false);
    }
});

test('missing switch values use each setting default', () => {
    setExtensionAPI({ settings: { get: () => undefined } });
    assert.equal(allowMultipleClocks(), false);
    assert.equal(showTopbarWidget(), true);
    assert.equal(todoBlocksOnly(), true);
    assert.equal(keepTimingLineAtTopOfRightSidebar(), true);
    assert.equal(pomodoroMinutes(), 45);
});

test('unfinished-clock hours keep the existing storage key, values, and default', () => {
    assert.equal(SETTING_STALE_HOURS, 'staleHours');
    for (const value of ['2', '4', '8', '12', '24']) {
        withValues({ [SETTING_STALE_HOURS]: value });
        assert.equal(staleHours(), Number(value));
    }
    setExtensionAPI({ settings: { get: () => undefined } });
    assert.equal(staleHours(), 8);
});

test('default-on switches are persisted only when their keys are missing', () => {
    const values = new Map();
    const writes = [];
    setExtensionAPI({
        settings: {
            get: key => values.get(key),
            set: (key, value) => {
                writes.push([key, value]);
                values.set(key, value);
            },
        },
    });

    initializeDefaultOnSwitches();

    assert.deepEqual(writes, [[SETTING_TIMING_LINE_SIDEBAR, true]]);
    assert.equal(values.has(SETTING_MULTIPLE), false);
    assert.equal(values.has(SETTING_STALE_HOURS), false);
    assert.equal(values.has(SETTING_POMODORO_MINUTES), false);
});

test('default-on switch initialization never overwrites existing boolean or string values', () => {
    const values = new Map([
        [SETTING_TOPBAR, false],
        [SETTING_TODO_ONLY, 'false'],
        [SETTING_TIMING_LINE_SIDEBAR, true],
    ]);
    const writes = [];
    setExtensionAPI({
        settings: {
            get: key => values.get(key),
            set: (key, value) => {
                writes.push([key, value]);
                values.set(key, value);
            },
        },
    });

    initializeDefaultOnSwitches();

    assert.deepEqual(writes, []);
    assert.deepEqual([...values], [
        [SETTING_TOPBAR, false],
        [SETTING_TODO_ONLY, 'false'],
        [SETTING_TIMING_LINE_SIDEBAR, true],
    ]);
});

test('writeSetting reports unavailable and failing settings persistence', () => {
    setExtensionAPI(null);
    assert.equal(writeSetting('missing', 'value'), false);

    setExtensionAPI({ settings: { set: () => { throw new Error('read only'); } } });
    assert.equal(writeSetting('read-only', 'value'), false);

    const writes = [];
    setExtensionAPI({ settings: { set: (key, value) => writes.push([key, value]) } });
    assert.equal(writeSetting('saved', 'value'), true);
    assert.deepEqual(writes, [['saved', 'value']]);
});
