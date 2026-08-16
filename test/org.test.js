import test from 'node:test';
import assert from 'node:assert/strict';

import {
    formatClockLine,
    isClockBlock,
    isDrawerBlock,
    isTaskBlock,
    parseClockLine,
    referencedBlockUid,
    taskStatus,
    taskTitle,
} from '../src/org.js';

test('recognises the drawer block in its Roam and org spellings', () => {
    assert.ok(isDrawerBlock('LOGBOOK::'));
    assert.ok(isDrawerBlock('LOGBOOK:'));
    assert.ok(isDrawerBlock(':LOGBOOK:'));
    assert.ok(isDrawerBlock('  logbook::  '));
    assert.ok(!isDrawerBlock('LOGBOOK:: notes'));
    assert.ok(!isDrawerBlock('my LOGBOOK'));
});

test('parses a closed clock entry', () => {
    const parsed = parseClockLine('CLOCK:: [2026-08-05 Wed 15:58]--[2026-08-05 Wed 16:58] => 1:00');
    assert.equal(parsed.start.getTime(), new Date(2026, 7, 5, 15, 58).getTime());
    assert.equal(parsed.end.getTime(), new Date(2026, 7, 5, 16, 58).getTime());
    assert.equal(parsed.minutes, 60);
    assert.equal(parsed.running, false);
});

test('parses a running clock entry', () => {
    const parsed = parseClockLine('CLOCK:: [2026-08-05 Wed 15:58]');
    assert.equal(parsed.running, true);
    assert.equal(parsed.end, null);
    assert.equal(parsed.minutes, null);
});

test('computes minutes when the => summary is missing', () => {
    const parsed = parseClockLine('CLOCK: [2026-08-05 Wed 15:00]--[2026-08-05 Wed 17:30]');
    assert.equal(parsed.minutes, 150);
});

test('timestamp duration wins over a conflicting => summary and exposes the mismatch', () => {
    const parsed = parseClockLine('CLOCK:: [2026-08-05 Wed 15:00]--[2026-08-05 Wed 16:00] => 0:30');
    assert.equal(parsed.computedMinutes, 60);
    assert.equal(parsed.declaredMinutes, 30);
    assert.equal(parsed.effectiveMinutes, 60);
    assert.equal(parsed.minutes, 60);
    assert.equal(parsed.issue.code, 'declared-duration-mismatch');
});

test('rejects lines that are not clock entries', () => {
    assert.equal(parseClockLine('CLOCK:: nothing here'), null);
    assert.equal(parseClockLine('just a note'), null);
    assert.equal(parseClockLine(''), null);
    assert.equal(parseClockLine(undefined), null);
    // End before start means the entry is corrupt, not zero-length.
    assert.equal(parseClockLine('CLOCK:: [2026-08-05 Wed 16:00]--[2026-08-05 Wed 15:00]'), null);
    assert.equal(isClockBlock('CLOCK:: [2026-08-05 Wed 15:58]'), true);
    assert.equal(isClockBlock('LOGBOOK::'), false);
});

test('serialises clock entries in org shape', () => {
    const start = new Date(2026, 7, 5, 15, 58);
    assert.equal(formatClockLine(start), 'CLOCK: [2026-08-05 Wed 15:58]');
    assert.equal(
        formatClockLine(start, new Date(2026, 7, 5, 16, 58)),
        'CLOCK: [2026-08-05 Wed 15:58]--[2026-08-05 Wed 16:58] => 1:00'
    );
});

test('serialised entries parse back to the same numbers', () => {
    const start = new Date(2026, 7, 5, 15, 58);
    const end = new Date(2026, 7, 6, 2, 3);
    const parsed = parseClockLine(formatClockLine(start, end));
    assert.equal(parsed.start.getTime(), start.getTime());
    assert.equal(parsed.end.getTime(), end.getTime());
    assert.equal(parsed.minutes, 605);
});

test('detects TODO and DONE blocks', () => {
    assert.ok(isTaskBlock('{{[[TODO]]}} this is a test task'));
    assert.ok(isTaskBlock('{{[[DONE]]}} finished'));
    assert.ok(isTaskBlock('{{TODO}} plain braces'));
    assert.ok(!isTaskBlock('a note about my todo list'));
});

test('resolves a block that is only a reference or an embed', () => {
    assert.equal(referencedBlockUid('((abcd1234X))'), 'abcd1234X');
    assert.equal(referencedBlockUid('  ((abcd1234X))  '), 'abcd1234X');
    assert.equal(referencedBlockUid('{{[[embed]]: ((abcd1234X))}}'), 'abcd1234X');
    assert.equal(referencedBlockUid('{{embed: ((abcd1234X))}}'), 'abcd1234X');
    // A reference with text around it is its own block, not a mirror.
    assert.equal(referencedBlockUid('see ((abcd1234X))'), null);
    assert.equal(referencedBlockUid('{{[[TODO]]}} real task'), null);
});

test('builds a readable title from task markup', () => {
    assert.equal(taskTitle('{{[[TODO]]}} this is a test task'), 'this is a test task');
    assert.equal(taskTitle('{{[[TODO]]}} write [[Roam]] plugin #work'), 'write Roam plugin #work');
    assert.equal(taskTitle('{{[[DONE]]}} **bold** work'), 'bold work');
    assert.equal(taskTitle(''), '(untitled)');
    assert.equal(taskTitle('{{[[TODO]]}}'), '(untitled)');
});

test('truncates long titles', () => {
    const title = taskTitle(`{{[[TODO]]}} ${'x'.repeat(200)}`, { maxLength: 10 });
    assert.equal(title.length, 10);
    assert.ok(title.endsWith('…'));
});

test('reads the checkbox state off a task block', () => {
    assert.equal(taskStatus('{{[[TODO]]}} open work'), 'TODO');
    assert.equal(taskStatus('{{[[DONE]]}} finished'), 'DONE');
    assert.equal(taskStatus('{{TODO}} plain braces'), 'TODO');
    // taskTitle throws the marker away, so status has to be read separately.
    assert.equal(taskTitle('{{[[DONE]]}} finished'), 'finished');
    assert.equal(taskStatus('just a note'), null);
    assert.equal(taskStatus(undefined), null);
});
