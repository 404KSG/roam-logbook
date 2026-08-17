# Roam Logbook 新并行工作模型：英文 UI 命名研究

日期：2026-08-17  
范围：只研究命名，不修改插件实现，不提交、不推送。  
研究对象：同一时刻只有一个任务 CLOCK 计时；任务之间无缝切换时，共享 Pomodoro 周期继续；当前任务与最近约 45 分钟内切换过、仍在推进的任务组成可快速切换集合，其他工作可能由 AI 或后台过程继续。

## 结论先行

研究后需要修正“直接使用 `Streams`”的初步判断：**`Streams` 比 `Sessions` 更接近“多条工作线”，但裸的 `Streams` 仍不是最好的最终 UI 名称。**它在项目管理语境中通常表示一个按团队、主题或范围划分的活动集合，而不是一个由个人最近切换过的任务组成的动态集合。

最终推荐采用“可见短标签”和“完整面板标题”分层：

```text
Top Bar:  0:28 · 3 Active
Popover:  Active Work
```

其中：

- `Active Work` 表示当前仍在推进、可快速切换的工作集合，不暗示多个 CLOCK 同时运行。
- Top Bar 的 `3 Active` 是 `Active Work` 的紧凑计数形式；tooltip 和无障碍名称写完整的 `3 active work items`。
- 当前唯一正在计时的任务可标为 `Focused`；其余在 45 分钟窗口内仍保留的任务可标为 `Recent` 或 `Other active work`。
- `Session` 保留给一条真实的 CLOCK 时间段。Dashboard 中的 Sessions、历史记录和统计继续使用这个词。
- `Work cycle` 或 `Pomodoro cycle` 保留给跨任务连续的全局番茄周期，不与工作集合混为一个概念。

如果产品必须在 Top Bar 中显示一个完整名词，而不能接受 `3 Active` 这种紧凑省略，备用方案是：

```text
Top Bar:  0:28 · 3 Work Items
Popover:  Active Work
```

`Work Items` 比 `Workstreams` 更能覆盖 Roam 中的任务、项目型 TODO、子任务以及由 AI 在后台推进的工作项；但它更偏项目管理术语，因此优先级低于紧凑的 `Active` 方案。

## 先拆清三个对象

新模型同时描述三件不同的事情，命名不能让它们重叠：

| 对象 | 真实含义 | 是否同时存在多个 | 推荐英文名称 |
|---|---|---:|---|
| 用户实际投入的时间段 | 一条任务 CLOCK 从开始到结束的连续区间 | 否，同一时刻只保留一个 | `Session` / `Time Segment` |
| 跨任务连续的工作周期 | 从真正开始工作到暂停、休息或中断的全局 Pomodoro 周期 | 否，通常一个 | `Work Cycle` / `Pomodoro Cycle` |
| 可快速切换的近期工作集合 | 当前焦点加上最近窗口内仍在推进的其他工作项 | 是 | `Active Work` |

因此，`3` 代表的是三个 distinct active work items，而不是三条同时计时的 CLOCK，也不是三段历史时间记录。

45 分钟是本插件的产品策略，不是行业术语定义。建议把它写成产品规则：

> Active Work includes the focused item and work items touched within the active window (45 minutes by default). Only the focused item owns the current CLOCK.

不要把 `45m` 直接塞进 Top Bar 标签；它会让用户误以为这是每个 Session 的超时或 Pomodoro 时长。

## 权威来源中的术语语义

### Session：适合真实时间段，不适合新的并行集合

