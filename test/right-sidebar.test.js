import test from 'node:test';
import assert from 'node:assert/strict';

import { ACTIVE_WORK_WINDOW_MS } from '../src/active-work.js';
import { frontBlockInRightSidebar } from '../src/roam.js';

const blockWindow = (uid, order) => ({
    type: 'block',
    'block-uid': uid,
    ...(Number.isFinite(order) ? { order } : {}),
});

const installSidebar = rightSidebar => {
    globalThis.window = {
        roamAlphaAPI: {
            ui: { rightSidebar },
        },
    };
};

test.afterEach(() => {
    delete globalThis.window;
});

test('an Active Work switch previews an existing native window after plugin reload', async () => {
    const calls = [];
    let releaseValidation;
    const validation = new Promise(resolve => {
        releaseValidation = resolve;
    });

    installSidebar({
        open: async () => calls.push('open'),
        getWindows: () => {
            calls.push('getWindows');
            return validation;
        },
        setWindowOrder: async spec => calls.push({ action: 'setWindowOrder', spec }),
        expandWindow: async spec => calls.push({ action: 'expandWindow', spec }),
        addWindow: async spec => calls.push({ action: 'addWindow', spec }),
    });

    const resultPromise = frontBlockInRightSidebar('reload-thread', {
        preferExisting: true,
    });
    assert.ok(
        calls.some(call => call?.action === 'setWindowOrder'),
        'Active Work starts the native preview before an empty local cache is validated'
    );
    assert.equal(calls.filter(call => call?.action === 'addWindow').length, 0);

    releaseValidation([blockWindow('reload-thread', 2)]);
    assert.deepEqual(await resultPromise, {
        ok: true,
        deduped: true,
        reordered: true,
    });
    assert.equal(calls.filter(call => call === 'getWindows').length, 1);
    assert.equal(calls.filter(call => call?.action === 'addWindow').length, 0);
});

test('a known Active Thread still previews after the legacy 30-second cache window', async () => {
    const calls = [];
    const originalDateNow = Date.now;
    let now = 1_000_000;
    let phase = 'seed';
    let releaseValidation;
    const validation = new Promise(resolve => {
        releaseValidation = resolve;
    });

    Date.now = () => now;
    installSidebar({
        open: async () => calls.push('open'),
        getWindows: () => {
            calls.push('getWindows');
            return phase === 'validate' ? validation : [blockWindow('active-thread', 2)];
        },
        setWindowOrder: async spec => calls.push({ action: 'setWindowOrder', spec }),
        expandWindow: async spec => calls.push({ action: 'expandWindow', spec }),
        addWindow: async spec => calls.push({ action: 'addWindow', spec }),
    });

    try {
        await frontBlockInRightSidebar('active-thread');
        calls.length = 0;
        phase = 'validate';
        now += ACTIVE_WORK_WINDOW_MS - 1;

        const resultPromise = frontBlockInRightSidebar('active-thread');
        let observedError;
        try {
            // Validation is intentionally unresolved. A recently active
            // thread must still begin its reversible native reveal/order now.
            assert.ok(
                calls.some(call => call?.action === 'setWindowOrder'),
                'native reveal/order waited for authoritative validation'
            );
        } catch (error) {
            observedError = error;
        } finally {
            releaseValidation([blockWindow('active-thread', 2)]);
        }

        assert.deepEqual(await resultPromise, {
            ok: true,
            deduped: true,
            reordered: true,
        });
        assert.ifError(observedError);
        assert.equal(calls.filter(call => call === 'getWindows').length, 1);
        assert.equal(
            calls.filter(call => call?.action === 'addWindow').length,
            0,
            'validation of an existing thread must not add a duplicate window'
        );
    } finally {
        Date.now = originalDateNow;
    }
});

