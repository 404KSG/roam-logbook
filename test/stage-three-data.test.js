import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { installGraph, uninstallGraph } from './helpers/graph-stub.js';

const { parseTimestamp } = await import('../src/time.js');
const { parseClockLineDetailed } = await import('../src/org.js');
const { readAllEntries, readHierarchy } = await import('../src/entries.js');
const {
    GraphReadError,
    getBlockString,
    getChildren,
    resolveReferencedUid,
} = await import('../src/roam.js');
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

const settle = async () => {
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
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
    assert.equal(result.value.effectiveMinutes, 60);
    assert.equal(result.value.minutes, 60);
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
    assert.equal(orphan.minutes, 30, 'timestamp duration is the effective reporting value');
    assert.equal(malformed.issue.code, 'invalid-timestamp');
    assert.equal(malformed.start, null);
    assert.equal(malformed.rawClock.includes('09:00:60'), true);
    assert.equal(mismatch.computedMinutes, 60);
    assert.equal(mismatch.declaredMinutes, 30);
    assert.equal(mismatch.effectiveMinutes, 60);
    assert.equal(mismatch.issue.code, 'declared-duration-mismatch');

    const model = buildDashboard(entries, {
        now: new Date('2026-08-15T12:00:00'),
        rangeId: 'all',
    });
    assert.equal(model.totalMinutes, 150, 'valid orphan time remains in global totals');
    assert.ok(model.tasks.some(task => task.title === 'Deleted task · health-orphan'));
    assert.equal(model.issues.length, 3);
});

test('optional task and page metadata uses Roam-compatible empty defaults', () => {
    const graph = seed(true);
    const queries = [];
    const originalQuery = graph.api.data.q;
    graph.api.data.q = (datalog, ...args) => {
        const query = String(datalog);
        queries.push(query);
        if (/\(get-else[\s\S]+\bnil\)/.test(query)) {
            throw new Error('get-else: nil default value is not supported');
        }
        return originalQuery(datalog, ...args);
    };

    const entries = readAllEntries();

    const entryQuery = queries.find(query => query.includes(':in $ [?drawer-string ...]'));
    assert.ok(entryQuery);
    assert.match(entryQuery, /\[\(get-else \$ \?t :block\/string ""\) \?task-string\]/);
    assert.match(entryQuery, /\[\(get-else \$ \?t :block\/page ""\) \?p\]/);
    assert.match(entryQuery, /\[\(get-else \$ \?p :node\/title ""\) \?page-title\]/);
    assert.ok(entries.some(entry => entry.title === 'Deleted task · health-orphan'));
});

test('entry discovery binds drawer values and keeps the parser as the semantic gate', () => {
    const graph = installGraph([
        { uid: 'variant-task', string: '{{[[TODO]]}} variant task', parent: null },
        { uid: 'variant-drawer', string: '  logbook::  ', parent: 'variant-task' },
        {
            uid: 'variant-clock',
            string: 'CLOCK:: [2026-08-15 Sat 09:00]--[2026-08-15 Sat 10:00] => 1:00',
            parent: 'variant-drawer',
        },
        { uid: 'not-drawer-task', string: '{{[[TODO]]}} not drawer', parent: null },
        { uid: 'not-drawer', string: 'LOGBOOK:: notes', parent: 'not-drawer-task' },
        {
            uid: 'not-drawer-clock',
            string: 'CLOCK:: [2026-08-15 Sat 09:00]--[2026-08-15 Sat 10:00] => 1:00',
            parent: 'not-drawer',
        },
    ]);
    const calls = [];
    const originalQuery = graph.api.data.q;
    graph.api.data.q = (datalog, ...args) => {
        if (String(datalog).includes(':in $ [?drawer-string ...]')) calls.push({ datalog, args });
        return originalQuery(datalog, ...args);
    };

    const entries = readAllEntries();

    assert.deepEqual(entries.map(entry => entry.clockUid), ['variant-clock']);
    assert.equal(calls.length, 1);
    assert.match(calls[0].datalog, /:in \$ \[\?drawer-string \.\.\.\]/);
    assert.match(calls[0].datalog, /\[\?d :block\/string \?drawer-string\]/);
    assert.doesNotMatch(calls[0].datalog, /clojure\.string\/(?:includes|starts-with)\?/);
    // The bound set covers the spellings writers actually produce, padded and
    // in the historical Org shapes, rather than the full 2^7 ASCII case space.
    for (const spelling of ['LOGBOOK::', ':LOGBOOK:', 'logbook:', '  logbook::  ', '\tLOGBOOK::']) {
        assert.ok(calls[0].args[0].includes(spelling), `expected ${JSON.stringify(spelling)} to be bound`);
    }
    assert.ok(calls[0].args[0].length < 512, 'bound set stays small enough for index lookups');
});

