import test from 'node:test';
import assert from 'node:assert/strict';

import {
    allowMultipleClocks,
    setExtensionAPI,
    showTopbarWidget,
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
    }

    for (const value of [false, 'false', 0, '0']) {
        withValue(value);
        assert.equal(allowMultipleClocks(), false);
        assert.equal(showTopbarWidget(), false);
        assert.equal(todoBlocksOnly(), false);
    }
});

test('missing switch values use each setting default', () => {
    setExtensionAPI({ settings: { get: () => undefined } });
    assert.equal(allowMultipleClocks(), false);
    assert.equal(showTopbarWidget(), true);
    assert.equal(todoBlocksOnly(), true);
});

