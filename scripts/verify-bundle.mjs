import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const committedBundle = join(root, 'extension.js');
const temporaryRoot = await mkdtemp(join(tmpdir(), 'roam-logbook-bundle-'));
const generatedBundle = join(temporaryRoot, 'extension.js');

try {
    await access(committedBundle);
    await run(process.execPath, ['build.js', `--outfile=${generatedBundle}`], { cwd: root });
    const [committed, generated] = await Promise.all([
        readFile(committedBundle),
        readFile(generatedBundle),
    ]);
    if (!committed.equals(generated)) {
        throw new Error('extension.js is out of sync with src/. Run npm run build and commit the result.');
    }
    console.log('Bundle is byte-for-byte synchronized.');
} finally {
    await rm(temporaryRoot, { recursive: true, force: true });
}
