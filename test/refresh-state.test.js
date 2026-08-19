import assert from 'node:assert/strict';
import test from 'node:test';

import { createRefreshState } from '../src/refresh-state.js';

test('silent success mode keeps controller state without scheduling a reset timer', async () => {
    let timers = 0;
    const rendered = [];
    const runtime = createRefreshState({
        successDuration: 0,
        setTimeoutFn: () => {
            timers += 1;
            return timers;
        },
        onRender: state => rendered.push(state.state),
    });

    await runtime.run(() => ({ ok: true }));

    assert.deepEqual(rendered, ['loading', 'success']);
    assert.equal(runtime.state.state, 'success');
    assert.equal(timers, 0);
    runtime.dispose();
});
