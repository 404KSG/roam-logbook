import test from 'node:test';
import assert from 'node:assert/strict';

import { frontBlockInRightSidebar } from '../src/roam.js';
import {
    createTimingLineSidebarFronting,
    isTimingLineFrontIntent,
} from '../src/timing-line-sidebar.js';

const installSidebar = rightSidebar => {
    const forbidden = [];
    globalThis.window = {
        roamAlphaAPI: {
            ui: {
                rightSidebar: {
                    removeWindow: () => forbidden.push('removeWindow'),
                    pinWindow: () => forbidden.push('pinWindow'),
                    unpinWindow: () => forbidden.push('unpinWindow'),
                    close: () => forbidden.push('close'),
                    ...rightSidebar,
                },
                setBlockFocusAndSelection: () => forbidden.push('focus'),
            },
        },
    };
    return forbidden;
};

test.afterEach(() => {
    delete globalThis.window;
});

test('a new Timing Line opens at native sidebar order 0 without unrelated UI operations', async () => {
    const calls = [];
    const forbidden = installSidebar({
        open: async () => calls.push('open'),
        getWindows: () => {
            calls.push('getWindows');
            return [{ type: 'block', 'block-uid': 'other-task', order: 0 }];
        },
        addWindow: async spec => calls.push({ action: 'addWindow', spec }),
    });

    assert.deepEqual(await frontBlockInRightSidebar('timing-task'), {
        ok: true,
        added: true,
    });
    assert.deepEqual(calls, [
        'open',
        'getWindows',
        {
            action: 'addWindow',
            spec: {
                window: { type: 'block', 'block-uid': 'timing-task', order: 0 },
            },
        },
    ]);
    assert.deepEqual(forbidden, []);
});

test('the first Timing Line add does not wait for a redundant sidebar open', async () => {
    const calls = [];
    let releaseOpen;
    const openSettled = new Promise(resolve => {
        releaseOpen = resolve;
    });
    let addStarted = false;

    installSidebar({
        open: async () => {
            calls.push('open');
            await openSettled;
        },
        getWindows: () => {
            calls.push('getWindows');
            return [];
        },
        addWindow: async spec => {
            addStarted = true;
            calls.push({ action: 'addWindow', spec });
        },
    });

    const resultPromise = frontBlockInRightSidebar('timing-task');
    await new Promise(resolve => setImmediate(resolve));
    try {
        assert.equal(addStarted, true);
    } finally {
        releaseOpen();
    }

    assert.deepEqual(await resultPromise, {
        ok: true,
        added: true,
    });
    assert.deepEqual(calls, [
        'open',
        'getWindows',
        {
            action: 'addWindow',
            spec: {
                window: { type: 'block', 'block-uid': 'timing-task', order: 0 },
            },
        },
    ]);
});

test('an existing Timing Line is reordered and expanded without duplication', async () => {
    const calls = [];
    const forbidden = installSidebar({
        open: async () => calls.push('open'),
        getWindows: () => [
            { type: 'block', 'block-uid': 'other-task', order: 0 },
            { type: 'block', 'block-uid': 'timing-task', order: 3, 'collapsed?': true },
        ],
        addWindow: async spec => calls.push({ action: 'addWindow', spec }),
        setWindowOrder: async spec => calls.push({ action: 'setWindowOrder', spec }),
        expandWindow: async spec => calls.push({ action: 'expandWindow', spec }),
    });

    assert.deepEqual(await frontBlockInRightSidebar('timing-task'), {
        ok: true,
        deduped: true,
        reordered: true,
    });
    assert.deepEqual(calls, [
        'open',
        {
            action: 'setWindowOrder',
            spec: {
                window: { type: 'block', 'block-uid': 'timing-task', order: 0 },
            },
        },
        {
            action: 'expandWindow',
            spec: { window: { type: 'block', 'block-uid': 'timing-task' } },
        },
    ]);
    assert.deepEqual(forbidden, []);
});

test('a recently confirmed Timing Line uses the native reveal fast path', async () => {
    const calls = [];
    const forbidden = installSidebar({
        open: async () => calls.push('open'),
        getWindows: () => {
            calls.push('getWindows');
            return [{ type: 'block', 'block-uid': 'timing-task', order: 0 }];
        },
        addWindow: async spec => calls.push({ action: 'addWindow', spec }),
        setWindowOrder: async spec => calls.push({ action: 'setWindowOrder', spec }),
        expandWindow: async spec => calls.push({ action: 'expandWindow', spec }),
    });

    await frontBlockInRightSidebar('timing-task');
    calls.length = 0;

    assert.deepEqual(await frontBlockInRightSidebar('timing-task'), {
        ok: true,
        deduped: true,
        reordered: true,
    });
    assert.deepEqual(calls, [
        {
            action: 'setWindowOrder',
            spec: {
                window: { type: 'block', 'block-uid': 'timing-task', order: 0 },
            },
        },
        {
            action: 'expandWindow',
            spec: { window: { type: 'block', 'block-uid': 'timing-task' } },
        },
    ]);
    assert.deepEqual(forbidden, []);
});

