import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

test('CI runs a pinned actionlint container in addition to the local static contract', async () => {
    const workflow = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');

    assert.match(workflow, /actionlint:\s*\n\s+runs-on:\s+ubuntu-latest/);
    assert.match(workflow, /uses:\s*docker:\/\/rhysd\/actionlint:1\.7\.7/);
    assert.match(workflow, /args:\s*-color/);

    const result = spawnSync(process.execPath, ['scripts/verify-workflow.mjs'], {
        cwd: new URL('..', import.meta.url),
        encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /actionlint/i);
});