test('a cached thread returns to authoritative validation after the Active Work window expires', async () => {
    const calls = [];
    const originalDateNow = Date.now;
    let now = 1_500_000;
    let phase = 'seed';
    let releaseValidation;
    const validation = new Promise(resolve => {
        releaseValidation = resolve;
    });

    Date.now = () => now;
    installSidebar({
        open: async () => calls.push('open'),
        getWindows: () => {
            calls.push('getWindows');
            return phase === 'validate' ? validation : [blockWindow('expired-thread', 2)];
        },
        setWindowOrder: async spec => calls.push({ action: 'setWindowOrder', spec }),
        expandWindow: async spec => calls.push({ action: 'expandWindow', spec }),
        addWindow: async spec => calls.push({ action: 'addWindow', spec }),
    });

    try {
        await frontBlockInRightSidebar('expired-thread');
        calls.length = 0;
        phase = 'validate';
        now += ACTIVE_WORK_WINDOW_MS + 1;

        const resultPromise = frontBlockInRightSidebar('expired-thread');
        assert.equal(
            calls.some(call => call?.action === 'setWindowOrder'),
            false,
            'an expired cache hint must not preview before Roam confirms the window'
        );

        releaseValidation([blockWindow('expired-thread', 2)]);
        assert.equal((await resultPromise).ok, true);
        assert.equal(calls.filter(call => call?.action === 'setWindowOrder').length, 1);
        assert.equal(calls.filter(call => call?.action === 'addWindow').length, 0);
    } finally {
        Date.now = originalDateNow;
    }
});

test('a known thread missing inside the Active Work window adds only after validation and once', async () => {
    const calls = [];
    const originalDateNow = Date.now;
    let now = 2_000_000;
    let present = true;
    let phase = 'seed';
    let releaseValidation;
    const validation = new Promise(resolve => {
        releaseValidation = resolve;
    });

    Date.now = () => now;
    installSidebar({
        open: async () => calls.push('open'),
        getWindows: () => {
            calls.push('getWindows');
            if (phase === 'validate') {
                return validation;
            }
            return present ? [blockWindow('vanished-thread', 1)] : [];
        },
        setWindowOrder: async spec => {
            calls.push({ action: 'setWindowOrder', spec });
            if (!present) throw new Error('native window is gone');
        },
        expandWindow: async spec => calls.push({ action: 'expandWindow', spec }),
        addWindow: async spec => {
            calls.push({ action: 'addWindow', spec });
            present = true;
        },
    });

    try {
        await frontBlockInRightSidebar('vanished-thread');
        calls.length = 0;
        present = false;
        phase = 'validate';
        now += ACTIVE_WORK_WINDOW_MS - 1;

        const resultPromise = frontBlockInRightSidebar('vanished-thread');
        let observedError;
        try {
            assert.ok(
                calls.some(call => call?.action === 'setWindowOrder'),
                'native reveal/order did not start before missing-window validation'
            );
            assert.equal(
                calls.filter(call => call?.action === 'addWindow').length,
                0,
                'addWindow must wait for authoritative confirmation that the target is missing'
            );
        } catch (error) {
            observedError = error;
        } finally {
            releaseValidation([]);
        }

        assert.deepEqual(await resultPromise, {
            ok: true,
            added: true,
        });
        assert.ifError(observedError);
        assert.equal(
            calls.filter(call => call?.action === 'addWindow').length,
            1,
            'a missing known thread must receive exactly one replacement window'
        );
    } finally {
        Date.now = originalDateNow;
    }
});

test('a rapid newer thread previews immediately and is reconciled after the stale native call', async () => {
    const appliedOrder = [];
    let currentA = true;
    let releaseFirstOrder;
    let markFirstOrderStarted;
    const firstOrderStarted = new Promise(resolve => {
        markFirstOrderStarted = resolve;
    });
    const firstOrderGate = new Promise(resolve => {
        releaseFirstOrder = resolve;
    });
    let taskAOrders = 0;

    installSidebar({
        open: async () => {},
        getWindows: () => [blockWindow('rapid-thread-a', 0), blockWindow('rapid-thread-b', 1)],
        setWindowOrder: async ({ window }) => {
            const uid = window['block-uid'];
            if (uid === 'rapid-thread-a' && taskAOrders++ === 0) {
                markFirstOrderStarted();
                await firstOrderGate;
            }
            appliedOrder.push(uid);
        },
        expandWindow: async () => {},
        addWindow: async () => assert.fail('both rapid-switch targets already exist'),
    });

    const first = frontBlockInRightSidebar('rapid-thread-a', {
        isCurrent: () => currentA,
        preferExisting: true,
    });
    await firstOrderStarted;

    currentA = false;
    const second = frontBlockInRightSidebar('rapid-thread-b', {
        preferExisting: true,
    });
    await Promise.resolve();
    assert.deepEqual(
        appliedOrder,
        ['rapid-thread-b'],
        'the newest reversible preview does not wait for the older native call'
    );

    releaseFirstOrder();
    assert.deepEqual(await first, { ok: false, skipped: true, reason: 'superseded' });
    assert.equal((await second).ok, true);
    assert.deepEqual(appliedOrder, [
        'rapid-thread-b',
        'rapid-thread-a',
        'rapid-thread-b',
    ]);
    assert.equal(appliedOrder.at(-1), 'rapid-thread-b');
});

