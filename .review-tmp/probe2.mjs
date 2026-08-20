import { buildTodayTodoTree, flattenTodayRows, currentTodayPath } from '../src/today-todos.js';
const todo = (uid, t, children = [], order = 0) => ({ uid, string: `{{[[TODO]]}} ${t}`, order, children });

// A: reference target that ALSO physically appears on the page later
const A = buildTodayTodoTree([
  todo('p', 'Project', [{ uid: 'mirror', string: '((real))', order: 0, children: [todo('sub','Sub')] }]),
  todo('real', 'Real task', [todo('realchild','Real child')], 1),
], { referenceStrings: { real: '{{[[TODO]]}} Real task' } });
console.log('A roots:', A.roots.map(n=>n.uid));
console.log('A: did the later physical "real" keep its own child?',
  JSON.stringify(A.nodes.find(n=>n.uid==='real')?.children.map(c=>c.uid)));
console.log('A: is realchild present at all?', A.nodes.some(n=>n.uid==='realchild'));
console.log('A count:', A.count);

// B: reference pointing at a DONE block, with unfinished children under the mirror
const B = buildTodayTodoTree([
  todo('p2','Project', [{ uid:'m2', string:'((donetarget))', order:0, children:[todo('orphan','Orphan child')] }]),
], { referenceStrings: { donetarget: '{{[[DONE]]}} Finished' } });
console.log('B: orphan promoted to?', B.roots[0].children.map(n=>n.uid));

// C: reference target missing entirely from referenceStrings
const C = buildTodayTodoTree([
  todo('p3','Project', [{ uid:'m3', string:'((ghost))', order:0, children:[todo('kid','Kid')] }]),
], { referenceStrings: {} });
console.log('C: unresolved ref -> child lands at', C.roots[0].children.map(n=>n.uid));

// D: two mirrors of the same target in different branches
const D = buildTodayTodoTree([
  todo('b1','Branch1', [{ uid:'mA', string:'((shared))', order:0, children:[todo('k1','K1')] }]),
  todo('b2','Branch2', [{ uid:'mB', string:'((shared))', order:0, children:[todo('k2','K2')] }], 1),
], { referenceStrings: { shared: '{{[[TODO]]}} Shared' } });
console.log('D roots:', D.roots.map(n=>n.uid), '| b2 children:', D.roots[1].children.map(n=>n.uid));
console.log('D: shared node children:', D.nodes.find(n=>n.uid==='shared').children.map(n=>n.uid));
console.log('D: is k2 reachable from roots?', JSON.stringify(D.roots, null, 0).includes('k2'));
