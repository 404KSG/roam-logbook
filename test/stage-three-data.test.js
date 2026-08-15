import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { installGraph, uninstallGraph } from './helpers/graph-stub.js';

const { parseTimestamp } = await import('../src/time.js');
const { parseClockLineDetailed } = await import('../src/org.js');
const { readAllEntries } = await import('../src/entries.js');
const { buildDashboard } = await import('../src/stats.js');
const { createDashboard } = await import('../src/dashboard.js');
const { setExtensionAPI } = await import('../src/settings.js');

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;

const settingsStore = new Map();
const extensionAPI = {
    settings: {
        get: key => settingsStore.get(key),
        set: (key, value) => settingsStore.set(key, value),
    },
};

const VALID_TASK = { uid: 'health-task1', string: '{{[[TODO]]}} valid task', parent: null };
const ORPHAN_TASK = { uid: 'health-orphan', string: null, page: null, parent: null };

function seed(includeIssues) {
    const blocks = [
        VALID_TASK,
        { uid: 'health-drawer', string: 'LOGBOOK::', parent: VALID_TASK.uid },
        {
            uid: 'health-valid',
            string: 'CLOCK:: [2026-08-15 Sat 09:00]--[2026-08-15 Sat 10:00] => 1:00',
            parent: 'health-drawer',
        },
    ];
    if (includeIssues) {
        blocks.push(
            ORPHAN_TASK,
            { uid: 'health-orphan-drawer', string: 'LOGBOOK::', parent: ORPHAN_TASK.uid },
            {
                uid: 'health-mismatch',
                string: 'CLOCK:: [2026-08-15 Sat 08:00]--[2026-08-15 Sat 09:00] => 0:30',
                parent: 'health-drawer',
            },
            {
                uid: 'health-orphan-clock',
                string: 'CLOCK:: [2026-08-15 Sat 10:00]--[2026-08-15 Sat 10:30] => 0:45',
                parent: 'health-orphan-drawer',
            },
            {
                uid: 'health-malformed-drawer',
                string: 'LOGBOOK::',
                parent: VALID_TASK.uid,
            },
            {
                uid: 'health-malformed-clock',
                string: 'CLOCK:: [2026-08-15 Sat 09:00:60]--[2026-08-15 Sat 11:00] => 0:30',
                parent: 'health-malformed-drawer',
            }
        );
    }
    return installGraph(blocks);
}

test.beforeEach(() => {
    settingsStore.clear();
    setExtensionAPI(extensionAPI);
});

test.after(() => {
    setExtensionAPI(null);
    uninstallGraph();
});

test('timestamp parsing rejects impossible seconds without Date normalization', () => {
    assert.equal(parseTimestamp('2026-08-15 Sat 09:00:60'), null);
    assert.equal(parseTimestamp('2026-08-15 Sat 09:00:99'), null);
    assert.ok(parseTimestamp('2024-02-29 Thu 09:00:59') instanceof Date);
    assert.equal(parseTimestamp('2023-02-29 Wed 09:00:00'), null);
});

test('a completed clock keeps computed, declared, effective minutes and an explainable issue', () => {
    const result = parseClockLineDetailed(
        'CLOCK:: [2026-08-15 Sat 09:00]--[2026-08-15 Sat 10:00] => 0:30'
    );

    assert.equal(result.ok, true);
    assert.equal(result.value.computedMinutes, 60);
    assert.equal(result.value.declaredMinutes, 30);
    assert.equal(result.value.effectiveMinutes, 30);
    assert.equal(result.value.minutes, 30);
    assert.equal(result.value.issue.code, 'declared-duration-mismatch');
});

test('readAllEntries preserves orphan and malformed CLOCK records for recovery and review', () => {
    seed(true);
    const entries = readAllEntries();
    const orphan = entries.find(entry => entry.clockUid === 'health-orphan-clock');
    const malformed = entries.find(entry => entry.clockUid === 'health-malformed-clock');
    const mismatch = entries.find(entry => entry.clockUid === 'health-mismatch');

    assert.equal(orphan.title, 'Deleted task · health-orphan');
    assert.equal(orphan.issue.code, 'orphan-task');
    assert.equal(orphan.minutes, 45, 'declared duration remains the compatible effective value');
    assert.equal(malformed.issue.code, 'invalid-timestamp');
    assert.equal(malformed.start, null);
    assert.equal(malformed.rawClock.includes('09:00:60'), true);
    assert.equal(mismatch.computedMinutes, 60);
    assert.equal(mismatch.declaredMinutes, 30);
    assert.equal(mismatch.effectiveMinutes, 30);
    assert.equal(mismatch.issue.code, 'declared-duration-mismatch');

    const model = buildDashboard(entries, {
        now: new Date('2026-08-15T12:00:00'),
        rangeId: 'all',
    });
    assert.equal(model.totalMinutes, 135, 'valid orphan time remains in global totals');
    assert.ok(model.tasks.some(task => task.title === 'Deleted task · health-orphan'));
    assert.equal(model.issues.length, 3);
});

test('optional task and page metadata uses Roam-valid get-else clauses', () => {
    const graph = seed(true);
    const queries = [];
    const originalQuery = graph.api.data.q;
    graph.api.data.q = (datalog, ...args) => {
        queries.push(String(datalog));
        return originalQuery(datalog, ...args);
    };

    readAllEntries();

    const entryQuery = queries.find(query => query.includes('LOGBOOK:'));
    assert.ok(entryQuery);
    assert.match(entryQuery, /\[\(get-else \$ \?t :block\/string nil\) \?task-string\]/);
    assert.match(entryQuery, /\[\(get-else \$ \?t :block\/page nil\) \?p\]/);
    assert.match(entryQuery, /\[\(get-else \$ \?p :node\/title nil\) \?page-title\]/);
});

test('Data issues is absent for a clean graph and exposes exact details only when needed', () => {
    seed(false);
    const cleanDashboard = createDashboard({
        now: () => new Date('2026-08-15T12:00:00'),
        setIntervalFn: () => 'ticker',
        clearIntervalFn: () => {},
    });
    cleanDashboard.open();
    assert.equal(document.querySelector('.rlb-data-issues'), null);
    cleanDashboard.destroy();

    seed(true);
    const issueDashboard = createDashboard({
        now: () => new Date('2026-08-15T12:00:00'),
        setIntervalFn: () => 'ticker',
        clearIntervalFn: () => {},
    });
    issueDashboard.open();
    const issues = document.querySelector('.rlb-data-issues');
    assert.ok(issues);
    assert.match(issues.querySelector('summary').textContent, /3 timing records need review/);
    assert.equal(issues.open, false);
    issues.open = true;
    assert.match(issues.textContent, /health-orphan|Deleted task/);
    assert.match(issues.textContent, /0:45|invalid timestamp|09:00:60/i);
    assert.match(issues.textContent, /Declared 0:30 differs/);
    issueDashboard.destroy();
});