Merriam-Webster 将 `session` 定义为“devoted to a particular activity”的一段时间或活动期，例子包括 recording session。它天然是一个有开始/结束边界的活动时段，而不是一个仍在推进的任务集合。见 [Merriam-Webster: Session](https://www.merriam-webster.com/dictionary/session)。

Roam Logbook 自己的官方 README 也把 session 绑定到 clock：README 描述“watch the session run in the topbar”，并说明没有结束时间戳的 clock 就是 running clock，插件会从图谱恢复这个 session；多时钟设置则表示同时打开多个 clocks。见 [forrestchang/roam-logbook README](https://github.com/forrestchang/roam-logbook#readme)。

这正好说明为什么新模型不应继续把 `3 Active Work` 叫 `3 Sessions`：新模型明确规定同一时刻只有一个任务 CLOCK，`Sessions` 应该继续表示历史/持久化计时片段。若把近期工作集合叫 Sessions，用户会无法判断 `3` 是三个工作项，还是三条并行 CLOCK。

结论：**保留 `Sessions`，但把它限定为时间账本术语。**

### Workstream：比 Session 更接近，但粒度和组织语义偏大

Microsoft Style Guide 将 `workstream` 的示例定义为团队内部组织工作的 channel；每个 channel 对应一个主题或 workstream，用于组织 conversations 和 files。见 [Microsoft Style Guide: workstream](https://learn.microsoft.com/en-us/style-guide/a-z-word-list-term-collections/w/workstream)。

AWS Prescriptive Guidance 的定义更具体：workstream 是“与一组技术组件或范围相关、由团队绑定的一组活动”，并且可与其他 workstreams 并行；它强调团队、范围、依赖和责任边界。见 [AWS: Project phases and workstreams](https://docs.aws.amazon.com/prescriptive-guidance/latest/strategy-migration-connect/workstreams.html)。

这解释了 `Workstreams` 的优点和限制：

- 优点：能表达多条独立工作线，适合“项目 A、项目 B、项目 C 同时推进”的叙事。
- 限制：对一个简单的 Roam TODO、一次阅读动作或一个等待 AI 返回的工作项来说，`workstream` 可能显得过于宏观、企业化；它也容易让人期待每条工作线里面还有一组任务、团队或范围。
- `Streams` 省略 `Work` 后更短，但会丢失项目管理语义，并增加数据流、视频流或消息流的联想。Merriam-Webster 的普通语义首先是连续流动的水/事件/数字数据，见 [Merriam-Webster: Stream](https://www.merriam-webster.com/dictionary/stream)。

结论：**`Workstreams` 可作为概念性或高级视图名称，但不建议作为这个快速切换集合的默认 Top Bar 标签；裸 `Streams` 更不建议。**

### Active Tasks / Active Work：最符合产品交互

`task` 的权威普通语义是“a usually assigned piece of work often to be finished within a certain time”，也就是一个通常被分配、需要完成的工作项。见 [Merriam-Webster: Task](https://www.merriam-webster.com/dictionary/task)。

主流工作管理产品也把 task 当作可执行工作单元：Asana 官方入门文档把 projects 定义为较大的协调工作，把 tasks 定义为项目中的 individual action items。见 [Asana Help Center: Quick-start guide](https://help.asana.com/s/article/quick-start-guide-to-asana?language=en_US)。

`Active` 也有稳定的产品语义。Linear 官方文档把 Active 视图定义为处于 Unstarted 或 Started 类别、但不在 Backlog、Completed 或 Canceled 中的 issues。见 [Linear: Team pages](https://linear.app/docs/default-team-pages)。这不是本插件 45 分钟窗口的完全同义词，但证明了 `Active` 作为“仍在工作流中、可继续处理”的 UI 状态是用户熟悉的。

对本插件来说：

- `Active Tasks` 可理解、可计数，适合全部项目对象都是 TODO 的实现。
- 但用户的某个 TODO 可能代表一个项目、Agent 工作线或等待后台结果的工作；单独使用 `Tasks` 会把粒度说窄。
- `Active Work` 不强迫用户决定对象究竟是 task、project 还是 agent work；因此更适合面板标题。

结论：**`Active Work` 是最好的面板语言；`Active Tasks` 是最好的“完整名词型”易懂备选。**

### Work in Progress / WIP：概念准确，但不适合作为默认按钮文字

Kanban University 的官方指南把 WIP 定义为某一时刻处于进行中的 work items 数量，并明确指出 context switching 会显著降低知识工作的效率；官方 glossary 则把 work item 作为被系统处理的工作单位。见 [Kanban University: The Official Guide](https://kanban.university/kanban-guide/) 和 [Kanban University: Glossary](https://kanban.university/glossary/)。

这与本插件模型非常吻合：多个 work items 可以处于进行状态，但人的 CLOCK 只记录当前主动处理的那一个；后台 AI 运行并不会变成用户同时消耗的时间。Kanban 的 WIP 语义还提醒我们，这个数量可以用于观察并行负载和上下文切换成本。

但 WIP 更像一个流程指标或限制策略，而不是一个可点击的工作集合名称：

- `WIP` 对熟悉 Kanban 的人精确，对普通用户不够直观。
- `3 WIP` 不自然；`WIP: 3` 或 `3 Work Items in Progress` 才完整。
- `WIP Limit` 还会让人误解为插件在限制任务数量，而本需求明确不添加软限制。

结论：**WIP 适合作为内部数据模型、设置说明或未来负载分析指标，不适合作为默认 Top Bar 文案。**

### Threads：适合消息/Agent 对话，不适合通用工作项

Slack 官方把 thread 定义为围绕某一条消息组织的讨论，用来避免频道或 DM 被回复淹没。见 [Slack: Use threads to organize discussions](https://slack.com/help/articles/115000769927-Use-threads-to-organize-discussions-/slack.com/help/articles/115000769927-Use-threads-to-organize-discussions-)。

Merriam-Webster 也把 thread 的数字语义定义为围绕单一主题或消息的一系列电子消息，见 [Merriam-Webster: Thread](https://www.merriam-webster.com/dictionary/thread)。它很适合描述 Agent 对话线程、消息线程或一条连续思路，但不能准确表示一个 Roam TODO 及其时间段。

结论：**不推荐作为默认集合名；以后若单独做 Agent conversation view，可以使用 `Threads`。**

### Contexts：能表达切换成本，但不是工作状态

Merriam-Webster 将 context 定义为帮助解释内容的周边部分，或某件事发生的 situation/environment。见 [Merriam-Webster: Context](https://www.merriam-webster.com/dictionary/context)。

`Contexts` 可以很好地表达“切换上下文”以及“恢复某个工作场景”，但它不明确说明这些对象是否仍在推进、是否可完成、是否由 AI 后台运行。普通用户看到 `3 Contexts` 也可能理解为三个页面、三个环境或三个认知状态。

结论：**适合作为交互/认知层的内部概念，不适合作为首屏计数名。**

## 候选词排名

评分是基于上述权威语义和产品 UI 判断的定性评分，不是用户调研数据；5 分最好。权重重点放在“是否会与 CLOCK 混淆”和“能否覆盖 task/project/AI background work”。

| 排名 | 候选 | 行业真实语义 | 普通用户理解 | 短标签长度 | CLOCK 歧义 | 覆盖本模型 | 综合判断 |
|---:|---|---|---:|---:|---:|---:|---|
| 1 | `Active Work` | 当前仍在推进的工作 | 4/5 | 5/5 | 5/5 | 5/5 | 最适合面板；Top Bar 用 `3 Active` |
| 2 | `Work Items` | 可被流程处理的工作单位，粒度可从 task 到 project | 3/5 | 4/5 | 5/5 | 5/5 | 完整名词型 Top Bar 备选 |
| 3 | `Active Tasks` | 当前未完成、可继续处理的动作项 | 5/5 | 3/5 | 4/5 | 3/5 | 最易懂，但对项目/Agent 工作线偏窄 |
| 4 | `Workstreams` | 团队/范围绑定的一组活动，常可并行 | 3/5 | 3/5 | 4/5 | 4/5 | 比 Streams 准确，但组织语义偏大 |
| 5 | `WIP` / `Work in Progress` | 某时刻系统中尚未完成的工作量 | 2/5（WIP） | 5/5（WIP） | 5/5 | 5/5 | 概念很准，默认 UI 太术语化 |
| 6 | `Sessions` | 一段有边界的活动时间 | 5/5 | 5/5 | 1/5 | 2/5 | 保留给 CLOCK 时间段，不用于工作集合 |
| 7 | `Contexts` | 事件/内容所处的环境或背景 | 3/5 | 4/5 | 5/5 | 3/5 | 能表达切换，不表达推进状态 |
| 8 | `Threads` | 围绕消息/主题的连续讨论 | 4/5 | 5/5 | 4/5 | 2/5 | 与消息、Agent 对话重叠 |
| 9 | `Streams` | 连续流、数据/媒体流；隐喻为工作流 | 3/5 | 5/5 | 3/5 | 3/5 | 太短、太隐喻，不建议裸用 |

## 推荐的 UI 词汇表

### 首选方案：短 Top Bar + 清楚的 Popover

```text
Top Bar visible:       0:28 · 3 Active
Top Bar tooltip:       3 active work items · 0:28 current work cycle
Popover title:         Active Work
Popover subtitle:      1 focused · 2 recent
Current row state:     Focused
Other row state:       Recent
```

建议把 `Active` 计数定义为：当前 Focused item 加上 active window 内最近切换过、仍未完成/未显式移出的 distinct work items。计数变化只反映工作集合，不改变 CLOCK 统计。

### 需要完整名词时的备选方案

```text
Top Bar visible:       0:28 · 3 Work Items
Popover title:         Active Work
Accessible label:      3 active work items
```

这个方案比 `3 Workstreams` 更能覆盖“一个 TODO 可能代表任务、项目、Agent 后台工作”的事实；缺点是产品感不如 `3 Active` 紧凑。

### 不建议采用的直接替换

```text
0:28 · 3 Sessions       # 会被理解为三段 CLOCK 或三条并行计时
0:28 · 3 Streams         # 语义隐喻过强，容易联想到数据/媒体流
0:28 · 3 WIP             # Kanban 用户能懂，普通用户不够自然
0:28 · 3 Threads         # 容易被理解为消息或 Agent 对话线程
0:28 · 3 Contexts        # 不能说明工作是否仍在推进
```

## 最终命名决策

**是否比 Sessions 好？** 是，但不是简单地把它替换成 `Streams`。`Sessions` 应该留在时间账本；新的并行工作集合应使用 `Active Work` 这一语义，Top Bar 用紧凑的 `3 Active`。

最终建议锁定为：

```text
Top Bar:  0:28 · 3 Active
Panel:    Active Work
```

如果后续用户测试显示 `3 Active` 单独看不够直观，再切换到不改变底层模型的完整标签：

```text
Top Bar:  0:28 · 3 Work Items
Panel:    Active Work
```

不建议把 `45 minutes`、`parallel` 或 `concurrent` 放进标签：

- `45 minutes` 是实现窗口，不是对象名称。
- `concurrent` 容易暗示多个用户 CLOCK 同时计时，与单线时间账本相冲突。
- `parallel` 描述工作推进关系，但不说明这些工作项是否共享用户注意力。

真正需要解释的内容放在 tooltip 或一次性帮助文案中：

> Active Work shows the focused task and recently touched work items that are still moving forward. Only the focused task is timed; switching tasks keeps the shared Pomodoro cycle running.

## 主要来源

- [Merriam-Webster — Session](https://www.merriam-webster.com/dictionary/session)
- [Merriam-Webster — Task](https://www.merriam-webster.com/dictionary/task)
- [Merriam-Webster — Stream](https://www.merriam-webster.com/dictionary/stream)
- [Merriam-Webster — Thread](https://www.merriam-webster.com/dictionary/thread)
- [Merriam-Webster — Context](https://www.merriam-webster.com/dictionary/context)
- [Microsoft Style Guide — workstream](https://learn.microsoft.com/en-us/style-guide/a-z-word-list-term-collections/w/workstream)
- [AWS Prescriptive Guidance — Project phases and workstreams](https://docs.aws.amazon.com/prescriptive-guidance/latest/strategy-migration-connect/workstreams.html)
- [Kanban University — The Official Guide to The Kanban Method](https://kanban.university/kanban-guide/)
- [Kanban University — The Kanban Method Glossary](https://kanban.university/glossary/)
- [Linear Docs — Team pages / Active issues](https://linear.app/docs/default-team-pages)
- [Linear Docs — Concepts](https://linear.app/docs/conceptual-model)
- [Asana Help Center — Quick-start guide](https://help.asana.com/s/article/quick-start-guide-to-asana?language=en_US)
- [Slack Help — Use threads to organize discussions](https://slack.com/help/articles/115000769927-Use-threads-to-organize-discussions-/slack.com/help/articles/115000769927-Use-threads-to-organize-discussions-)
- [Roam Logbook upstream README](https://github.com/forrestchang/roam-logbook#readme)
