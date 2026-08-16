# Draft PR #2：TODO → DONE 自动 Clock Out 源码评审

日期：2026-08-16
仓库：`forrestchang/roam-logbook`
评审对象：[PR #2 — JIA-430: stop clocks when tasks are completed](https://github.com/forrestchang/roam-logbook/pull/2)
上游 Draft 分支：`codex/jia-430-auto-stop-on-done`
当前分支头：[`c22e670`](https://github.com/forrestchang/roam-logbook/commit/c22e670fadc7c88770c7fba6f9448884a3335542)（合并了上游 `main`，PR 仍为 Draft）

## 结论先行

作者的核心方向是正确的：监听正在运行任务的 block 文本，检测到 `DONE` 后关闭该任务的开放 `CLOCK::` 记录；插件加载时再检查一次已经是 `DONE` 的开放 clock；多个并行 Sessions 中，只关闭被标记完成的那个任务。这个直接 DONE 自动 Clock Out 功能值得借鉴。

但当前实现还不能直接移植到我们的 beta.20，原因有四个：

1. **没有父任务级联。** 监听集合只包含拥有运行 clock 的任务本身。父任务没有自己的 clock 时不会被监听；父任务变成 `DONE` 时，子任务的 clock 不会停止。即使父任务本身也在计时，当前代码最多只关闭父任务自己的一个 clock。
2. **关闭动作没有进入 beta.20 的 mutation queue。** 上游 Draft 直接从 pull watch 回调调用 `clockOutBlock`，与手动 Clock Out、Pause/Resume 或其他 graph 写入并发时存在竞态窗口。
3. **上游图读取失败会被伪装成空结果。** `src/roam.js` 的 `query()` 捕获错误后返回 `[]`，可能导致刷新误以为没有运行 Sessions，进而移除 watch 或跳过自动关闭。beta.20 已经有 `GraphReadError` 和“保留最后有效快照”的安全边界，应当保留并沿用。
4. **测试覆盖了直接任务和兄弟并行任务，但没有覆盖父子层级、父任务没有自身 clock、引用层级、竞态和失败恢复。** 上游 PR 当前也没有 CI check 报告。

最终建议：移植“完成事件 + 加载 reconciliation”的思想，但重新实现为 beta.20 的一个**队列化、可重入、层级感知的 completion reconciler**。语义上采用：

> 任务自身变成 `DONE`：关闭自身运行 Sessions；父任务变成 `DONE`：关闭父任务及其所有仍在运行的后代 Sessions；兄弟任务不受影响。

手动点击单个 Session 的 `Clock Out` 建议仍只关闭该 Session；如果以后需要手动关闭整棵任务树，另做一个明确命名并带确认的 `Clock Out Task Tree`，不要让普通单项按钮产生隐式级联。

## 1. 上游 Draft 当前如何实现

### 1.1 监听机制：`addPullWatch` 监听 block 实体的 `:block/string`

作者在 [上游 `src/roam.js`](https://github.com/forrestchang/roam-logbook/blob/c22e670fadc7c88770c7fba6f9448884a3335542/src/roam.js#L66-L99) 新增 `watchBlockString(uid, callback)`：

```js
const pattern = '[:block/string]';
const entityId = `[:block/uid ${JSON.stringify(uid)}]`;
add(pattern, entityId, handler);
```

具体行为：

- 通过 `resolve()` 同时兼容 `roamAlphaAPI.data.addPullWatch/removePullWatch` 和旧 API 位置。
- watch 绑定的是 block 实体，不是 DOM checkbox，因此理论上可以捕获 Roam UI、引用视图或其他 graph 写入产生的文本变化。
- handler 优先读取 pull watch 的 `after[':block/string']`；如果没有，则重新调用 `getBlockString(uid)`。
- `watchBlockString()` 返回一个幂等的 unwatch 函数，重复调用不会重复 remove。
- API 不存在或 `addPullWatch` 抛错时，作者记录 console error 并返回 no-op 函数；当前没有向 UI 暴露“监听未启用”的状态，也没有自动重试机制。

### 1.2 DONE 判断：只检查任务文本中的 TODO/DONE 标记

上游 [​​`src/org.js`](https://github.com/forrestchang/roam-logbook/blob/c22e670fadc7c88770c7fba6f9448884a3335542/src/org.js#L25-L61) 使用正则识别 `{{[[TODO]]}}`、`{{[[DONE]]}}` 以及 plain-brace 变体；`taskStatus(string)` 返回 `TODO`、`DONE` 或 `null`。

pull watch 回调收到新文本后，`attachTaskCompletion()` 只做：

```js
if (taskStatus(string) !== 'DONE') return;
```

所以它不是监听 checkbox 的视觉状态，而是监听 block 文本是否包含可识别的 `DONE` 标记。这一点适合我们的 Roam 数据模型。

### 1.3 自动关闭动作：复用单任务 `clockOutBlock`

核心逻辑在 [上游 `src/clock.js`](https://github.com/forrestchang/roam-logbook/blob/c22e670fadc7c88770c7fba6f9448884a3335542/src/clock.js#L75-L127)：

- `watches`：`taskUid → unwatch`。
- `stopping`：`taskUid → Promise`，防止同一个任务的重复 pull watch 事件同时触发多次关闭。
- `stopIfDone(taskUid, string)` 发现 `DONE` 后调用 `clockOutBlock(taskUid, { now: now() })`。
- `clockOutBlock()` 通过内存中的 `running` 找到该任务的一个运行 entry，再由 `closeClockBlock()` 重新读取该 `CLOCK::` block，确认它仍是 running 后写入结束时间。
- 写入失败会被 catch，只记录错误，不让 pull watch 回调抛出未处理异常。

上游的普通 `clockOutBlock()` 代码位于同文件 [L204-L210](https://github.com/forrestchang/roam-logbook/blob/c22e670fadc7c88770c7fba6f9448884a3335542/src/clock.js#L204-L210)，它的语义是“关闭这个 task 对应的一个运行 clock”，不是“关闭 task 子树”。

### 1.4 加载时 reconciliation：通过订阅初始快照间接完成

这不是一个独立的 `reconcile()` 函数，而是利用 `subscribe()` 的“订阅后立即回调”行为：

```js
const unsubscribe = subscribe(entries => {
    // 根据 entries 建立 watches
    // 对每个 entry 立即执行 stopIfDone(entry.taskUid, entry.taskString)
});
```

因此，当 `clock.refresh()` 重新从 graph 读出一个已经是 `DONE`、但 `CLOCK::` 仍无结束时间的任务时，`stopIfDone()` 会把它补关。测试明确覆盖了这一点：[​​`test/clock.test.js` L159-L175](https://github.com/forrestchang/roam-logbook/blob/c22e670fadc7c88770c7fba6f9448884a3335542/test/clock.test.js#L159-L175)。

插件初始化顺序是：注册设置和命令 → attach pomodoro → attach task completion → mount topbar → `clock.refresh()`；销毁顺序中先调用 task-completion detach，再 reset clock：[​​`src/extension.js` L221-L264](https://github.com/forrestchang/roam-logbook/blob/c22e670fadc7c88770c7fba6f9448884a3335542/src/extension.js#L221-L264)。这保证了常规 hot reload 路径会清理 watch。

### 1.5 并行 Sessions：按 `taskUid` 隔离

作者新增的单元测试开启 multiple clocks，先让两个不同任务并行，然后把第一个任务变成 `DONE`；断言第一个 `CLOCK::` 被关闭、第二个仍在运行、watch 数量从 2 变为 1：[​​`test/clock.test.js` L138-L157](https://github.com/forrestchang/roam-logbook/blob/c22e670fadc7c88770c7fba6f9448884a3335542/test/clock.test.js#L138-L157)。

因此“多个并行 Sessions 中只停止完成的那个”已经实现，且符合我们的基本需求。它依赖当前插件“不允许同一个 task 同时有多个 running clock”的约束；若 graph 中已经存在重复的同 task running entries，当前实现只会找到并关闭其中一个。

## 2. 父任务 DONE 是否会级联？答案：当前没有

这是本次评审最重要的结论。

上游 `attachTaskCompletion()` 建立的 active 集合是：

```js
const activeTaskUids = new Set(entries.map(entry => entry.taskUid));
```

随后只对 `entries` 中的 `entry.taskUid` 调用 `watchBlockString()`；代码没有读取 `parentOf`、`getChildren`、ancestor chain 或 task hierarchy：[​​`src/clock.js` L101-L119](https://github.com/forrestchang/roam-logbook/blob/c22e670fadc7c88770c7fba6f9448884a3335542/src/clock.js#L101-L119)。

所以有三种情况：

| 场景 | 上游 Draft 行为 | 结论 |
|---|---|---|
| 父 TODO 有自己的 clock，子 TODO 有自己的 clock；父变 DONE | 只 watch 父自身，关闭父 clock | 子 clock 继续运行 |
| 父 TODO 没有自己的 clock，子 TODO 有 clock；父变 DONE | 父不在 active entries 中，没有父 watch | 子 clock 继续运行 |
| 子 TODO 变 DONE，父仍 TODO | watch 子自身，关闭子 clock | 兄弟和父 clock 不受影响 |

测试也只覆盖两个并行任务，没有任何 parent/child fixture 或 cascade assertion。上游 dashboard 的 hierarchy 能力属于另一个功能，并未被 Draft #2 接入 completion path。

### 对我们语义的判断

如果我们把父任务的 `DONE` 理解为“这一整棵任务树完成”，那么父 DONE 级联停止后代是合理且必要的；否则父任务已经完成，子任务 clock 仍然累计，会产生明显的错误数据。

但“普通手动 Clock Out 是否级联”是另一个语义：用户点击某个 Session 的 Checkout，通常是在结束当前这一条时间线。我建议：

- **自动 DONE：级联当前任务及所有运行后代。** 这是本次要实现的规则。
- **单项手动 Clock Out：只关闭选中的 Session。** 保持按钮的可预测性。
- **未来如果需要手动树级关闭：** 单独提供 `Clock Out Task Tree`，显示将影响的 Session 数量并二次确认。

## 3. 上游实现可以借鉴的部分

### 应直接借鉴

1. **监听 graph 实体而不是 DOM。** `addPullWatch('[:block/string]', [:block/uid ...])` 是正确方向，可以捕获非当前页面的 Roam 修改。
2. **把运行 clock 当作 graph 真相。** 加载时从 LOGBOOK 读开放 `CLOCK::`，再按照任务状态 reconciliation，而不是把“是否自动关闭”存进 extension memory。
3. **watch 集合跟随运行状态变化。** clock 开始时增加 watch，clock 关闭后移除，卸载时统一 detach。
4. **按任务 UID 去重并行事件。** 同一个任务可能收到连续文本变更，`stopping` Promise 的思想值得保留，但 beta.20 应改为以 clock UID/一次批量 operation 为准，避免重复任务数据留下第二个 clock。
5. **测试 graph 外部更新。** graph stub 对 `block.update()` 触发 pull watch 的模拟方式是一个不错的测试 seam；要在 beta.20 的更严格 graph stub 上继续扩展。

### 不应直接照搬

1. **不要直接使用 `clockOutBlock()` 作为自动关闭入口。** 它只找一个 task entry，而且上游实现依赖可能陈旧的内存 `running`。
2. **不要绕过 `enqueueMutation()`。** beta.20 已明确要求 graph mutation 串行化，并且每个 queued action 在写入前重新读取 graph。
3. **不要采用上游 `query() → []` 的失败降级。** beta.20 对“成功的空 graph”和“graph 读取失败”有明确区分；自动关闭绝不能把读取失败当成“没有运行 Sessions”。
4. **不要把父级 watch 限制为“有自身 clock 的父任务”。** 级联要求监听运行后代的所有可识别祖先。
5. **不要把 pull watch 失败静默成 no-op。** 至少应在内部记录 watcher health，并在 dashboard/topbar 的已有 graph warning 通道中提示或允许重试。

## 4. beta.20 的最终改造方案

### 4.1 新增一个 completion reconciler，而不是简单复制 `attachTaskCompletion`

建议在 `src/clock.js` 或独立的 `src/completion.js` 中实现以下职责：

```text
attachCompletionHandling()
  ├─ 读取并确认当前 running entries
  ├─ 根据 entries + hierarchy 计算 task/ancestor watch 集合
  ├─ 建立每个 UID 一份 watch
  ├─ 首次 reconciliation：DONE task 或 DONE ancestor → 选出目标 clock UIDs
  ├─ 每次 watched block 变化 → 合并触发 UID，排队 reconciliation
  └─ 返回幂等 detach()，卸载时清理全部 watches
```

beta.20 已有的安全与层级基础可以复用：

- `src/clock.js:23-33` 的 `withGraphGuard()` 把不确定 graph 变成明确错误。
- `src/clock.js:128-180` 的 `refresh()` / `refreshResult()` 在读取失败时保留最后有效 running snapshot。
- `src/clock.js:228-288` 的 `closeEntriesNow()` 已支持一组 clock UID 的逐项关闭、部分成功、失败项和 retry 信息。
- `src/clock.js:295-371`、`400-433` 使用 `enqueueMutation()`，并在队列内部重新读取 graph。
- `src/entries.js:153-156` 能取得 entries + hierarchy 快照；`src/entries.js:161-291` 的 `readHierarchy()` 已有 parent chain、bare reference 解析和深度保护。

### 4.2 watch 集合：运行任务 + 所有已知祖先

对当前确认过的 running entries：

1. 以每个 `entry.taskUid` 作为 seed。
2. 用现有 `readHierarchy()` 沿 `parentOf` 向上走，把所有祖先 UID 加入 watch set，即使祖先没有自己的 clock。
3. 纯 reference / embed 关系使用 beta.20 已有的 reference resolution；不能解析的 parent 记录 issue，不猜测层级。
4. 每个 UID 只建立一个 `addPullWatch`。
5. 只有在一次**成功且完整**的 graph snapshot 确认后，才删除不再需要的 watches；如果 snapshot 失败，保留旧 watches 和旧 running snapshot。

这样父任务即使没有自己的 Session，也会因子任务正在运行而被监听。

### 4.3 级联目标计算

收到 UID `triggerUid` 的新文本并确认它当前仍为 `DONE` 后，在同一个 queued reconciliation 中：

1. 重新读取所有 entries，不能只相信回调时的内存数组。
2. 重新读取/构建 hierarchy。
3. 对每个 running entry 判断：
   - `entry.taskUid === triggerUid`；或
   - 从 `entry.taskUid` 沿 `parentOf` 向上走，能到达 `triggerUid`。
4. 得到去重后的 `clockUid[]`，一次性使用同一个 `now` 关闭。
5. 用 `source: 'auto-complete'`、`reason: 'task-done'`、`triggerUid` 发布 action 结果，供现有 UI/notice 显示“已自动结束 N 个 Sessions”。
6. 关闭后重新 refresh，并按新的 running 集合重建 watches。

父任务、子任务、孙任务有自己的 clock 都应被关闭；不在该父树下的兄弟任务保持运行。

### 4.4 加载 reconciliation 的无漏事件顺序

推荐顺序：

1. 读取确认过的 graph snapshot。
2. 根据 snapshot 建立运行任务和祖先 watches。
3. 在 mutation queue 中执行一次完整 reconciliation，处理“插件未加载期间已经 DONE”的 direct/ancestor 情况。
4. reconciliation 完成后再次读取并同步 watches，覆盖“首次读取与安装 watch 之间发生变化”的窗口。

如果 Roam 的 pull watch 安装与 graph 读取之间存在事件间隙，第二次 reconciliation 是必要的。当前 Draft 的“attach 后靠 `subscribe` 初始回调检查”可以借鉴，但不应把它当成完整的竞态解决方案。

### 4.5 竞态与幂等规则

所有自动关闭和用户关闭都进入同一个 `enqueueMutation()`：

- 自动完成开始时，队列内部重新读 graph；已经被手动关闭的 clock 变成 `not-running`，不重复写。
- 同一 parent DONE 触发多次时，按 `triggerUid` 合并 pending reconcile；已关闭 entries 不再写入。
- 父 DONE 与子 clock-in 同时发生时，以队列内的最新 graph 状态判断；如果父仍为 DONE，拒绝新增子 clock 或立即将其纳入级联关闭。
- 如果任务从 DONE 很快改回 TODO，在自动关闭真正执行前重新读到 TODO，则不应因一个陈旧事件关闭新的 Session。
- 同一个 task UID 若因历史数据出现多个 running clock，目标集合按 `clockUid` 关闭全部，而不是只关闭第一个；同时报告数据异常。
- 自动关闭使用一次批量 `now`，避免父、子跨分钟时产生不一致结束时间。

建议把“事件去重 key”设计为 `triggerUid + current graph revision/queued pass`，不要只用 task UID 永久锁住；操作结束后释放，新的 DONE→TODO→DONE 周期仍可再次触发。

### 4.6 错误处理和 watcher 生命周期

沿用 beta.20 的安全策略：

- graph 读失败：零写入、保留最后有效 snapshot 和现有 watches，显示可重试的 warning。
- hierarchy 读失败：不要猜测级联范围；可以安全地只处理已确认的 direct task，或整体推迟本次自动关闭并报告“不确定”。对于我们的目标，推荐整体推迟级联，避免漏关/误关。
- 逐项 update 部分失败：保留失败 clock UID 和 `retry` 信息，已经成功关闭的项不重复关闭。
- `addPullWatch` 失败：标记 watcher unhealthy，不宣称自动完成已启用；在下一次 refresh/reload 重试安装。
- `removePullWatch` 失败：记录具体 UID；不要先把失败的 watch 从内部状态当作已清理，必要时在下一次同步重试。
- `onunload`：先 detach 所有 watches，再调用 `clock.reset()`；detach 必须幂等。
- 对非 `DONE` 的文本变化（标题编辑、DONE→TODO、删除/恢复）也触发一次轻量 reconciliation，以便同步 watch 集合，不只在 `DONE` 事件时工作。

## 5. 建议的行为定义

| 事件 | 应关闭的 Sessions |
|---|---|
| 子任务自身变为 `DONE` | 子任务自身及其运行后代 |
| 父任务变为 `DONE` | 父任务自身及所有运行后代 |
| 兄弟任务变为 `DONE` | 只关闭该兄弟任务及其后代，不影响其他兄弟 |
| 已是 `DONE` 的任务在插件加载 | 按同样规则 reconciliation |
| 手动点击单个 Session 的 `Clock Out` | 只关闭该 Session |
| `Clock Out All` | 关闭全部当前运行 Sessions |
| 暂停/恢复 | 保持现有 beta.20 语义；暂停产生结束记录，不应被误判成自动完成 |
| `DONE` 父任务下尝试新建子 Session | 推荐禁止；给出“父任务已完成”的提示 |

“父 DONE 级联”应只作用于**当前仍为 running 的 clock**；历史已关闭记录不修改，任务树移动也不回写历史。

## 6. 测试矩阵

### P0：必须通过

| 类别 | 场景 | 断言 |
|---|---|---|
| 直接完成 | 一个 TODO 有一个 running clock，改为 DONE | 写入结束时间；running 变 0；watch 移除 |
| 重载补偿 | graph 中已有 DONE task + 开放 CLOCK，插件 attach/reload | attach 后自动关闭；不依赖本地 extension memory |
| 并行隔离 | A、B 两个 TODO 同时 running，A DONE | A 关闭、B 保持 running；B watch 保留 |
| 父子级联 | parent 与 child 都 running，parent DONE | parent 和 child 都关闭 |
| 父无自身 clock | child running，parent 没有 clock，parent DONE | parent watch 能捕获事件；child 关闭 |
| 多层级 | grandparent → parent → child，child running，grandparent DONE | 所有运行后代关闭 |
| 兄弟隔离 | parent 下 A、B 并行，A DONE | A 关闭，B 保持 running |
| 子完成 | child DONE、parent TODO、sibling running | child 关闭；parent/sibling 不受影响 |
| 反复状态 | TODO→DONE→TODO→DONE | 每个新的 DONE 周期最多关闭当时的 running clock，不重复写历史 CLOCK |
| 空操作 | DONE block 重复更新为相同 DONE 文本 | 不产生第二次关闭、不改变已结束 duration |
| 卸载清理 | 多个 task/ancestor watches 后 onunload | 所有 pull watches 被移除，重复 onunload 不报错 |

### P1：层级和数据兼容

| 类别 | 场景 | 断言 |
|---|---|---|
| reference | 子任务位于 `((parentUid))` 或 embed 下 | ancestor resolution 正确，父 DONE 能级联 |
| 非任务中间块 | task 之间夹有普通 note block | 继续沿层级走；只把带 TODO/DONE 的 block 当完成触发点 |
| 深度保护 | 超过 hierarchy 最大深度 | 不猜测未知祖先；给出 issue/warning |
| 循环/坏引用 | 循环 reference 或 unresolved parent | 不死循环、不扩大关闭范围 |
| 同 task 重复 clock | 历史 graph 有两个同 task running CLOCK | 按 clockUid 全部关闭或明确报告异常，不只关一个 |
| 删除/恢复 | 被 watch 的 task 删除、恢复或从 DONE 改回 TODO | reconciliation 更新 running/watch 集合，不留下 stale watch |
| DONE 父禁止新 clock | DONE parent 下 child 仍 TODO，尝试 clock in | 被拒绝或立即安全收束，不能留下运行 child clock |

### P1：竞态与错误

| 类别 | 场景 | 断言 |
|---|---|---|
| 自动 vs 手动 | DONE watch 与手动 Clock Out 同时触发 | queue 串行；最多一次有效写；结果可解释 |
| 父 DONE vs child clock-in | 两个操作交错 | 队列内按最新 graph 状态决策，不留下 DONE 子树中的运行 clock |
| 快速撤销 | DONE 事件排队后立即改回 TODO | 若执行前已是 TODO，不因陈旧事件关闭新 Session |
| 读取失败 | reconciliation preflight query 抛错 | 零 graph writes；保留 last valid snapshot/watch；返回 retryable warning |
| 层级读取失败 | entries 成功、hierarchy 查询失败 | 不进行不确定的级联写入 |
| 部分 update 失败 | parent/child 多项中间一项写失败 | 成功项保留，失败项有 pending/retry UID，不重复成功项 |
| watch API 不可用 | `addPullWatch` 缺失或抛错 | 插件不崩溃；状态可诊断；后续 refresh/reload 可重试 |
| watch remove 失败 | unload 或 entry 结束时 remove 抛错 | 记录具体 UID，清理逻辑幂等，不假装完全清理 |

### P2：回归

- 不影响现有 single-clock org 行为。
- 不影响 multiple-clock、Pause/Resume、Pomodoro cycle 和 stale warning。
- 不影响手动单项 Checkout、Discard 和 Clock Out All。
- 不改变 LOGBOOK/CLOCK 格式和已关闭历史记录。
- `npm test`、`npm run lint`、`npm run build`、`npm run check` 全部通过；新增 beta.20 的 graph-safety、hierarchy、pull-watch 生命周期测试。

## 7. 实施顺序建议

1. 先新增只读层级判定测试：给定 entries + hierarchy，纯函数返回应关闭的 `clockUid[]`；先把父子、引用、兄弟、深度和坏引用语义固定下来。
2. 把 `watchBlockString` 以 beta.20 的 GraphReadError/diagnostic 约定接入，不直接复制上游的失败吞噬行为。
3. 新增一个队列内的 `clockOutCompletedTree(triggerUid)` 或等价内部 mutation，让“读取、计算、关闭、确认、发布结果”处于同一个 mutation 边界。
4. 接入 initial reconciliation 和 watch sync；再加入“DONE 父任务无自身 clock”的测试。
5. 最后接入 `canClockIn` 的 DONE ancestor 防护和 UI notice；不改变单项手动 Checkout 的语义。
6. 只在所有测试通过后再更新 bundle；本次研究阶段不修改源码、bundle、分支、commit 或 remote。

## 8. 一手资料与核验范围

- [Draft PR #2](https://github.com/forrestchang/roam-logbook/pull/2)：作者的 Summary、Root cause、Validation 和当前 Draft 状态。
- [PR 分支 commit `bfa8a07`](https://github.com/forrestchang/roam-logbook/commit/bfa8a0725e1f307f20625d3e0d2d1424083aef4a)：自动完成功能的原始实现。
- [PR 分支 merge commit `c22e670`](https://github.com/forrestchang/roam-logbook/commit/c22e670fadc7c88770c7fba6f9448884a3335542)：当前 Draft 分支头，包含上游最新 main。
- [上游 `src/clock.js`](https://github.com/forrestchang/roam-logbook/blob/c22e670fadc7c88770c7fba6f9448884a3335542/src/clock.js#L75-L127)：完成监听、Promise 去重、直接任务关闭和 watch sync。
- [上游 `src/roam.js`](https://github.com/forrestchang/roam-logbook/blob/c22e670fadc7c88770c7fba6f9448884a3335542/src/roam.js#L40-L99)：query fallback 和 `addPullWatch/removePullWatch` 封装。
- [上游 `src/extension.js`](https://github.com/forrestchang/roam-logbook/blob/c22e670fadc7c88770c7fba6f9448884a3335542/src/extension.js#L221-L264)：初始化、加载 refresh、卸载 detach。
- [上游 `test/clock.test.js`](https://github.com/forrestchang/roam-logbook/blob/c22e670fadc7c88770c7fba6f9448884a3335542/test/clock.test.js#L138-L175)：并行任务隔离和加载 reconciliation 测试。
- [上游 `test/lifecycle.test.js`](https://github.com/forrestchang/roam-logbook/blob/c22e670fadc7c88770c7fba6f9448884a3335542/test/lifecycle.test.js#L94-L127)：生命周期直接 DONE 测试；文件末尾还断言 unload 后 watch 数量为 0。
- 本地 beta.20：`src/clock.js:23-33, 128-180, 228-288, 295-433`；`src/entries.js:153-291`；`src/roam.js:1-140`；`src/extension.js:46-100, 220-264`；`test/graph-safety.test.js:34-127`；`test/clock.test.js:117-240`。

本次只写入本研究文件；没有修改插件源码、bundle、依赖、分支、commit 或 push。
