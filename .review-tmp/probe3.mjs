import { buildTodayTodoTree, flattenTodayRows, currentTodayPath } from '../src/today-todos.js';
const todo = (uid, t, children = [], order = 0) => ({ uid, string: `{{[[TODO]]}} ${t}`, order, children });
const show = n => ({ uid: n.uid, children: n.children.map(show) });

// A: mirror of a task that ALSO physically appears later on the same page
const A = buildTodayTodoTree([
  todo('projectAA', 'Project', [{ uid: 'mirrorAAA', string: '((realtaskA))', order: 0, children: [todo('subAAAAAA','Sub')] }]),
  todo('realtaskA', 'Real task', [todo('realkidAA','Real child')], 1),
], { referenceStrings: { realtaskA: '{{[[TODO]]}} Real task' } });
console.log('A roots:', JSON.stringify(A.roots.map(show)));
console.log('A count:', A.count, '| all uids:', A.nodes.map(n=>n.uid).join(','));

// C: unresolved reference (target not in referenceStrings) with children
const C = buildTodayTodoTree([
  todo('projectCC','Project', [{ uid:'mirrorCCC', string:'((ghosttarget))', order:0, children:[todo('kidCCCCCC','Kid')] }]),
], { referenceStrings: {} });
console.log('C roots:', JSON.stringify(C.roots.map(show)));

// E: reference CYCLE - two blocks each referencing the other's target
const E = buildTodayTodoTree([
  todo('rootEEEEE','Root', [
    { uid:'mirrorE1A', string:'((mirrorE2B))', order:0, children:[] },
    { uid:'mirrorE2B', string:'((mirrorE1A))', order:1, children:[] },
  ]),
], { referenceStrings: { mirrorE2B: '((mirrorE1A))', mirrorE1A: '((mirrorE2B))' } });
console.log('E roots:', JSON.stringify(E.roots.map(show)), '(no infinite loop)');

// F: a mirror whose target is an ANCESTOR -> can this create a cycle in parentByUid?
const F = buildTodayTodoTree([
  todo('ancestorF', 'Ancestor', [
    todo('midFFFFFF','Mid', [{ uid:'mirrorFFF', string:'((ancestorF))', order:0, children:[todo('deepFFFFF','Deep')] }]),
  ]),
], { referenceStrings: { ancestorF: '{{[[TODO]]}} Ancestor' } });
console.log('F roots:', JSON.stringify(F.roots.map(show)));
console.log('F parentByUid:', JSON.stringify([...F.parentByUid]));
console.log('F: where did deep land?', F.nodes.find(n=>n.uid==='deepFFFFF') ? 'present' : 'LOST');
const path = currentTodayPath(F, 'deepFFFFF');
console.log('F currentPath from deep:', [...path]);
const rows = flattenTodayRows(F, { currentPath: path });
console.log('F rows with forced path:', rows.map(r=>`${r.node.uid}@${r.depth}`).join(' '));