test('a closed cached Timing Line invalidates the fast path and recovers without duplication', async () => {
    const calls = [];
    let present = false;
    installSidebar({
        open: async () => calls.push('open'),
        getWindows: () => {
            calls.push('getWindows');
            return present ? [{ type: 'block', 'block-uid': 'timing-task', order: 0 }] : [];
        },
        addWindow: async spec => {
            calls.push({ action: 'addWindow', spec });
            present = true;
        },
        setWindowOrder: async () => {
            calls.push('setWindowOrder');
            if (!present) throw new Error('native window was closed');
        },
        expandWindow: async () => calls.push('expandWindow'),
    });

    // Seed the cache from an authoritative native window list.
    present = true;
    await frontBlockInRightSidebar('timing-task');
    present = false;
    calls.length = 0;

    assert.deepEqual(await frontBlockInRightSidebar('timing-task'), {
        ok: true,
        added: true,
    });
    assert.deepEqual(calls, [
        'setWindowOrder',
        'open',
        'getWindows',
        {
            action: 'addWindow',
            spec: {
                window: { type: 'block', 'block-uid': 'timing-task', order: 0 },
            },
        },
    ]);
    assert.equal(present, true);
});

test('a rejected warm-open does not block the first Timing Line add', async () => {
    const calls = [];
    installSidebar({
        open: async () => {
            calls.push('open');
            throw new Error('native sidebar open rejected');
        },
        getWindows: () => {
            calls.push('getWindows');
            return [];
        },
        addWindow: async spec => calls.push({ action: 'addWindow', spec }),
    });

    assert.deepEqual(await frontBlockInRightSidebar('timing-task'), {
        ok: true,
        added: true,
    });
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(calls, [
        'open',
        'getWindows',
        {
            action: 'addWindow',
            spec: {
                window: { type: 'block', 'block-uid': 'timing-task', order: 0 },
            },
        },
    ]);
});

test('a superseded first Timing Line add does not warm-open or inspect the sidebar', async () => {
    const calls = [];
    installSidebar({
        open: async () => calls.push('open'),
        getWindows: () => {
            calls.push('getWindows');
            return [];
        },
        addWindow: async spec => calls.push({ action: 'addWindow', spec }),
    });

    assert.deepEqual(
        await frontBlockInRightSidebar('timing-task', { isCurrent: () => false }),
        { ok: false, skipped: true, reason: 'superseded' }
    );
    assert.deepEqual(calls, []);
});

test('a superseded cached Timing Line stops before fallback sidebar work', async () => {
    const calls = [];
    let supersedeDuringReveal = false;
    let current = true;
    installSidebar({
        open: async () => calls.push('open'),
        getWindows: () => {
            calls.push('getWindows');
            return [{ type: 'block', 'block-uid': 'timing-task', order: 0 }];
        },
        addWindow: async spec => calls.push({ action: 'addWindow', spec }),
        setWindowOrder: async spec => {
            calls.push({ action: 'setWindowOrder', spec });
            if (supersedeDuringReveal) current = false;
        },
        expandWindow: async spec => calls.push({ action: 'expandWindow', spec }),
    });

    await frontBlockInRightSidebar('timing-task');
    calls.length = 0;
    supersedeDuringReveal = true;

    assert.deepEqual(
        await frontBlockInRightSidebar('timing-task', { isCurrent: () => current }),
        { ok: false, skipped: true, reason: 'superseded' }
    );
    assert.deepEqual(calls, [
        {
            action: 'setWindowOrder',
            spec: {
                window: { type: 'block', 'block-uid': 'timing-task', order: 0 },
            },
        },
    ]);
});

test('legacy sidebar fallback includes order 0 and preserves dedupe', async () => {
    const calls = [];
    installSidebar({
        open: async () => calls.push('open'),
        addWindow: async spec => calls.push({ action: 'addWindow', spec }),
    });

    assert.equal((await frontBlockInRightSidebar('timing-task')).ok, true);
    assert.equal((await frontBlockInRightSidebar('timing-task')).deduped, true);
    assert.deepEqual(calls, [
        'open',
        {
            action: 'addWindow',
            spec: {
                window: { type: 'block', 'block-uid': 'timing-task', order: 0 },
            },
        },
        'open',
    ]);
});

