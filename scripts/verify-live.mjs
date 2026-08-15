/**
 * Run the extension's read path against a real graph, via the official Roam CLI.
 *
 * The test suite's graph stub answers queries by *shape* — it never runs datalog,
 * so a query it happily satisfies can still be wrong or empty against Roam. This
 * script closes that gap: it swaps in a `roamAlphaAPI.q` that shells out to the
 * CLI, then runs the real `entries.js` / `stats.js` and prints what the dashboard
 * would show.
 *
 * Uses `@roam-research/roam-cli@0.10.0 datalog-query`, which executes the same
 * Datalog language as Roam's `roamAlphaAPI.data.q`. No graph writes are made.
 *
 *   npm run verify:live
 */

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const src = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const graph = process.env.RLB_ROAM_GRAPH || 'exuberantia';
const roamCli = '@roam-research/roam-cli@0.10.0';
let queryCount = 0;

globalThis.window = {
    roamAlphaAPI: {
        data: {
            q(datalog, ...args) {
                queryCount += 1;
                const argv = ['-y', roamCli, 'datalog-query', '--query', datalog];
                if (args.length > 0) argv.push('--inputs', JSON.stringify(args));
                argv.push('--graph', graph);
                const output = execFileSync('npx', argv, { encoding: 'utf8', maxBuffer: 64e6 });
                return JSON.parse(output);
            },
        },
    },
};

const { readAllEntries, readHierarchy } = await import(`${src}/entries.js`);
const { buildDashboard, flattenForest } = await import(`${src}/stats.js`);
const { formatMinutesHuman } = await import(`${src}/time.js`);

const entries = readAllEntries();
console.log(`${entries.length} clock entries`);
for (const entry of entries) {
    const worth = entry.running ? 'running' : formatMinutesHuman(entry.minutes);
    console.log(`  ${entry.taskUid}  ${worth.padStart(8)}  ${entry.title}`);
}

if (entries.length === 0) {
    console.log('\nNothing logged yet — clock something in Roam first.');
    process.exit(0);
}

const taskUids = [...new Set(entries.map(entry => entry.taskUid))];
const hierarchy = readHierarchy(taskUids);

// An empty parentOf here means the ancestor walk found nothing, which is the
// failure mode the stub cannot reproduce.
console.log(`\nparentOf   ${JSON.stringify(hierarchy.parentOf)}`);
console.log(`mirrorsOf  ${JSON.stringify(hierarchy.mirrorsOf)}`);

const model = buildDashboard(entries, { now: new Date(), rangeId: 'all', hierarchy });

console.log('\nBy task');
for (const node of flattenForest(model.tree)) {
    const indent = '  '.repeat(node.depth) + (node.depth > 0 ? '└ ' : '');
    const badge = node.occurrences > 1 ? ` ×${node.occurrences}` : '';
    const box = node.status === 'DONE' ? '[x]' : node.status === 'TODO' ? '[ ]' : '   ';
    console.log(
        `  ${indent}${box} ${node.title}${badge}` +
            `   own ${formatMinutesHuman(node.own)} / total ${formatMinutesHuman(node.total)}`
    );
}

console.log(
    `\nheadline ${formatMinutesHuman(model.totalMinutes)} across ${model.tasks.length} tasks` +
        `  (${queryCount} queries)`
);
