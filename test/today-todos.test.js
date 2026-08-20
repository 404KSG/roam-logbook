import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildTodayTodoTree,
    compactTodayBreadcrumb,
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

test('Today nodes expose root-to-parent ancestor paths and compact long breadcrumbs deterministically', () => {
    const model = buildTodayTodoTree([
        todo('root-path', 'Root', [
            plain('note-path', 'context', [
                todo('child-path', 'Child', [todo('leaf-path', 'Leaf')]),
            ]),
        ]),
    ]);

    assert.deepEqual(model.nodes.find(node => node.uid === 'root-path').ancestorPath, []);
    assert.deepEqual(
        model.nodes.find(node => node.uid === 'child-path').ancestorPath.map(node => node.uid),
        ['root-path']
    );
    assert.deepEqual(
        model.nodes.find(node => node.uid === 'leaf-path').ancestorPath.map(node => node.uid),
        ['root-path', 'child-path']
    );
    assert.deepEqual(compactTodayBreadcrumb([]), []);
    assert.deepEqual(compactTodayBreadcrumb(['A', 'B', 'C']), ['A', 'B', 'C']);
    assert.deepEqual(compactTodayBreadcrumb(['A', 'B', 'C', 'D']), ['A', '…', 'D']);
    assert.deepEqual(compactTodayBreadcrumb(['A', 'B', 'C', 'D', 'E']), ['A', '…', 'E']);
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

test('Daily Notes title uses Roam local English ordinal formatting', () => {
    assert.equal(dateToPageTitle(new Date('2026-08-01T12:00:00')), 'August 1st, 2026');
    assert.equal(dateToPageTitle(new Date('2026-08-12T12:00:00')), 'August 12th, 2026');
    assert.equal(dateToPageTitle(new Date('2026-08-23T12:00:00')), 'August 23rd, 2026');
});
