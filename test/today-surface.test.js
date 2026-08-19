import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

import { buildSessionSurfaceModel, renderSessionSurface } from '../src/session-surface.js';
import { buildTodayTodoTree, flattenTodayRows } from '../src/today-todos.js';

const mount = () => {
    const dom = new JSDOM('<!doctype html><html><body><div id="surface"></div></body></html>');
    globalThis.document = dom.window.document;
    return { dom, root: document.getElementById('surface') };
};

const unmount = dom => {
    dom.window.close();
    delete globalThis.document;
};

test('Today view switches in place, collapses hierarchy, and exposes icon-only Play', () => {
    const { dom, root } = mount();
    const tree = buildTodayTodoTree([
        {
            uid: 'root-1',
            string: '{{[[TODO]]}} Project',
            order: 0,
            children: [{ uid: 'child-1', string: '{{[[TODO]]}} Child', order: 0, children: [] }],
        },
    ]);
    const model = { ...tree, status: 'success' };
    let switched = null;
    let started = null;
    renderSessionSurface(
        root,
        buildSessionSurfaceModel({ now: new Date('2026-08-19T10:00:00') }),
        {
            view: 'today',
            todayModel: model,
            todayRows: flattenTodayRows(model),
            onSwitchView: view => { switched = view; },
            onStartToday: uid => { started = uid; },
            onOpenTask: () => {},
        }
    );

    assert.equal(root.querySelector('[data-view="today"]')?.getAttribute('aria-pressed'), 'true');
    assert.equal(root.querySelector('[data-view="threads"]')?.textContent, 'Threads · 0');
    assert.equal(root.querySelector('[data-view="today"]')?.textContent, 'Today · 2');
    assert.equal(root.querySelectorAll('.rlb-today__row').length, 1);
    assert.equal(root.querySelector('.rlb-today__hidden-count')?.textContent, '+1');
    assert.equal(root.querySelector('.rlb-today__play')?.getAttribute('aria-label'), 'Start timing Project');
    root.querySelector('.rlb-today__play').click();
    assert.equal(started, 'root-1');
    root.querySelector('[data-view="threads"]').click();
    assert.equal(switched, 'threads');

    unmount(dom);
});

test('Today current Timing Line branch is expanded and its indicator is non-interactive', () => {
    const { dom, root } = mount();
    const tree = buildTodayTodoTree([
        {
            uid: 'root-2',
            string: '{{[[TODO]]}} Project',
            order: 0,
            children: [{ uid: 'child-2', string: '{{[[TODO]]}} Child', order: 0, children: [] }],
        },
    ]);
    const model = { ...tree, status: 'success' };
    renderSessionSurface(
        root,
        buildSessionSurfaceModel({ now: new Date('2026-08-19T10:00:00') }),
        {
            view: 'today',
            todayModel: model,
            todayRows: flattenTodayRows(model, { currentPath: new Set(['child-2', 'root-2']) }),
            currentTaskUid: 'child-2',
            onSwitchView: () => {},
            onOpenTask: () => {},
        }
    );

    assert.deepEqual(
        [...root.querySelectorAll('.rlb-today__row')].map(row => row.dataset.taskUid),
        ['root-2', 'child-2']
    );
    const indicator = root.querySelector('.rlb-today__timing');
    assert.ok(indicator);
    assert.equal(indicator.getAttribute('aria-label'), 'Currently timing');
    assert.equal(indicator.dataset.action, undefined);
    assert.equal(root.querySelector('[data-task-uid="child-2"] [data-action="today-play"]'), null);

    unmount(dom);
});