test('graph stub exercises fast q, pull children, pull-many, and reference resolution', () => {
    const graph = installGraph([
        { uid: 'pull-task', string: '{{[[TODO]]}} pull task', parent: null },
        { uid: 'pull-child-late', string: 'late child', parent: 'pull-task', order: 2 },
        { uid: 'pull-child-first', string: 'first child', parent: 'pull-task', order: 0 },
        { uid: 'pull-ref', string: '((pull-task))', parent: null },
    ]);

    assert.equal(getBlockString('pull-task'), '{{[[TODO]]}} pull task');
    assert.deepEqual(getChildren('pull-task').map(child => child.uid), [
        'pull-child-first',
        'pull-child-late',
    ]);
    assert.equal(resolveReferencedUid('pull-ref'), 'pull-task');
    readHierarchy(['pull-task'], { includeSeedStrings: true });

    assert.ok(graph.pullCount() >= 3);
    assert.equal(graph.pullManyCount(), 1);
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

test('Dashboard keeps the last successful hierarchy when a refresh query fails, then recovers', async () => {
    const graph = seed(false);
    const dashboard = createDashboard({ now: () => new Date('2026-08-15T12:00:00') });
    dashboard.open();
    const before = document.querySelector('.rlb-task-link__text').textContent;
    const originalQuery = graph.api.data.q;
    graph.api.data.q = (datalog, ...args) => {
        if (String(datalog).includes('?parent-uid')) throw new Error('parent query unavailable');
        return originalQuery(datalog, ...args);
    };

    document.querySelector('.rlb-icon-button.bp3-icon-refresh').click();
    await settle();

    assert.match(document.querySelector('.rlb-dashboard__notice').textContent, /could not be refreshed/i);
    assert.equal(document.querySelector('.rlb-task-link__text').textContent, before);
    assert.match(document.querySelector('.rlb-data-issues')?.textContent || '', /parent query unavailable/i);
    assert.match(document.querySelector('.rlb-data-issues')?.textContent || '', /parent/i);

    graph.api.data.q = originalQuery;
    document.querySelector('.rlb-icon-button.bp3-icon-refresh').click();
    await settle();
    assert.equal(document.querySelector('.rlb-dashboard__notice'), null);
    assert.equal(document.querySelector('.rlb-data-issues'), null);
    dashboard.destroy();
});

test('hierarchy read failures expose a structured GraphReadError issue', () => {
    const graph = seed(false);
    const originalQuery = graph.api.data.q;
    graph.api.data.q = (datalog, ...args) => {
        if (String(datalog).includes('?parent-uid')) throw new Error('parent query unavailable');
        return originalQuery(datalog, ...args);
    };

    assert.throws(
        () => readHierarchy(['health-task1']),
        error => {
            assert.equal(error instanceof GraphReadError, true);
            assert.deepEqual(error.issue, {
                kind: 'graph-read',
                source: 'parent',
                message: 'parent query unavailable',
                affectedUids: ['health-task1'],
            });
            return true;
        }
    );
});

test('block-string adapter failures identify the affected uid', () => {
    const graph = seed(false);
    const originalQuery = graph.api.data.q;
    const originalPull = graph.api.data.pull;
    graph.api.data.pull = (pattern, ...args) => {
        if (pattern === '[:block/string]') throw new Error('block string pull unavailable');
        return originalPull(pattern, ...args);
    };
    graph.api.data.q = (datalog, ...args) => {
        if (String(datalog).includes(':find ?s')) throw new Error('block string query unavailable');
        return originalQuery(datalog, ...args);
    };

    try {
        assert.throws(
            () => getBlockString('health-task1'),
            error => {
                assert.equal(error instanceof GraphReadError, true);
                assert.deepEqual(error.issue, {
                    kind: 'graph-read',
                    source: 'block-string',
                    message: 'block string query unavailable',
                    affectedUid: 'health-task1',
                });
                return true;
            }
        );
    } finally {
        graph.api.data.q = originalQuery;
        graph.api.data.pull = originalPull;
    }
});

test('Dashboard treats a referenced parent string read failure as stale data, not a new root', async () => {
    const graph = installGraph([
        { uid: 'health-ref-parent', string: '{{[[TODO]]}} Referenced parent', parent: null },
        { uid: 'health-ref', string: '((health-ref-parent))', parent: 'health-ref-parent' },
        { uid: 'health-ref-child', string: '{{[[TODO]]}} Referenced child', parent: 'health-ref' },
        { uid: 'health-ref-drawer', string: 'LOGBOOK::', parent: 'health-ref-child' },
        {
            uid: 'health-ref-clock',
            string: 'CLOCK:: [2026-08-15 Sat 09:00]--[2026-08-15 Sat 10:00] => 1:00',
            parent: 'health-ref-drawer',
        },
    ]);
    const dashboard = createDashboard({ now: () => new Date('2026-08-15T12:00:00') });
    dashboard.open();
    assert.ok(document.querySelector('.rlb-task-link__text'));

    const originalQuery = graph.api.data.q;
    const originalPullMany = graph.api.data.pull_many;
    graph.api.data.pull_many = () => {
        throw new Error('block string pull_many unavailable');
    };
    graph.api.data.q = (datalog, ...args) => {
        if (String(datalog).includes(':find ?uid ?string')) throw new Error('block string query unavailable');
        return originalQuery(datalog, ...args);
    };
    document.querySelector('.rlb-icon-button.bp3-icon-refresh').click();
    await settle();

    assert.match(document.querySelector('.rlb-dashboard__notice').textContent, /last successful snapshot/i);
    assert.equal(document.querySelectorAll('.rlb-tree__cell').length > 0, true);
    assert.match(document.querySelector('.rlb-data-issues')?.textContent || '', /block string query unavailable/i);
    assert.match(document.querySelector('.rlb-data-issues')?.textContent || '', /block-string/i);
    graph.api.data.q = originalQuery;
    graph.api.data.pull_many = originalPullMany;
    dashboard.destroy();
});

test('Dashboard exposes a structured issue when the first snapshot cannot be read', () => {
    const graph = installGraph([
        { uid: 'health-first-error-task', string: '{{[[TODO]]}} First error task', parent: null },
        { uid: 'health-first-error-drawer', string: 'LOGBOOK::', parent: 'health-first-error-task' },
        {
            uid: 'health-first-error-clock',
            string: 'CLOCK:: [2026-08-15 Sat 09:00]--[2026-08-15 Sat 10:00] => 1:00',
            parent: 'health-first-error-drawer',
        },
    ]);
    const originalQuery = graph.api.data.q;
    graph.api.data.q = (datalog, ...args) => {
        if (String(datalog).includes('?parent-uid')) throw new Error('parent query unavailable');
        return originalQuery(datalog, ...args);
    };

    const dashboard = createDashboard({ now: () => new Date('2026-08-15T12:00:00') });
    dashboard.open();

    assert.match(document.querySelector('.rlb-dashboard__notice')?.textContent || '', /no successful snapshot/i);
    const issues = document.querySelector('.rlb-data-issues');
    assert.ok(issues);
    assert.match(issues.textContent, /parent query unavailable/i);
    assert.equal(issues.querySelector('[aria-label]')?.getAttribute('aria-label').includes('parent'), true);
    dashboard.destroy();
});

test('Dashboard labels a graph read failure separately and clears it after recovery', async () => {
    const graph = seed(false);
    const originalQuery = graph.api.data.q;
    graph.api.data.q = (datalog, ...args) => {
        if (String(datalog).includes(':in $ [?drawer-string ...]')) {
            throw new Error('entries query unavailable');
        }
        return originalQuery(datalog, ...args);
    };

    const dashboard = createDashboard({ now: () => new Date('2026-08-15T12:00:00') });
    dashboard.open();

    const issues = document.querySelector('.rlb-data-issues');
    assert.ok(issues);
    assert.match(issues.querySelector('summary').textContent, /1 graph read issue needs review/);
    assert.doesNotMatch(issues.querySelector('summary').textContent, /timing record/);
    assert.match(issues.textContent, /entries query unavailable/);

    graph.api.data.q = originalQuery;
    document.querySelector('.rlb-icon-button.bp3-icon-refresh').click();
    await settle();
    assert.equal(document.querySelector('.rlb-data-issues'), null);
    dashboard.destroy();
});

test('Dashboard keeps conditional data issues after the primary task list', () => {
    seed(true);
    const dashboard = createDashboard({ now: () => new Date('2026-08-15T12:00:00') });
    dashboard.open();

    const children = [...document.querySelector('.rlb-body').children];
    const byTaskIndex = children.findIndex(node => node.classList.contains('rlb-by-task'));
    const issuesIndex = children.findIndex(node => node.classList.contains('rlb-data-issues'));
    assert.ok(byTaskIndex >= 0);
    assert.ok(issuesIndex > byTaskIndex, 'issues are an inline follow-up, not the primary list');

    dashboard.destroy();
});

test('an unresolved parent is visible in Data Issues without being promoted to a fake root', () => {
    installGraph([
        { uid: 'health-missing-parent-ref', string: '((health-deleted-parent))', parent: null },
        { uid: 'health-missing-child', string: '{{[[TODO]]}} Child with missing parent', parent: 'health-missing-parent-ref' },
        { uid: 'health-missing-drawer', string: 'LOGBOOK::', parent: 'health-missing-child' },
        {
            uid: 'health-missing-clock',
            string: 'CLOCK:: [2026-08-15 Sat 09:00]--[2026-08-15 Sat 10:00] => 1:00',
            parent: 'health-missing-drawer',
        },
    ]);
    const dashboard = createDashboard({ now: () => new Date('2026-08-15T12:00:00') });
    dashboard.open();

    assert.match(document.querySelector('.rlb-task-link__text')?.textContent || '', /Child with missing parent/);
    assert.equal(document.querySelector('.rlb-dashboard__notice'), null);
    assert.match(document.querySelector('.rlb-data-issues')?.textContent || '', /unresolved parent/i);
    dashboard.destroy();
});