test('fronting accepts only immediate user and Active Work Clock In intents', async () => {
    const calls = [];
    const fronting = createTimingLineSidebarFronting({
        frontBlock: async uid => {
            calls.push(uid);
            return { ok: true };
        },
        isEnabled: () => true,
    });

    for (const action of [
        { type: 'clock-in', source: 'user', taskUid: 'confirmed-task' },
        { type: 'clock-in', source: 'refresh', taskUid: 'refresh-task' },
        { type: 'clock-in', source: 'legacy-reconcile', taskUid: 'legacy-task' },
        { type: 'clock-out', source: 'user', taskUid: 'closed-task' },
    ]) {
        assert.equal(isTimingLineFrontIntent(action), false);
        assert.equal(fronting.handleAction(action), false);
    }

    assert.equal(
        fronting.handleAction({ type: 'clock-in-intent', source: 'user', taskUid: 'palette-task' }),
        true
    );
    await fronting.whenIdle();
    assert.equal(
        fronting.handleAction({
            type: 'clock-in-intent',
            source: 'active-work-switch',
            taskUid: 'open-line-task',
        }),
        true
    );
    await fronting.whenIdle();
    assert.deepEqual(calls, ['palette-task', 'open-line-task']);
});

test('disabled fronting performs no sidebar work', async () => {
    let calls = 0;
    const fronting = createTimingLineSidebarFronting({
        frontBlock: async () => {
            calls += 1;
            return { ok: true };
        },
        isEnabled: () => false,
    });

    assert.equal(
        fronting.handleAction({ type: 'clock-in-intent', source: 'user', taskUid: 'timing-task' }),
        false
    );
    await fronting.whenIdle();
    assert.equal(calls, 0);
});

test('sidebar failures stay isolated and emit one concise non-blocking notice', async () => {
    const notices = [];
    const fronting = createTimingLineSidebarFronting({
        frontBlock: async () => ({
            ok: false,
            reason: 'sidebar-front-failed',
            message: 'Native sidebar is temporarily unavailable.',
        }),
        isEnabled: () => true,
        onNotice: message => notices.push(message),
    });

    assert.equal(
        fronting.handleAction({ type: 'clock-in-intent', source: 'user', taskUid: 'timing-task' }),
        true
    );
    await assert.doesNotReject(fronting.whenIdle());
    assert.deepEqual(notices, ['Native sidebar is temporarily unavailable.']);
});

test('rapid switches serialize side effects so the newest intent finishes last', async () => {
    const calls = [];
    const applied = [];
    let releaseFirst;
    let markFirstStarted;
    const firstStarted = new Promise(resolve => {
        markFirstStarted = resolve;
    });
    const fronting = createTimingLineSidebarFronting({
        frontBlock: uid => {
            calls.push(uid);
            if (uid === 'task-a') {
                markFirstStarted();
                return new Promise(resolve => {
                    releaseFirst = () => {
                        applied.push(uid);
                        resolve({ ok: true });
                    };
                });
            }
            applied.push(uid);
            return Promise.resolve({ ok: true });
        },
        isEnabled: () => true,
    });

    fronting.handleAction({ type: 'clock-in-intent', source: 'user', taskUid: 'task-a' });
    await firstStarted;
    fronting.handleAction({ type: 'clock-in-intent', source: 'user', taskUid: 'task-b' });
    releaseFirst();
    await fronting.whenIdle();

    assert.deepEqual(calls, ['task-a', 'task-b']);
    assert.deepEqual(applied, ['task-a', 'task-b']);
    assert.equal(applied.at(-1), 'task-b');
});

test('a newer intent skips a stale sidebar request that has not started yet', async () => {
    const calls = [];
    const fronting = createTimingLineSidebarFronting({
        frontBlock: async uid => {
            calls.push(uid);
            return { ok: true };
        },
        isEnabled: () => true,
    });

    fronting.handleAction({ type: 'clock-in-intent', source: 'user', taskUid: 'task-a' });
    fronting.handleAction({ type: 'clock-in-intent', source: 'user', taskUid: 'task-b' });
    await fronting.whenIdle();

    assert.deepEqual(calls, ['task-b']);
});

test('repeating a Clock In intent can front the same block again', async () => {
    const calls = [];
    const fronting = createTimingLineSidebarFronting({
        frontBlock: async uid => {
            calls.push(uid);
            return { ok: true };
        },
        isEnabled: () => true,
    });
    const action = {
        type: 'clock-in-intent',
        source: 'user',
        taskUid: 'timing-task',
        alreadyFocused: true,
    };

    fronting.handleAction(action);
    await fronting.whenIdle();
    fronting.handleAction(action);
    await fronting.whenIdle();
    assert.deepEqual(calls, ['timing-task', 'timing-task']);
});
