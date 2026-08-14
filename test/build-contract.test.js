import test from 'node:test';
import assert from 'node:assert/strict';

test('the checked-in ESM bundle exposes Roam Depot lifecycle hooks', async () => {
    const extension = (await import(`../extension.js?contract=${Date.now()}`)).default;

    assert.equal(typeof extension?.onload, 'function');
    assert.equal(typeof extension?.onunload, 'function');
});
