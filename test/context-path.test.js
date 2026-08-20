import assert from 'node:assert/strict';
import test from 'node:test';

import {
    contextPathFromHierarchy,
    contextPathsFromHierarchy,
    normalizeContextPath,
} from '../src/context-path.js';

test('context paths contain every physical block ancestor and stop before the page', () => {
    const hierarchy = {
        parentOf: {
            task: 'done-parent',
            'done-parent': 'todo-parent',
            'todo-parent': 'plain-context',
        },
        stringOf: {
            'done-parent': '{{[[DONE]]}} Finished branch',
            'todo-parent': '{{[[TODO]]}} Project branch',
            'plain-context': '03 - Daily Tasks',
        },
    };

    const path = contextPathFromHierarchy('task', hierarchy);
    assert.deepEqual(path.map(segment => segment.uid), [
        'plain-context',
        'todo-parent',
        'done-parent',
    ]);
    assert.deepEqual(path.map(segment => segment.string), [
        '03 - Daily Tasks',
        '{{[[TODO]]}} Project branch',
        '{{[[DONE]]}} Finished branch',
    ]);
    assert.equal(path.some(segment => segment.uid === 'daily-page'), false);
});

test('context path batches preserve empty paths and sanitize malformed segments', () => {
    const paths = contextPathsFromHierarchy(['root', 'leaf', ''], {
        parentOf: { leaf: 'root' },
        stringOf: { root: 'Plain context' },
    });

    assert.deepEqual(paths.get('root'), []);
    assert.deepEqual(paths.get('leaf'), [{ uid: 'root', string: 'Plain context' }]);
    assert.equal(paths.has(''), false);
    assert.deepEqual(
        normalizeContextPath([
            { uid: 'ok', string: 'Kept' },
            { uid: '', string: 'Dropped' },
            null,
        ]),
        [{ uid: 'ok', string: 'Kept' }]
    );
});

test('a pure reference keeps its physical chain while exposing the canonical task target', () => {
    const path = contextPathFromHierarchy('child', {
        physicalParentOf: {
            child: 'mirror',
            mirror: 'daily-section',
        },
        physicalStringOf: {
            mirror: '((canonical-task))',
            'daily-section': '03 - Daily Tasks',
        },
        canonicalUidOf: { mirror: 'canonical-task' },
        canonicalStringOf: {
            mirror: '{{[[TODO]]}} Canonical task',
        },
    });

    assert.deepEqual(path, [
        { uid: 'daily-section', string: '03 - Daily Tasks' },
        { uid: 'canonical-task', string: '{{[[TODO]]}} Canonical task', sourceUid: 'mirror' },
    ]);
});
