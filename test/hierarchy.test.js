/**
 * End-to-end cover for the hierarchy read: graph → readHierarchy → buildDashboard.
 *
 * `tree.test.js` feeds `buildTaskForest` a hand-written hierarchy, so it never
 * touches the queries. This does, via the stub, which is the closest thing to a
 * check on those query shapes short of a real graph.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { installGraph, uninstallGraph } from './helpers/graph-stub.js';

installGraph();

const clock = await import('../src/clock.js');
const { readAllEntries, readHierarchy } = await import('../src/entries.js');
const { buildDashboard, flattenForest } = await import('../src/stats.js');

const TODO = title => `{{[[TODO]]}} ${title}`;
const at = (hour, minute = 0) => new Date(2026, 7, 8, hour, minute);

async function logSession(uid, fromHour, toHour) {
    await clock.clockIn(uid, { now: at(fromHour) });
    await clock.clockOut(clock.getRunning()[0].clockUid, { now: at(toHour) });
}

/** The dashboard tree as `[title, depth, own, total]`, easy to assert on. */
function treeOf() {
    const entries = readAllEntries();
    const hierarchy = readHierarchy([...new Set(entries.map(entry => entry.taskUid))]);
    const model = buildDashboard(entries, { now: at(20), rangeId: 'all', hierarchy });
    return {
        rows: flattenForest(model.tree).map(node => [node.title, node.depth, node.own, node.total]),
        headline: model.totalMinutes,
    };
}

test.after(() => uninstallGraph());

test('real sub-task nesting rolls up through a plain intermediate block', async () => {
    installGraph([
        { uid: 'project001', string: TODO('发布 v1'), parent: null },
        { uid: 'note000001', string: '一些说明文字', parent: 'project001' },
        { uid: 'taskdoc001', string: TODO('写文档'), parent: 'note000001' },
        { uid: 'taskpack01', string: TODO('打包'), parent: 'project001' },
    ]);
    clock.refresh();

    await logSession('project001', 9, 10);
    await logSession('taskdoc001', 10, 12);
    await logSession('taskpack01', 13, 14);

    const { rows, headline } = treeOf();
    assert.deepEqual(rows, [
        ['发布 v1', 0, 60, 240],
        ['写文档', 1, 120, 120],
        ['打包', 1, 60, 60],
    ]);
    // The headline counts each session once, unlike the overlapping tree totals.
    assert.equal(headline, 240);
});

test('a sub-task that is only a block reference rolls up to its parent', async () => {
    installGraph([
        { uid: 'project001', string: TODO('发布 v1'), parent: null },
        { uid: 'mirror0001', string: '((taskdoc001))', parent: 'project001' },
        { uid: 'taskdoc001', string: TODO('写文档'), parent: null },
    ]);
    clock.refresh();

    // Clocked on the mirror, which resolves to the original at write time.
    await logSession('mirror0001', 10, 12);

    const drawerParent = installedParentOfDrawer();
    assert.equal(drawerParent, 'taskdoc001', 'the drawer belongs on the original block');

    const { rows } = treeOf();
    assert.deepEqual(rows, [
        ['发布 v1', 0, 0, 120],
        ['写文档', 1, 120, 120],
    ]);
});

test('a block that merely mentions a task does not adopt it', async () => {
    installGraph([
        { uid: 'project001', string: TODO('发布 v1'), parent: null },
        { uid: 'mention001', string: '记得跟进 ((taskdoc001)) 这件事', parent: 'project001' },
        { uid: 'taskdoc001', string: TODO('写文档'), parent: null },
    ]);
    clock.refresh();

    await logSession('taskdoc001', 10, 12);

    // Prose that happens to link the task is not a claim of ownership.
    const { rows } = treeOf();
    assert.deepEqual(rows, [['写文档', 0, 120, 120]]);
});

test('tasks with no relationship stay as separate roots', async () => {
    installGraph([
        { uid: 'taskone001', string: TODO('一'), parent: null },
        { uid: 'tasktwo001', string: TODO('二'), parent: null },
    ]);
    clock.refresh();

    await logSession('taskone001', 9, 10);
    await logSession('tasktwo001', 10, 12);

    const { rows } = treeOf();
    assert.deepEqual(rows, [
        ['二', 0, 120, 120],
        ['一', 0, 60, 60],
    ]);
});

/** Which block the freshly created LOGBOOK drawer ended up under. */
function installedParentOfDrawer() {
    const [entry] = readAllEntries();
    return entry?.taskUid ?? null;
}
