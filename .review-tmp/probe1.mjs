import { installGraph, uninstallGraph } from '../test/helpers/graph-stub.js';
import { readTodayTodoSnapshot } from '../src/roam.js';
import { buildTodayTodoTree, flattenTodayRows, currentTodayPath } from '../src/today-todos.js';

// PROBE 1: does LOGBOOK/CLOCK noise count toward the node cap?
const blocks = [];
for (let i = 0; i < 3; i++) {
  blocks.push({ uid: `t${i}`, page: 'August 19th, 2026', parent: null, order: i, string: `{{[[TODO]]}} Task ${i}` });
  blocks.push({ uid: `d${i}`, page: 'August 19th, 2026', parent: `t${i}`, order: 0, string: 'LOGBOOK::' });
  blocks.push({ uid: `c${i}`, page: 'August 19th, 2026', parent: `d${i}`, order: 0, string: 'CLOCK: [2026-08-19 Wed 10:00]--[2026-08-19 Wed 11:00] => 1:00' });
}
installGraph(blocks);
const r = readTodayTodoSnapshot(new Date('2026-08-19T10:00:00'), { maxNodes: 8 });
console.log('PROBE1: 9 physical blocks / only 3 visible TODOs, maxNodes=8 ->', 'ok=' + r.ok, '|', r.error?.message);
const r2 = readTodayTodoSnapshot(new Date('2026-08-19T10:00:00'));
const t2 = buildTodayTodoTree(r2.roots, { referenceStrings: r2.referenceStrings });
console.log('PROBE1: with default caps visible count =', t2.count, '(drawer blocks are structural, still counted at read)');
uninstallGraph();
