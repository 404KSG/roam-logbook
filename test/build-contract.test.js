import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('the checked-in ESM bundle exposes Roam Depot lifecycle hooks', async () => {
    const extension = (await import(`../extension.js?contract=${Date.now()}`)).default;

    assert.equal(typeof extension?.onload, 'function');
    assert.equal(typeof extension?.onunload, 'function');
});

test('the bundle has no breadcrumb renderer or context-path module dependency', async () => {
    const bundle = await readFile(new URL('../extension.js', import.meta.url), 'utf8');

    assert.doesNotMatch(
        bundle,
        /context-path|contextPath|rlb-context-breadcrumb|rlb-run--with-context|rlb-today__breadcrumb/
    );
});
