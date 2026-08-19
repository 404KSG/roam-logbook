import assert from 'node:assert/strict';
import test from 'node:test';

import {
    CHROMIUM_DEBUGGER_TIMEOUT_MS,
    CHROMIUM_STARTUP_MAX_ATTEMPTS,
    CHROMIUM_STARTUP_RETRY_DELAY_MS,
    ChromiumStartupError,
    chromiumLaunchArgs,
    shouldRetryChromiumStartup,
} from './helpers/chromium.js';

test('Chromium fixture uses stable headless flags for Linux CI', () => {
    const args = chromiumLaunchArgs('/tmp/roam-logbook-profile');

    assert.ok(args.includes('--headless=new'));
    assert.ok(args.includes('--no-sandbox'));
    assert.ok(args.includes('--disable-dev-shm-usage'));
    assert.ok(args.includes('--disable-gpu'));
    assert.ok(args.includes('--remote-debugging-port=0'));
});

test('Chromium fixture allows a cold CI startup before declaring it unavailable', () => {
    assert.ok(CHROMIUM_DEBUGGER_TIMEOUT_MS >= 20_000);
});

test('Chromium startup retry policy is bounded and excludes fixture failures', () => {
    const startupFailure = new ChromiumStartupError('Chromium did not expose a debugger endpoint');

    assert.equal(CHROMIUM_STARTUP_MAX_ATTEMPTS, 2);
    assert.ok(CHROMIUM_STARTUP_RETRY_DELAY_MS >= 0);
    assert.ok(CHROMIUM_STARTUP_RETRY_DELAY_MS <= 1_000);
    assert.equal(shouldRetryChromiumStartup(startupFailure, 1), true);
    assert.equal(shouldRetryChromiumStartup(startupFailure, 2), false);
    assert.equal(shouldRetryChromiumStartup(startupFailure, 0), false);
    assert.equal(shouldRetryChromiumStartup(startupFailure, 1, 1), false);
    assert.equal(shouldRetryChromiumStartup(new Error('fixture assertion failed'), 1), false);
});
