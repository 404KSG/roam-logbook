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
    staleHours,
    todoBlocksOnly,
} from '../src/settings.js';

const withValue = value => {
    setExtensionAPI({ settings: { get: () => value } });
};

test('switch getters normalize Roam boolean storage shapes consistently', () => {
    for (const value of [true, 'true', 1, '1']) {
        withValue(value);
        assert.equal(allowMultipleClocks(), true);
        assert.equal(showTopbarWidget(), true);
        assert.equal(todoBlocksOnly(), true);
        assert.equal(keepTimingLineAtTopOfRightSidebar(), true);
    }

    for (const value of [false, 'false', 0, '0']) {
        withValue(value);
        assert.equal(allowMultipleClocks(), false);
        assert.equal(showTopbarWidget(), false);
        assert.equal(todoBlocksOnly(), false);
        assert.equal(keepTimingLineAtTopOfRightSidebar(), false);
    }
});

test('missing switch values use each setting default', () => {
    setExtensionAPI({ settings: { get: () => undefined } });
    assert.equal(allowMultipleClocks(), false);
    assert.equal(showTopbarWidget(), true);
    assert.equal(todoBlocksOnly(), true);
    assert.equal(keepTimingLineAtTopOfRightSidebar(), true);
});

test('unfinished-clock hours keep the existing storage key, values, and default', () => {
    assert.equal(SETTING_STALE_HOURS, 'staleHours');
    for (const value of ['2', '4', '8', '12', '24']) {
        withValue(value);
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

    assert.deepEqual(writes, [
        [SETTING_TOPBAR, true],
        [SETTING_TODO_ONLY, true],
        [SETTING_TIMING_LINE_SIDEBAR, true],
    ]);
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
