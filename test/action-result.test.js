import test from 'node:test';
import assert from 'node:assert/strict';

import { GRAPH_SYNC_RETRY_NOTICE, mutationResultNotice } from '../src/action-result.js';

test('a partial result with no failed items uses its notice or the sync retry notice', () => {
    assert.equal(
        mutationResultNotice({ partial: true, completed: 1, failed: 0, pending: 0, notice: 'Try again later.' }),
        'Try again later.'
    );
    assert.equal(
        mutationResultNotice({ partial: true, completed: 1, failed: 0, pending: 0 }),
        GRAPH_SYNC_RETRY_NOTICE
    );
});