test('legacy Roam reuses an existing native window after plugin reload without duplication', async () => {
    const calls = [];
    installSidebar({
        open: async () => calls.push('open'),
        setWindowOrder: async spec => calls.push({ action: 'setWindowOrder', spec }),
        expandWindow: async spec => calls.push({ action: 'expandWindow', spec }),
        addWindow: async spec => calls.push({ action: 'addWindow', spec }),
    });

    assert.deepEqual(
        await frontBlockInRightSidebar('legacy-reload-thread', { preferExisting: true }),
        { ok: true, deduped: true, reordered: true }
    );
    assert.equal(calls.filter(call => call?.action === 'setWindowOrder').length, 1);
    assert.equal(calls.filter(call => call?.action === 'addWindow').length, 0);
});

test('legacy Roam recreates a requested window after a failed native reveal', async () => {
    const calls = [];
    let present = false;
    installSidebar({
        open: async () => calls.push('open'),
        setWindowOrder: async spec => {
            calls.push({ action: 'setWindowOrder', spec });
            if (!present) throw new Error('legacy window was closed');
        },
        expandWindow: async spec => calls.push({ action: 'expandWindow', spec }),
        addWindow: async spec => {
            calls.push({ action: 'addWindow', spec });
            present = true;
        },
    });

    assert.deepEqual(await frontBlockInRightSidebar('legacy-closed-thread'), {
        ok: true,
        added: true,
    });
    present = false;
    assert.deepEqual(await frontBlockInRightSidebar('legacy-closed-thread'), {
        ok: true,
        added: true,
    });
    assert.equal(calls.filter(call => call?.action === 'addWindow').length, 2);
});

test('legacy Roam without getWindows still leaves the newest rapid switch on top', async () => {
    const appliedOrder = [];
    let currentA = true;
    let releaseFirstOrder;
    let markFirstOrderStarted;
    const firstOrderStarted = new Promise(resolve => {
        markFirstOrderStarted = resolve;
    });
    const firstOrderGate = new Promise(resolve => {
        releaseFirstOrder = resolve;
    });

    installSidebar({
        open: async () => {},
        setWindowOrder: async ({ window }) => {
            const uid = window['block-uid'];
            if (uid === 'legacy-thread-a') {
                markFirstOrderStarted();
                await firstOrderGate;
            }
            appliedOrder.push(uid);
        },
        expandWindow: async () => {},
        addWindow: async ({ window }) => appliedOrder.push(window['block-uid']),
    });

    const first = frontBlockInRightSidebar('legacy-thread-a', {
        isCurrent: () => currentA,
        preferExisting: true,
    });
    await firstOrderStarted;

    currentA = false;
    const second = frontBlockInRightSidebar('legacy-thread-b', {
        preferExisting: true,
    });
    await Promise.resolve();
    assert.deepEqual(appliedOrder, ['legacy-thread-b']);

    releaseFirstOrder();
    assert.deepEqual(await first, { ok: false, skipped: true, reason: 'superseded' });
    assert.deepEqual(await second, { ok: true, deduped: true, reordered: true });
    assert.deepEqual(appliedOrder, [
        'legacy-thread-b',
        'legacy-thread-a',
        'legacy-thread-b',
    ]);
    assert.equal(appliedOrder.at(-1), 'legacy-thread-b');
});
