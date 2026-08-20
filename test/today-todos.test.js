import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildTodayTodoTree,
    currentTodayPath,
    dateToPageTitle,
    flattenTodayRows,
} from '../src/today-todos.js';

const todo = (uid, title, children = [], order = 0) => ({
    uid,
    string: `{{[[TODO]]}} ${title}`,
    order,
    children,
});

const plain = (uid, title, children = [], order = 0) => ({ uid, string: title, order, children });

test('Today tree preserves Roam order through plain intermediary blocks', () => {
    const model = buildTodayTodoTree([
        todo('root-a', 'A', [plain('note-a', 'context', [todo('child-a', 'A child', [], 0)])]),
        todo('root-b', 'B', [], 1),
    ]);

    assert.deepEqual(model.roots.map(node => node.uid), ['root-a', 'root-b']);
    assert.deepEqual(model.roots[0].children.map(node => node.uid), ['child-a']);
    assert.equal('hiddenDescendantCount' in model.roots[0], false);
});

test('DONE blocks disappear but unfinished descendants promote to the nearest TODO ancestor', () => {
    const model = buildTodayTodoTree([
        todo('project', 'Project', [
            { uid: 'done-parent', string: '{{[[DONE]]}} Finished parent', order: 0, children: [todo('child', 'Still open')] },
        ]),
        { uid: 'done-root', string: '{{[[DONE]]}} Finished root', order: 1, children: [todo('promoted', 'Promoted')] },
    ]);

    assert.deepEqual(model.roots.map(node => node.uid), ['project', 'promoted']);
    assert.deepEqual(model.roots[0].children.map(node => node.uid), ['child']);
});

test('bare references provide unfinished task context without showing the mirror block', () => {
    const model = buildTodayTodoTree(
        [
            todo('project', 'Project', [
                {
                    uid: 'mirror-1',
                    string: '((target-1))',
                    order: 0,
                    children: [todo('nested', 'Nested task')],
                },
            ]),
        ],
        { referenceStrings: { 'target-1': '{{[[TODO]]}} Referenced task' } }
    );

    assert.deepEqual(model.roots[0].children.map(node => node.uid), ['target-1']);
    assert.equal(model.roots[0].children[0].string, '{{[[TODO]]}} Referenced task');
    assert.deepEqual(model.roots[0].children[0].children.map(node => node.uid), ['nested']);
    assert.deepEqual(
        model.nodes.find(node => node.uid === 'target-1').ancestorPath.map(node => node.uid),
        ['project']
    );
    assert.deepEqual(
        model.nodes.find(node => node.uid === 'nested').ancestorPath.map(node => node.uid),
        ['project', 'target-1']
    );
    assert.equal(model.nodes.some(node => node.uid === 'mirror-1'), false);
});

test('Today nodes expose root-to-parent hierarchy without physical context paths', () => {
    const model = buildTodayTodoTree([
        todo('root-path', 'Root', [
            plain('note-path', 'context', [
                todo('child-path', 'Child', [todo('leaf-path', 'Leaf')]),
            ]),
        ]),
    ]);

    assert.deepEqual(model.nodes.find(node => node.uid === 'root-path').ancestorPath, []);
    assert.equal('contextPath' in model.nodes.find(node => node.uid === 'root-path'), false);
    assert.deepEqual(
        model.nodes.find(node => node.uid === 'child-path').ancestorPath.map(node => node.uid),
        ['root-path']
    );
    assert.deepEqual(
        model.nodes.find(node => node.uid === 'leaf-path').ancestorPath.map(node => node.uid),
        ['root-path', 'child-path']
    );
    assert.ok(model.nodes.every(node => !('contextPath' in node)));
});

test('Today tree keeps physical ancestors structural without exposing breadcrumb metadata', () => {
    const model = buildTodayTodoTree([
        plain('daily-log', '[[Daily Log]]', [
            plain('daily-section', '03 - Daily Tasks', [
                todo('project', 'Project', [
                    {
                        uid: 'done-ancestor',
                        string: '{{[[DONE]]}} Finished branch',
                        order: 0,
                        children: [todo('leaf', 'Leaf')],
                    },
                ]),
            ]),
        ]),
    ]);

    const leaf = model.nodes.find(node => node.uid === 'leaf');
    assert.deepEqual(leaf.ancestorPath.map(node => node.uid), ['project']);
    assert.ok(model.nodes.every(node => !('contextPath' in node)));
});

test('collapse defaults to roots, while the current Timing Line branch is expanded', () => {
    const model = buildTodayTodoTree([todo('root', 'Root', [todo('child', 'Child', [todo('leaf', 'Leaf')])])]);
    assert.deepEqual(flattenTodayRows(model).map(row => row.node.uid), ['root']);

    const path = currentTodayPath(model, 'leaf');
    assert.deepEqual([...path], ['leaf', 'child', 'root']);
    assert.deepEqual(
        flattenTodayRows(model, { currentPath: path }).map(row => row.node.uid),
        ['root', 'child', 'leaf']
    );
    assert.deepEqual(
        flattenTodayRows(model, { expanded: new Set(['root']) }).map(row => row.node.uid),
        ['root', 'child']
    );
});

test('explicit collapse overrides the current Timing Line default and stays keyed to the node', () => {
    const model = buildTodayTodoTree([
        todo('old-root', 'Old root', [todo('old-child', 'Old child')]),
        todo('new-root', 'New root', [todo('new-child', 'New child')], 1),
    ]);
    const oldPath = currentTodayPath(model, 'old-child');
    const newPath = currentTodayPath(model, 'new-child');
    const collapsed = new Set(['old-root']);

    assert.deepEqual(
        flattenTodayRows(model, { currentPath: oldPath }).map(row => row.node.uid),
        ['old-root', 'old-child', 'new-root']
    );
    assert.deepEqual(
        flattenTodayRows(model, { currentPath: oldPath, collapsed }).map(row => row.node.uid),
        ['old-root', 'new-root']
    );
    assert.deepEqual(
        flattenTodayRows(model, { currentPath: newPath, collapsed }).map(row => row.node.uid),
        ['old-root', 'new-root', 'new-child']
    );
    assert.deepEqual(
        flattenTodayRows(model, { currentPath: oldPath, collapsed }).map(row => row.node.uid),
        ['old-root', 'new-root'],
        'switching back keeps the user collapse on the old branch'
    );
});

test('Daily Notes title uses Roam local English ordinal formatting', () => {
    assert.equal(dateToPageTitle(new Date('2026-08-01T12:00:00')), 'August 1st, 2026');
    assert.equal(dateToPageTitle(new Date('2026-08-12T12:00:00')), 'August 12th, 2026');
    assert.equal(dateToPageTitle(new Date('2026-08-23T12:00:00')), 'August 23rd, 2026');
});
