import test from 'node:test';
import assert from 'node:assert/strict';

import {
    allowMultipleClocks,
    keepTimingLineAtTopOfRightSidebar,
    SETTING_STALE_HOURS,
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
