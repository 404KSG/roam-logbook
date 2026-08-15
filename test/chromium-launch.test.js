import assert from 'node:assert/strict';
import test from 'node:test';

import { chromiumLaunchArgs } from './helpers/chromium.js';

test('Chromium fixture uses stable headless flags for Linux CI', () => {
    const args = chromiumLaunchArgs('/tmp/roam-logbook-profile');

    assert.ok(args.includes('--headless=new'));
    assert.ok(args.includes('--no-sandbox'));
    assert.ok(args.includes('--disable-dev-shm-usage'));
    assert.ok(args.includes('--disable-gpu'));
    assert.ok(args.includes('--remote-debugging-port=0'));
});
