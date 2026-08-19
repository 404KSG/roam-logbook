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
    assert.equal(root.querySelector('.rlb-today__hidden-count'), null);
    assert.equal(root.querySelector('.rlb-today__toggle')?.title, 'Expand sub-tasks');
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
            todayExpanded: new Set(),
            currentTaskUid: 'child-2',
            onSwitchView: () => {},
            onToggleAllToday: () => {},
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
    const toggle = root.querySelector('[data-action="today-toggle-all"]');
    assert.equal(toggle.title, 'Collapse all Today tasks');
    assert.equal(toggle.getAttribute('aria-label'), 'Collapse all Today tasks');
    assert.equal(toggle.getAttribute('aria-expanded'), 'true');
    assert.ok(toggle.classList.contains('bp3-icon-collapse-all'));

    unmount(dom);
});

test('Today exposes one stateful accessible bulk tree toggle only for expandable trees', () => {
    const { dom, root } = mount();
    const tree = buildTodayTodoTree([
        {
            uid: 'root-3',
            string: '{{[[TODO]]}} Project',
            order: 0,
            children: [
                {
                    uid: 'child-3',
                    string: '{{[[TODO]]}} Child',
                    order: 0,
                    children: [
                        { uid: 'grandchild-3', string: '{{[[TODO]]}} Grandchild', order: 0, children: [] },
                    ],
                },
            ],
        },
    ]);
    const model = { ...tree, status: 'success' };
    let toggled = 0;
    let expanded = new Set();
    const render = () => renderSessionSurface(
        root,
        buildSessionSurfaceModel({ now: new Date('2026-08-19T10:00:00') }),
        {
            view: 'today',
            todayModel: model,
            todayExpanded: expanded,
            todayRows: flattenTodayRows(model, { expanded }),
            onSwitchView: () => {},
            onToggleAllToday: () => { toggled += 1; },
            onOpenTask: () => {},
        }
    );
    render();

    let toggle = root.querySelector('[data-action="today-toggle-all"]');
    assert.equal(root.querySelectorAll('[data-action="today-toggle-all"]').length, 1);
    assert.ok(toggle);
    assert.equal(root.querySelector('.rlb-today__controls'), null);
    assert.equal(toggle.title, 'Expand all Today tasks');
    assert.equal(toggle.getAttribute('aria-label'), 'Expand all Today tasks');
    assert.equal(toggle.getAttribute('aria-expanded'), 'false');
    assert.equal(toggle.getAttribute('aria-controls'), 'rlb-today-tree');
    assert.equal(toggle.classList.contains('bp3-icon-expand-all'), true);
    toggle.click();
    assert.equal(toggled, 1);

    expanded = new Set(model.nodes.filter(node => node.children.length > 0).map(node => node.uid));
    render();
    toggle = root.querySelector('[data-action="today-toggle-all"]');
    assert.equal(root.querySelectorAll('[data-action="today-toggle-all"]').length, 1);
    assert.equal(toggle.title, 'Collapse all Today tasks');
    assert.equal(toggle.getAttribute('aria-label'), 'Collapse all Today tasks');
    assert.equal(toggle.getAttribute('aria-expanded'), 'true');
    assert.equal(toggle.classList.contains('bp3-icon-collapse-all'), true);
    assert.equal(toggle.classList.contains('bp3-icon-expand-all'), false);
    toggle.click();
    assert.equal(toggled, 2);

    renderSessionSurface(
        root,
        buildSessionSurfaceModel({ now: new Date('2026-08-19T10:00:00') }),
        {
            view: 'threads',
            todayModel: model,
            onSwitchView: () => {},
        }
    );
    assert.equal(root.querySelector('[data-action="today-toggle-all"]'), null);

    unmount(dom);
});
