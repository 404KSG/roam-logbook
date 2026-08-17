import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

import {
    activeWorkDisplayTitle,
    buildSessionSurfaceModel,
    renderSessionSurface,
} from '../src/session-surface.js';

test('Active Work display titles preserve page and tag references while removing presentation markup', () => {
    assert.equal(
        activeWorkDisplayTitle({
            taskString:
                '{{[[TODO]]}} **Build** [[Roam Logbook]] Sessions #[[Deep Work]] {{[[POMO]]}} ((abcdefghi))',
            title: 'Build Roam Logbook Sessions Deep Work',
            taskUid: 'task-title-01',
        }),
        'Build [[Roam Logbook]] Sessions #[[Deep Work]]'
    );
});

test('Active Work display titles use the existing normalized title and UID fallbacks', () => {
    assert.equal(
        activeWorkDisplayTitle({ taskString: null, title: 'Existing title', taskUid: 'task-title-02' }),
        'Existing title'
    );
    assert.equal(
        activeWorkDisplayTitle({ taskString: '{{[[DONE]]}} {{[[POMO]]}}', title: '', taskUid: 'task-title-03' }),
        'task-title-03'
    );
});

test('Timing and Parallel Thread buttons expose the same bracket-preserving visible and accessible titles', () => {
    const dom = new JSDOM('<!doctype html><html><body><div id="surface"></div></body></html>');
    globalThis.document = dom.window.document;
    const now = new Date('2026-08-17T10:10:00');
    const timing = {
        clockUid: 'clock-title-01',
        taskUid: 'task-title-01',
        taskString: '{{[[TODO]]}} **Build** [[Roam Logbook]] #[[Deep Work]]',
        title: 'Build Roam Logbook Deep Work',
        start: new Date('2026-08-17T10:00:00'),
        end: null,
        priorMinutes: 0,
    };
    const openLine = {
        clockUid: 'clock-title-02',
        taskUid: 'task-title-02',
        taskString: '{{[[DONE]]}} __Review__ [[Sidebar]] {{[[POMO]]}}',
        title: 'Review Sidebar',
        status: 'DONE',
        start: new Date('2026-08-17T09:00:00'),
        end: new Date('2026-08-17T10:05:00'),
        minutes: 65,
        priorMinutes: 65,
    };
    const root = document.getElementById('surface');
    const model = buildSessionSurfaceModel({ entries: [timing], recentItems: [openLine], now });
    assert.equal(model.recentRows[0].status, 'DONE', 'surface rows carry the confirmed task status');
    renderSessionSurface(
        root,
        model,
        {}
    );

    const titles = [...root.querySelectorAll('.rlb-run__title')];
    assert.deepEqual(
        titles.map(node => node.textContent),
        ['Build [[Roam Logbook]] #[[Deep Work]]', 'Review [[Sidebar]]']
    );
    assert.deepEqual(
        titles.map(node => node.getAttribute('aria-label')),
        [
            'Open this block: Build [[Roam Logbook]] #[[Deep Work]]',
            'Open this block: Review [[Sidebar]]',
        ]
    );
    assert.equal(root.querySelectorAll('.rlb-run__title a').length, 0);
    assert.ok(titles.every(node => node.tagName === 'BUTTON'));

    const completed = root.querySelector('.rlb-run--recent .rlb-run__completed');
    assert.ok(completed, 'a DONE Parallel Thread exposes a completed status indicator');
    assert.equal(completed.tagName, 'SPAN');
    assert.equal(completed.getAttribute('role'), 'img');
    assert.equal(completed.title, 'Completed');
    assert.equal(completed.getAttribute('aria-label'), 'Completed');
    assert.equal(completed.dataset.action, undefined);
    assert.equal(root.querySelector('.rlb-run--recent [data-action="focus-recent"]'), null);

    dom.window.close();
    delete globalThis.document;
});

test('TODO Parallel Threads keep an interactive focus action while DONE ones do not', () => {
    const dom = new JSDOM('<!doctype html><html><body><div id="surface"></div></body></html>');
    globalThis.document = dom.window.document;
    const root = document.getElementById('surface');
    let focusCalls = 0;
    const todo = {
        clockUid: 'clock-title-03',
        taskUid: 'task-title-03',
        taskString: '{{[[TODO]]}} Continue [[Sidebar]]',
        title: 'Continue Sidebar',
        status: 'TODO',
        start: new Date('2026-08-17T09:00:00'),
        end: new Date('2026-08-17T10:05:00'),
        minutes: 65,
    };

    renderSessionSurface(
        root,
        buildSessionSurfaceModel({ recentItems: [todo], now: new Date('2026-08-17T10:10:00') }),
        { onFocusRecent: () => { focusCalls += 1; } }
    );

    const focus = root.querySelector('[data-action="focus-recent"]');
    assert.ok(focus, 'a TODO Parallel Thread keeps the focus action');
    focus.click();
    assert.equal(focusCalls, 1);
    assert.equal(root.querySelector('.rlb-run__completed'), null);

    dom.window.close();
    delete globalThis.document;
});
