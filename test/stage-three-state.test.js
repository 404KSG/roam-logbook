import test from 'node:test';
import assert from 'node:assert/strict';

const pomodoro = await import('../src/pomodoro.js');
const {
    SETTING_POMODORO_STATE,
    SETTING_STATE_BACKUPS,
    setExtensionAPI,
} = await import('../src/settings.js');

const useSettings = seed => {
    const store = new Map(Object.entries(seed));
    setExtensionAPI({ settings: { get: key => store.get(key), set: (key, value) => store.set(key, value) } });
    return store;
};

test.beforeEach(() => {
    pomodoro.reset();
});

test.after(() => setExtensionAPI(null));

test('unknown or corrupt Pomodoro state is backed up once and its source is never overwritten', () => {
    const store = useSettings({ [SETTING_POMODORO_STATE]: JSON.stringify({ version: 99, data: { c1: 30 } }) });
    pomodoro.load();
    assert.match(pomodoro.getNotice(), /unsupported or invalid version and was kept/);
    assert.equal(store.get(SETTING_POMODORO_STATE), JSON.stringify({ version: 99, data: { c1: 30 } }));

    const backup = JSON.parse(store.get(SETTING_STATE_BACKUPS));
    assert.equal(backup.version, 1);
    assert.equal(JSON.parse(backup.data[SETTING_POMODORO_STATE].raw).version, 99);

    pomodoro.load();
    assert.equal(pomodoro.getNotice(), '', 'the same state is not reported on every reload');
    assert.equal(store.get(SETTING_POMODORO_STATE), JSON.stringify({ version: 99, data: { c1: 30 } }));
});

test('mixed legacy Pomodoro state is backed up as raw before valid entries are retained', () => {
    const raw = JSON.stringify({ good: 25, bad: 'not-a-duration', alsoGood: 0 });
    const store = useSettings({ [SETTING_POMODORO_STATE]: raw });

    pomodoro.load();

    assert.equal(store.get(SETTING_POMODORO_STATE), raw, 'mixed legacy data is not overwritten during migration');
    assert.equal(pomodoro.targetMinutes('good'), 25);
    assert.equal(pomodoro.targetMinutes('alsoGood'), null, 'valid suppression remains available in memory');
    const backups = JSON.parse(store.get(SETTING_STATE_BACKUPS));
    assert.equal(backups.data[SETTING_POMODORO_STATE].raw, raw);
    assert.match(pomodoro.getNotice(), /invalid|kept|backup/i);
});
