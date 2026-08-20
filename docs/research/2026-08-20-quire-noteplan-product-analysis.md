# Quire 与 NotePlan 产品功能研究：Task Tracker 借鉴方案

日期：2026-08-20  
研究对象：Quire（quire.io）与 NotePlan（noteplan.co）  
资料范围：仅使用两家产品的官网功能页、官方帮助中心、官方产品指南或官方博客；不使用第三方评测、社区帖子或搜索摘要作为事实来源。  
目标项目：`/Users/qingqiqiu/code/roam-logbook` 的 Task Tracker 插件。  
研究结论性质：标记为“事实”的内容来自官方资料；标记为“推断 / 建议”的内容是结合 Task Tracker 当前模型做出的产品判断，不等同于被研究产品的官方表述。

## 结论先行

Quire 与 NotePlan 值得借鉴的不是同一组功能：

- **Quire 的强项是任务系统的外部结构**：项目、任务、无限层级子任务、列表/看板/表格/时间线/日历/时间统计、多项目聚合、筛选排序、依赖和团队协作。
- **NotePlan 的强项是任务与个人工作上下文的连接**：Markdown 原生任务、Daily Note、Project Note、日期调度、右侧时间线、时间块、筛选视图、反向链接和可复用模板。
- **Task Tracker 的核心差异**是：Roam 原生 TODO 是唯一任务来源；真实时间只能由一个 Focused CLOCK 线性记录；其他近期工作项只是 45 分钟窗口内可返回的 Parallel Threads；Dashboard 负责解释已记录的数据，而不是变成第二个项目数据库。

因此，最终建议是：

1. 借鉴 Quire 的 **My Tasks / Active Tasks / Task Bundle** 思路，增强 Task Tracker 的“今日未完成 TODO”与层级聚合，但只读 Roam 图谱，不复制任务、不建立第二套任务库。
2. 借鉴 NotePlan 的 **Daily Note → 项目任务引用 → 当天聚合** 思路，把今天的未完成 TODO 做成面板内可折叠、可直接导航和可直接聚焦的视图。
3. 借鉴两者的 **保存筛选、排序、视图切换**，但先做轻量的 `Open / Done / All`、`Recent / Duration / Sessions`，不引入复杂字段系统。
4. 保持“计划时间”和“实际时间”分离：NotePlan 的 Time Blocking 可以作为未来的计划层参考，但不能直接写入或替代 Task Tracker 的 CLOCK。
5. 暂不引入完整看板、Gantt、依赖强制、团队权限、聊天、自动重复任务和第二套 Project/Area 层级；这些会增加模型、写入、性能和认知负担，并且与 Roam 原生 TODO + 单线真实计时的边界冲突。

### 推荐的 Task Tracker 目标交互

```text
Roam 原生 TODO / DONE
          │
          ├── Today Open：今天页面内未完成 TODO，按父子层级折叠展示
          │        └── 点击任务：导航到原 block；播放按钮：成为 Focused
          │
          └── Active Work：Focused + 45 分钟窗口内的近期 Parallel Threads
                   └── 任一时刻只有 Focused 拥有真实 CLOCK

Focused CLOCK ──> 单线 Session 记录 ──> Dashboard 分析 / Activity / 汇总
```

这条链路同时保留了两种视角：

- “现在有哪些工作线可以切回去？”由 Active Work / Today Open 回答。
- “我实际把时间花在了哪里？”由单线 CLOCK、Session 和 Dashboard 回答。

## 1. Task Tracker 当前基线

以下内容来自仓库当前的 [CONTEXT.md](../../CONTEXT.md)、[package.json](../../package.json) 和实现结构，是本次方案的约束，不是 Quire 或 NotePlan 的产品事实。

| 当前概念 | 当前语义 | 对本次借鉴的约束 |
|---|---|---|
| Task | 一个被记录时间的 Roam 工作单元，可有多个 Session | 不再创建外部任务副本 |
| Session | 归属于一个 Task 的单段 CLOCK 区间 | 不把“近期可切换任务数”叫 Sessions |
| Focused CLOCK | 唯一没有结束时间的当前 Session | 任何视图都不能暗示多个 CLOCK 同时运行 |
| Active Work | Focused Task + 最近 45 分钟窗口内的可返回任务 | 数量表示工作集合，不代表并行计时 |
| Pomodoro Cycle | 跨任务无缝切换共享的全局工作周期 | 不能变成每个任务独立倒计时 |
| Dashboard | 对已写入 CLOCK 的时间、Session、Task roll-up 做分析 | 不能变成第二个项目管理数据库 |

**推断：** Task Tracker 应该吸收“视图能力”，而不是吸收 Quire / NotePlan 的“数据模型”。Roam block UID、父子层级、TODO/DONE 状态和 CLOCK 文本仍然是唯一事实来源；新功能最好是读模型、索引或面板状态，而不是新建任务实体。

## 2. Quire

### 2.1 核心理念

**事实：** Quire 官方把两个概念放在产品基础位置：Task 是动作的基本单位，Project 是任务的层级集合；任务可以继续拆成子任务。官方产品说明把 Quire 描述为嵌套任务列表与 Kanban 的结合，核心目标是把复杂项目拆成可执行的小步骤，再用不同视图管理它们。

来源：[Quire 101：Tasks, Subtasks & Projects](https://quire.io/blog/p/Quire-101.html)、[Organization vs. Project vs. Task](https://quire.io/faq/hierarchy?lang=en)、[Quire Features](https://quire.io/features)。

**推断：** Quire 的本质是“结构化项目执行系统”，而不只是计时器。它允许用户先建立任务结构，再根据工作方式切换 Tree、Board、Timeline 等视图。对于 Task Tracker，值得借鉴的是“同一份任务数据可以有多个轻量观察视图”，不值得借鉴的是完整的项目/组织/成员数据层。

### 2.2 核心功能

#### 层级任务树

**事实：** Quire 的 Tree / Nested List 用父任务、子任务和更深层级拆解项目；官方产品资料明确将项目描述为任务集合，将任务描述为可继续拆分的基本行动单元。

来源：[Project Views](https://quire.io/guide/project-view/)、[Organization vs. Project vs. Task](https://quire.io/faq/hierarchy?lang=en)。

**对 Task Tracker 的启发：**

- Dashboard 的任务行应保留父子层级，而不是筛选后把子任务打平。
- 父任务被筛选命中时，应该允许保留最小父路径，让用户知道子任务属于哪个工作上下文。
- “全部展开 / 全部折叠”是高价值的交互，因为它只改变视图，不改变 Roam 数据。
- 可以借鉴 Quire 的 Task Bundle 思路：排序或筛选时仍把子任务作为父任务下的 bundle 保持在一起。

来源：[Task Bundle](https://quire.io/guide/task-bundle/)。

#### 多视图

**事实：** Quire 官方列出六种 workspace view：Tree、Board、Table、Timeline、Calendar 和 Time Tracking；用户可通过主面板右上角的视图选择器切换。Tree 用于层级任务，Board 用于状态列，Timeline 用于带持续时间的横向计划，Calendar 用于日期与里程碑，Time Tracking 用于记录任务耗时。

来源：[Project Views](https://quire.io/guide/project-view/)。

**重要但次级的事实：** Quire 的 Timeline 是 Gantt 式横向时长视图，左侧保留嵌套任务列表；Calendar 可以按月或周显示任务、截止日期和里程碑；Table 是带自定义字段和公式的表格数据库；Time Tracking 可使用 Stopwatch、Pomodoro 或手工录入。

来源：[Project Views](https://quire.io/guide/project-view/)、[Calendar View](https://quire.io/guide/quire-calendar-view/)、[Time Tracking](https://quire.io/guide/time-tracking-timer/)。

**对 Task Tracker 的启发：** 不要把六种视图全部搬入插件。Task Tracker 当前最需要的是：

- 一个快速切换的 Active Work 面板；
- 一个层级化的 Today Open 视图；
- 一个只读的 Dashboard 分析视图。

看板、Gantt 和 Calendar 在 Quire 中服务的是“计划、排期和团队项目调度”，而 Task Tracker 当前服务的是“Roam 中今天要做什么，以及实际时间去了哪里”。两者目标不同。

#### My Tasks 与聚合视图

**事实：** Quire 的 My Tasks 是默认的全局视图，汇总跨项目、跨组织分配给当前用户的任务、用户自己创建的任务和个人任务；它不仅有 Tree，还支持 Board、Table、Timeline、Calendar 和 Time Tracking。默认可按日期/项目排序，完成超过 30 天的任务会自动隐藏。

来源：[My Tasks](https://quire.io/guide/my-tasks/)。

**对 Task Tracker 的启发：** 这是最值得直接借鉴的产品思想。Task Tracker 可以提供一个只读的 **Today Open** 或 **Today TODOs** 视图：

- 只扫描当前 Daily Page 或明确的当天范围；
- 只展示未完成的 Roam TODO；
- 父子关系折叠展示；
- 点击标题跳回原 block；
- 点击播放图标把原 block 设为 Focused；
- 不复制任务、不改变原 block 的位置、不产生新的 CLOCK，直到用户明确点击播放。

与 Quire My Tasks 的差别是：Task Tracker 不做跨组织任务聚合，也不引入分配人与个人任务数据库；它聚合的是 Roam 图谱中已有的 block。

#### 筛选、排序和分组

**事实：** Quire 的默认 Active Tasks 视图会隐藏完成任务；过滤器支持 Active Tasks、All Tasks、To-Do、In Progress、Completed Tasks 等状态视图；还可以按日期、优先级、负责人、状态、标签、Sublist 和自定义字段分组，并按日期、名称、优先级或状态排序。

来源：[Filters and Sorts](https://quire.io/guide/filter-sort/)。

**对 Task Tracker 的启发：** Dashboard 可以借鉴“状态过滤 + 列排序”的交互，但应保持 Roam 原生可解释性：

```text
状态：Open | Done | All
排序：最近触达 | Sessions | Own | Total
层级：保留父级 | 仅看匹配项
```

“最近触达”是 Task Tracker 的产品语义：最近一次 Focused CLOCK 或最近一次可识别的 Session 结束时间；不能把它伪装成 Quire 的更新时间或一个新的 Roam 属性。

#### 依赖与阻塞

**事实：** Quire 的 Task Dependency 目前支持 Finish-to-Start：后继任务要等前置任务完成。依赖可在详情面板、Tree 右键菜单或 Timeline 连接线中建立；Timeline 会显示连接线，Dashboard 可列出被阻塞任务；项目还可以开启“有未完成前置任务时阻止完成”的规则。

来源：[Task Dependency](https://quire.io/guide/task-dependency/)。

**推断：** 依赖是项目排程系统的强项，但对 Task Tracker 不是当前优先级。Roam TODO/DONE 是用户原生状态，插件若强制阻止 DONE，会改变用户对 Roam checkbox 的预期；如果插件自动推断父子依赖，又会把“层级关系”错误地当成“先后关系”。

未来若确实需要，可以先做只读的 **Blocked / Waiting** 提示，并且必须有明确的 Roam 表达方式（例如用户显式写入某种链接或标签）；第一阶段不做自动阻止完成、不自动改写 TODO。

#### 日期、重复任务与模板

**事实：** Quire 任务支持 due date、start date、具体时间和重复规则；重复任务在完成后按规则重新生成，支持日、周、月、年等周期，并可选择以最近一次完成时间为下一次日期的基准；子任务默认也可随重复任务生成。

来源：[Set Date and Time](https://quire.io/guide/set-date-time/)。

**事实：** Quire 的模板主要通过复制项目或任务实现；官方模板博客说明，描述、负责人、标签、日期、附件和关注者可以复制，评论不会复制。

来源：[Project and Task Templates](https://quire.io/blog/p/Template-for-Your-Projects-and-Tasks.html)、[Quire Templates](https://quire.io/blog/p/quire-templates.html)。

**推断：** Task Tracker 不应马上自动生成重复 Roam blocks。自动生成会带来 UID、父子位置、原有 CLOCK 归属和重复实例的边界问题。若将来需要，应优先提供“只读识别重复模式”或“用户确认后插入模板”的显式动作，并把生成动作与计时动作彻底分开。

#### 项目、文件夹、Section、Sublist 与 Smart Folder

**事实：** Quire 把 Organization 用作项目集合，把 Project 用作任务集合；Folder 组织多个项目，Section 在一个项目内部组织任务，Sublist 是同一项目任务的个性化/过滤视图，Smart Folder 可以跨组织聚合项目。Section 还支持多级层级；Sublist 中的更改会反映回主列表。

来源：[Organization vs. Project vs. Task](https://quire.io/faq/hierarchy?lang=en)、[Folders](https://quire.io/guide/sidebar-folders/)、[Sections](https://quire.io/guide/sections/)、[Sublists](https://quire.io/guide/create-sublists/)、[Smart Folders](https://quire.io/guide/smart-folders/)。

**对 Task Tracker 的启发：** Quire 很好地把“实体层级”和“视图层级”分开：Project/Task 是实体，Sublist/Smart Folder 是视图。Task Tracker 应借鉴这个区分，但以 Roam 结构实现：

- Roam block 父子关系 = 原生实体层级；
- Today Open / Active Work / Done = 只读视图；
- 不新增 Project、Folder、Area、Sublist 数据结构；
- 不让一次筛选动作改变原 block 的父子位置。

### 2.3 重要但次级功能

#### 项目进度、统计与活动

**事实：** Quire 的 Project Overview 提供项目健康、任务状态分布、截止日期日历和成员活动等固定 widget；Overview 也支持项目日期、进度统计、每周摘要和活动日志。自定义 Dashboard/Insight 可用于更自由的数据分析。

来源：[Project Overview](https://quire.io/guide/project-overview/)、[Quire Features](https://quire.io/features)。

**对 Task Tracker 的启发：** Dashboard 可以借鉴“先给摘要，再给细节”的信息层级：Today、Selected Range、Sessions、Tasks Tracked、Own、Total 等数据应先表达清楚，再让用户进入 Activity 或按 Task 细节。图表应是可解释数据的辅助，不应占据首屏并遮蔽任务操作。

#### 协作、角色、聊天、通知与集成

**事实：** Quire 支持多负责人、实时协作、评论、Chat、通知、离线访问、角色/权限、外部团队和多种集成。项目工作区由 List、Sublist、Dashboard、Document、Chat、Insight 和 Overview 等空间组成。

来源：[Quire Features](https://quire.io/features)、[Project Workspace](https://quire.io/guide/project-workspace/)、[Chat](https://quire.io/guide/chat/)、[Permission Roles](https://quire.io/guide/permission-role/)。

**推断：** 这些能力属于团队协作产品，不应成为 Task Tracker 的主线。Roam 本身可以承载协作图谱，但 Task Tracker 当前没有负责人、权限和多人实时冲突解决模型。引入它们会扩大授权边界、写入边界和性能测试面；与当前用户需求相比，收益明显低于 Today Open、层级聚合和快速导航。

### 2.4 Quire 的交互模型

**事实：** Quire 官方把界面分成 Sidebar、Main Panel 和 Detail Panel：Sidebar 切换 My Tasks、组织、项目、书签和 Smart Folder；Main Panel 展示项目与视图；Detail Panel 展示任务详情。任务可以通过视图选择器切换布局，详情面板可固定，快捷键和拖拽用于快速导航、排序和排期。

来源：[Quire User Interface](https://quire.io/guide/user-interface/)。

**交互特征：**

1. 左侧是跨项目导航，中央是当前视图，右侧是对象详情。
2. 同一任务数据在不同视图之间切换，视图改变不等于任务复制。
3. Board/Timeline/Calendar 都是直接操作任务的计划界面。
4. My Tasks / Smart Folder / Sublist 是降低跨项目切换成本的聚合层。

**对 Task Tracker 的借鉴：** Task Tracker 已经与 Roam 的右侧 Sidebar/侧边栏导航结合，最适合借鉴“点击任务立即定位原对象”和“聚合视图不复制对象”。不建议把 Quire 的三栏布局完整移植到插件弹窗；插件弹窗应继续保持轻量，详情回到 Roam 原生侧边栏。

## 3. NotePlan

### 3.1 核心理念

**事实：** NotePlan 官方将产品定位为 Tasks、Notes 和 Calendar 的一体化工作空间：Daily/Weekly Notes 用于日常计划与反思，Project Notes 用于长期目标、任务、链接和截止日期，Calendar 与 Time Blocking 负责把任务放入时间上下文；数据使用 Markdown/纯文本组织，并以链接连接笔记、任务和日期。

来源：[NotePlan Features](https://noteplan.co/features)、[NotePlan 官网](https://noteplan.co/)、[Daily Notes](https://help.noteplan.co/article/43-part-1-daily-notes)、[Project Notes and Backlinks](https://help.noteplan.co/article/63-part-3-project-notes-and-backlinks)。

**事实：** NotePlan 的 Daily Note 是每天一个独立的日历笔记；官方建议把当天的任务、目标、Timeblocking、会议笔记、想法、提醒和日记先放进当天笔记，称 Daily & Weekly Notes 为工作入口 / Inbox。

来源：[Daily Notes](https://help.noteplan.co/article/43-part-1-daily-notes)。

**推断：** NotePlan 的核心不是“任务列表优先”，而是“在当前日期和当前笔记上下文里处理任务”。这与 Roam Daily Page 的使用方式高度相似，因此它对 Task Tracker 的最大启发不是复制 NotePlan 的文件夹，而是把“今天的未完成 TODO”做成当前工作入口。

### 3.2 核心功能

#### Markdown 任务与多状态

**事实：** NotePlan 的任务是 Markdown 文件中的文本行；官方文档列出 open、done、canceled、rescheduled 等任务状态，并使用 Markdown 标记保存状态。任务还可以带日期标签、完成时间、Wiki link、tag 和 mention。

来源：[Elements of a Task](https://help.noteplan.co/article/42-elements-task)。

**事实：** NotePlan 的 Daily Note 与 Project Note 都能放任务。Project Note 中的任务添加日期后，会在相应 Daily Note 的 reference 区域出现；用户可以直接在 Daily Note 中完成该引用任务，或点击任务回到 Project Note。

来源：[Project Notes and Backlinks](https://help.noteplan.co/article/63-part-3-project-notes-and-backlinks)。

**对 Task Tracker 的启发：** 这与 Roam 的 block UID / parent path 模型非常接近。Task Tracker 可借鉴“任务聚合项仍指向源任务”的交互：面板里显示的是一个投影，点击后跳回原 block；面板中的 DONE/聚焦动作也应作用于原 block，而不是创建副本。

#### 日历、日期调度与时间块

**事实：** NotePlan 支持在 Project Note 中给任务添加日期，任务随后出现在对应的 Daily Note；也支持把任务拖到右侧 Timeline 建立 Time Block。Time Block 可以从任务、checklist、bullet 或 heading 创建，支持自然语言时间和可选结束时间；开始时可以通知，也可以同步为外部日历事件。

来源：[How to Schedule Tasks](https://help.noteplan.co/article/110-how-to-schedule-tasks)、[Time Blocking](https://help.noteplan.co/article/121-time-blocking)、[Sync Timeblocks with your Calendar](https://help.noteplan.co/article/217-sync-timeblocks-with-your-calendar)。

**重要但次级的事实：** NotePlan 可以显示最多 7 天的多日 Timeline，也可以切换为事件/提醒列表；Timeline 会随所选 Daily/Weekly Note 更新。

来源：[Multi-Day Timeline](https://help.noteplan.co/article/201-multi-day-timeline)。

**推断：** NotePlan 的 Time Block 是“计划占用时间”，Task Tracker 的 CLOCK 是“实际发生时间”。两者可以在产品概念上互补，但不能共用一个字段：

```text
Planned Block = 计划：我希望什么时候处理
Focused CLOCK = 事实：我实际什么时候处理
Session = 事实：某个 Task 的一段实际时间区间
```

第一阶段不要引入 Time Block；如果未来要做，必须在 Dashboard 单独显示为 Planned / Actual，并且任何计划拖拽都不能伪造 CLOCK。

#### 搜索、过滤、聚合与保存视图

**事实：** NotePlan 提供预定义过滤器 All Tasks、Note Tasks、Overdue 和 Upcoming；自定义 Filter 可以按任务状态、文本、标签、mention、路径、来源、日期范围等条件组合。结果可编辑，也可以选择日期范围和按新旧排序。

来源：[Search & Filters](https://help.noteplan.co/article/95-part-6-search-review)、[Advanced Search](https://help.noteplan.co/article/269-advanced-search)。

**事实：** NotePlan 的 Sidebar Filters 可以与笔记并排显示；使用 `{{currentNote}}` 作为 Path contains 条件后，过滤结果会跟随当前打开的 note 或日期自动刷新。

来源：[Sidebar Filters](https://help.noteplan.co/article/223-how-to-open-sidebar-filters)。

**事实：** NotePlan 的 Folder Views 可以在文件夹及其子文件夹中查看 Notes 或 Tasks，以 List 或 Cards/Kanban 展示；支持显示字段、过滤、分组、排序，并保存多个 named views。任务可以通过带属性的 tag 或 frontmatter 暴露 status、assignee、priority 等字段。

来源：[Folder Views](https://help.noteplan.co/article/238-notes-table-and-other-views)、[Find and Organize Notes](https://help.noteplan.co/article/94-part-5-find-notes-with-the-command-bar)。

**对 Task Tracker 的启发：** NotePlan 的“跟随当前上下文的过滤器”非常适合 Task Tracker 的 Today Open：当前 Daily Page 改变时，面板重新读取当天的 TODO；当前工作上下文改变时，任务列表保留可折叠父级关系。建议先提供少量稳定预设，再考虑用户自定义查询，避免一开始做成查询语言。

#### 重复任务与自动模板

**事实：** NotePlan 的重复任务有三种官方方式：通过任务菜单复制到未来笔记、使用自动插入模板、或使用 Apple Reminders。重复任务可以用 `@repeat(occurrence/total)` 标记实例；自动插入模板可以在新建 Daily/Weekly/Monthly/Quarterly/Yearly Note 时按规则插入。

来源：[Repeating Tasks](https://help.noteplan.co/article/106-how-to-create-a-recurring-or-repeating-todo)、[Auto-Insert Templates](https://help.noteplan.co/article/229-auto-insert-templates)。

**事实：** NotePlan Templates 由 Properties/Frontmatter 和 Body 组成，可以插入动态日期、提示、条件和 JavaScript；官方把 Meeting Note、Daily Note 和 Project Note 作为模板场景。

来源：[Templates](https://help.noteplan.co/article/136-templates)、[Meeting Notes](https://help.noteplan.co/article/134-meeting-notes)。

**推断：** NotePlan 的模板思想可借鉴为“减少重复安排的交互”，但不能原样搬入 Task Tracker。Task Tracker 的主要持久化动作是 CLOCK；自动复制 Roam TODO 可能造成多个 block UID、多个重复时钟归属和 Today Open 重复统计。若要做模板，应是明确的用户触发、可预览、可撤销的 Roam block 插入，不应在打开面板或跨日时自动写图谱。

#### 项目、区域与知识组织

**事实：** NotePlan 支持 Project Notes 和 folders；官方推荐 PARA 作为一种组织方式：Projects 放有截止日期的任务集合，Areas 放需要持续维护的责任范围，Resources 放长期感兴趣的主题，Archive 放不再活跃的内容。

来源：[PARA / Folders](https://help.noteplan.co/article/155-how-to-organize-your-notes-and-folders-using-johnny-decimal-and-para)、[Project Notes Best Practices](https://help.noteplan.co/article/93-part-4-project-notes-best-practices)。

**推断：** PARA 对个人知识管理很有价值，但 Task Tracker 不需要把 Roam 变成 PARA 文件系统。Roam 的 page、block、parent path、tag 和 link 已经承担了上下文组织；Task Tracker 应在 Dashboard 中显示上下文，而不是强迫用户重分类。

#### 进度、统计与协作

**事实：** NotePlan 官网将 Plugins 描述为可自动化任务、跟踪统计和扩展组织方式；官方 Folder Views 提供字段、分组、筛选和排序，但在本次核验的官方资料中，没有发现一个等同于 Quire Project Overview 的固定项目健康/完成率/成员活动 Dashboard 说明。

来源：[NotePlan Features](https://noteplan.co/features)、[Folder Views](https://help.noteplan.co/article/238-notes-table-and-other-views)。

**重要但次级的事实：** NotePlan 的 Spaces 是与私人笔记分离的共享工作区，可以共享 notes、folders 和 calendar entries；成员可以通过原生 app、Web 版本或只读 Web 页面访问，且有 Guest、Member、Admin 角色。

来源：[NotePlan Spaces](https://help.noteplan.co/article/230-noteplan-for-teams)。

**事实：** NotePlan 还支持共享/发布笔记、Synced Lines 和 Apple Reminders 双向同步；Synced Line 可以把同一行任务镜像到不同笔记，完成状态会同步回原始项目笔记。

来源：[Synced Lines](https://help.noteplan.co/article/138-synced-blocks)、[Reminder <> Task Sync](https://help.noteplan.co/article/282-reminder-task-sync)、[Publish a Note](https://help.noteplan.co/article/130-how-to-publish-a-note-on-the-web)。

**推断：** 这些能力说明 NotePlan 重视“同一任务在不同上下文中可见”。Task Tracker 可以借鉴“投影指向原任务”的原则，但不应复制同步行、外部提醒或多人共享模型；Roam block UID 本身已经提供源对象身份，插件只需保证导航和状态操作始终回到源 block。

### 3.3 NotePlan 的交互模型

**事实：** NotePlan 是 editor-first：任务直接写在 Markdown 笔记里；用户通过任务左侧菜单完成、取消、调度或发送到提醒，通过拖拽把任务放入右侧 Timeline，通过 Command Bar 快速搜索/切换，通过 reference/backlink 返回任务来源；标题可折叠，项目笔记与 Daily Note 可并行查看。

来源：[Daily Notes](https://help.noteplan.co/article/43-part-1-daily-notes)、[Tasks, Events and Reminders](https://help.noteplan.co/article/52-part-2-tasks-events-and-reminders)、[Project Notes and Backlinks](https://help.noteplan.co/article/63-part-3-project-notes-and-backlinks)、[Sidebar Filters](https://help.noteplan.co/article/223-how-to-open-sidebar-filters)。

**交互特征：**

1. 笔记编辑器是任务的源头，聚合视图是投影。
2. 日期是连接项目任务与日常工作的桥梁。
3. 右侧 Sidebar 是时间线、过滤器和外部日历的上下文面板。
4. 拖拽和快捷键用于调度，任务本身仍保留在原笔记中。
5. 折叠标题和引用区降低了 Daily Note 的视觉噪声。

**对 Task Tracker 的借鉴：** “面板展示投影，点击回源 block”与当前插件方向一致；“当前页面跟随过滤”也比完整跨项目数据库更贴近 Roam。

## 4. 功能对照矩阵

下表的产品功能是官方资料事实；最后一列是针对 Task Tracker 的推断建议。

| 能力 | Quire | NotePlan | Task Tracker 建议 |
|---|---|---|---|
| 核心模型 | Project → Task → 子任务，任务系统优先 | Markdown Notes + Tasks + Calendar 一体化 | 保持 Roam block 为唯一源；面板只做读模型 |
| 层级任务 | Nested Tree，支持深层子任务 | Markdown 缩进、heading 和折叠；Project Note 承载结构 | 借鉴父子折叠、Task Bundle、父级上下文保留 |
| 列表 | Tree / List | 编辑器、Folder List | 保留 Dashboard 层级列表 |
| 看板 | Board，拖动状态列 | Folder Views 的 Cards/Kanban | 暂不做完整看板；最多做只读状态分组 |
| 时间线 | Gantt 式计划时间线 | 右侧 Timeline，主要承载 Time Block/事件/提醒 | 不把计划时间线当真实 CLOCK；未来可做 Planned/Actual 分离 |
| 日历 | 任务日期、月/周 Calendar、里程碑 | Daily/Weekly/Monthly/Yearly Notes、外部日历 | 借鉴“今日入口”；不引入第二日历系统 |
| 聚合视图 | My Tasks、Smart Folder、Sublist | Filters、Folder Views、Sidebar Filters | 做 Today Open + Active Work；只读原始 block |
| 过滤 | Active/All/To-Do/In Progress/Completed、自定义条件 | Open/Done/Canceled/Scheduled、日期、标签、路径、来源、自定义 Filter | 先做 Open/Done/All；再加当天、父级、最近触达 |
| 排序/分组 | 日期、优先级、状态、负责人、标签等 | 字段、frontmatter、日期、路径、分组和保存视图 | Sessions / Own / Total / 最近触达；保持父子结构 |
| 依赖 | FS predecessor/successor，可阻止完成 | 本次核验未找到官方原生依赖说明 | 暂不做强制依赖；未来只读 Blocked 提示 |
| 优先级 | 原生 priority，可筛选/批量设置 | `!` 等 Markdown 标记、tag/frontmatter，可与 Reminders priority 同步 | 仅在已有 Roam 语法上显示，不新增字段写入 |
| 重复任务 | 按规则完成后生成下一实例，子任务可重复 | 复制、`@repeat`、自动模板、Reminders | 暂不自动生成 block；避免 UID/计时重复 |
| 模板 | 复制项目/任务与官方模板库 | Frontmatter + Body + 动态/JS + 自动插入 | 未来可做显式、可预览、可撤销的 Roam 模板 |
| 时间块 | Stopwatch、25 分钟 Pomodoro、手工时间项 | 拖拽任务到 Timeline，计划时段，可通知/同步日历 | 不替代实际 CLOCK；保持全局 45 分钟工作周期 |
| Daily Note | 不是产品核心数据入口 | 每日一个独立笔记，是日常 Inbox | 直接利用 Roam Daily Page 做 Today Open |
| 项目/区域 | Organization、Project、Folder、Section、Sublist、Smart Folder | Project Notes、folders、PARA Projects/Areas/Resources/Archive | 不复制层级；用 Roam page/block/tag 承担上下文 |
| 进度/统计 | Overview widgets、Dashboard、Charts、Time Reports | 官方资料重点是过滤/字段/插件统计，本次未找到固定项目健康 Dashboard | 保持紧凑数据 Dashboard；图表按需，不遮挡任务操作 |
| 协作 | 负责人、评论、Chat、权限、通知、实时协作 | Spaces、共享笔记/文件夹/日历、角色、Web/只读发布 | 不纳入当前主线；Roam 协作不等于任务权限系统 |

## 5. 值得借鉴的方案

### P0：Today Open / Today TODOs

**来源依据：** Quire My Tasks 的跨项目聚合、Quire Active Tasks 的默认开放任务过滤、NotePlan Daily Note 与 Sidebar Filter 的当前上下文跟随机制。

来源：[Quire My Tasks](https://quire.io/guide/my-tasks/)、[Quire Filters](https://quire.io/guide/filter-sort/)、[NotePlan Daily Notes](https://help.noteplan.co/article/43-part-1-daily-notes)、[NotePlan Sidebar Filters](https://help.noteplan.co/article/223-how-to-open-sidebar-filters)。

**建议方案：** 在 Task Tracker 当前面板增加一个可切换的“Today Open”视图：

- 默认读取今天的 Roam Daily Page 或当前约定的当天范围；
- 只显示未完成的原生 TODO；
- 识别父子关系并默认折叠；
- 显示父级但不重复渲染所有祖先路径；
- 当前 Focused 任务显示正在计时标识；
- 已在 Active Work 中的任务显示可切换状态；
- 未计时的任务显示播放按钮，点击后才成为 Focused；
- 点击任务标题只导航到原 block；
- Shift 点击沿用 Roam 侧边栏逻辑；
- 不写入任务副本，不创建新 block，不因为“展示”而产生 Session。

**为什么优先：** 它直接解决“我现在还可以切换到哪些今天任务”的问题，价值高、模型简单、对现有计时规则影响小。

### P0：轻量过滤与排序

**建议方案：** 首版只提供：

```text
状态：Open | Done | All
范围：Today | Active Work | Dashboard Range
排序：Recent | Sessions | Own | Total
层级：保留父级（默认）| 仅匹配行
```

其中：

- `Open / Done / All` 对应 Roam 原生 TODO/DONE，不新增状态枚举。
- `Recent` 使用已有 Session / Focused 事件推断，不新增 `updatedAt` 字段。
- `Sessions`、`Own`、`Total` 直接使用 Dashboard 已有聚合数据。
- 排序时默认保留父级上下文，借鉴 Quire Task Bundle；不要像普通表格一样把子任务拆散。
- “保存视图”可以先保存到插件本地设置，不写入 Roam；默认只提供 2–3 个系统预设，避免设置膨胀。

### P0：明确 Active Work 与真实计时的双层语义

**建议方案：** 延续当前词汇：

```text
Active Work = 当前 Focused + 45 分钟窗口内可返回的工作项
Focused = 唯一真实计时项
Session = 一段已经写入 CLOCK 的时间区间
```

面板应把三者排版分开：

- `Focused` 区域告诉用户当前实际投入对象；
- `Active Work` 区域告诉用户有哪些工作线可以快速切换；
- `Session` 只在计时详情和 Dashboard 历史统计中出现。

**为什么不采用 Quire 的多任务计时：** Quire 的官方 Time Tracking 是按任务记录时间，Stopwatch 每次开始/停止形成一个时间项，Pomodoro 是每个计时器的 25 分钟 focus session。Task Tracker 的目标是用一个真实 CLOCK 记录用户实际处理时间，再用 45 分钟窗口表达近期并行工作；直接采用多任务计时会让 Dashboard 把“同时存在的工作线”误算成“同时消耗的用户时间”。

来源：[Quire Time Tracking](https://quire.io/guide/time-tracking-timer/)。

### P1：父级上下文保持与全部展开/折叠

**来源依据：** Quire Tree / Task Bundle、NotePlan 的 Markdown 层级与 heading 折叠。

来源：[Quire Project Views](https://quire.io/guide/project-view/)、[Quire Task Bundle](https://quire.io/guide/task-bundle/)、[NotePlan Daily Notes](https://help.noteplan.co/article/43-part-1-daily-notes)。

**建议方案：** Today Open 与 Dashboard 的 Task rows 共享一套树投影：

1. 每个匹配的子任务最多保留一条必要父级上下文。
2. 父级行可展开/折叠，但父级自身不因“仅用于上下文”而重复计数。
3. 全部展开/折叠只改变 DOM 视图状态，不改变图谱。
4. 过滤、排序和统计都基于原始 UID；树形投影只负责呈现。
5. 统计时 Session 仍按 UID 去重，防止父子 roll-up 在多个展示行中重复累计。

### P1：Dashboard 的信息层级

**来源依据：** Quire Overview 先显示固定摘要 widget，再提供任务状态、截止日期和活动；NotePlan Folder Views 允许用户按需显示字段、筛选、分组和保存视图。

来源：[Quire Project Overview](https://quire.io/guide/project-overview/)、[NotePlan Folder Views](https://help.noteplan.co/article/238-notes-table-and-other-views)。

**建议方案：** Task Tracker Dashboard 保持三层：

1. **Summary**：Today、Selected Range、Sessions、Tasks Tracked、Active Work；数字旁边必须有明确单位和范围。
2. **Running / Focused**：只展示当前唯一 Focused CLOCK，以及必要的快速操作。
3. **By Task**：展示层级任务、Sessions、Own、Total，支持 Open/Done/All、排序、展开/折叠。

Activity 柱状图继续作为分析视图，但默认不让图表抢占任务操作区；如果数据稀疏，柱宽随桶数量和有效数据密度自适应，空桶只保留日期参照，不制造视觉噪声。

### P2：计划时间块（可选，必须与实际时间分离）

NotePlan 的 Time Blocking 对“计划在某个时间处理任务”很有启发，但 Task Tracker 目前不需要直接实现。若未来用户确实要计划层，建议增加一个单独的只读/轻写模型：

```text
Planned: 10:00–10:45 处理任务 A
Actual:  10:07–10:38 Focused CLOCK
Variance: -7m / -7m
```

硬性规则：

- 拖拽或编辑 Planned 不得写入 CLOCK。
- CLOCK 仍由用户的 Focus/切换/Clock Out 行为产生。
- Planned 与 Actual 在 Dashboard 分列，不合并成一个“总耗时”。
- 未明确启用前，不扫描或解释普通文本中的时间，避免误识别。

## 6. 不建议借鉴的能力

| 不建议直接引入 | 主要理由 |
|---|---|
| Quire 的 Organization / Project / Folder / Section 全套实体层 | Roam 已有 page、block、parent path、tag、link；再建一套层级会造成双重归类和维护负担 |
| 完整 Kanban Board | 需要持久化状态列、拖拽写入、排序和并发冲突处理；当前插件的主问题是快速聚焦和真实计时，不是团队流程管理 |
| Gantt / 任务依赖强制 | 需要 start/due/dependency 字段；“父子关系”不能自动等同于先后依赖；强制 DONE 会改变 Roam 原生 checkbox 预期 |
| Quire 的多任务时间项 / 25 分钟 Pomodoro | 会把工作集合与实际时间混淆；Task Tracker 已经定义了一个 Focused CLOCK 和全局 45 分钟工作周期 |
| NotePlan 的文件夹/Projects/Areas/Resources/Archive | 这是知识库组织法，不是 Task Tracker 的计时模型；引入后用户要重复维护 Roam 页面与插件分类 |
| 自动重复任务、自动跨日复制 | 可能创建重复 Roam block、重复 UID 和错误的计时归属；还会在用户没有明确动作时写图谱 |
| 外部 Calendar / Reminders 双向同步 | 会引入权限、同步冲突、外部事件与实际 CLOCK 的语义冲突；当前需求没有外部日历目标 |
| 团队角色、权限、Chat、负责人 | Task Tracker 目前是个人 Roam 工作流的效率面板，不是协作权限系统 |
| 复杂自定义字段和查询语言 | 会增加解析成本、设置成本和性能风险；先用原生 TODO/DONE、父子关系、Session 聚合即可 |
| 为了显示而持续轮询全图谱 | 与插件“启动快、切换快”的性能目标冲突；应复用一次快照和已有增量/刷新边界 |

## 7. 推荐实施路线

### 第一阶段：只读任务聚合（最高优先级）

目标：让用户可以在 Task Tracker 面板里快速找到今天还没完成的任务。

- 增加 Today Open / Today TODOs 视图。
- 用 Roam block UID 建立行与源 block 的映射。
- 默认按原始父子顺序展示并折叠。
- 提供 Open / Done / All 切换。
- 支持点击导航、Shift 点击侧边栏、点击播放切换 Focused。
- 同一批图谱读取同时生成树投影和行索引，避免为每个任务单独查询。

验收标准：

- 展示 100 个以上当天 TODO 时仍可打开面板；
- 不新增 Roam block；
- 不新增 CLOCK；
- 父级折叠不会丢失子任务；
- DONE / 播放动作作用于原 UID；
- 侧边栏打开速度不回退。

### 第二阶段：Dashboard 轻量筛选与分析

目标：让 Dashboard 能回答“哪些未完成、哪些已完成、哪些消耗时间最多”。

- 增加 Open / Done / All。
- 增加 Sessions / Own / Total 正序/倒序。
- 默认保留父级上下文，支持全部展开/折叠。
- Summary 数字统一单位和范围文案。
- Activity 图表保留为分析辅助，不作为主任务交互区。
- 空数据、单柱、7 天、30 天和 All Time 统一使用自适应密度规则。

验收标准：

- 过滤后 Session 统计不重复；
- 父级 Total 与子级 Own 的关系清楚；
- 当前唯一 Focused CLOCK 不被过滤掉；
- Dashboard 不需要持续读取 Roam；
- 滚动、展开、排序不造成页面宽度跳动。

### 第三阶段：可选的计划层

只有在用户明确需要日程排期时才考虑：

- Planned Time Block 与 Actual CLOCK 分离；
- 只支持用户明确格式或显式操作；
- Dashboard 单独提供 Planned / Actual 对照；
- 绝不把计划时长计入 Own / Total；
- 不自动生成重复任务。

## 8. 最终产品判断

**Quire 最值得借鉴的三个点：**

1. My Tasks：把分散任务汇总成一个可以行动的入口。
2. Active Tasks + Filter/Sort：默认减少噪声，让用户先处理开放任务。
3. Task Bundle：无论筛选、排序还是聚合，都不要丢掉父子上下文。

**NotePlan 最值得借鉴的三个点：**

1. Daily Note 是当天工作入口，Project 任务可以投影到当天，但仍回到源任务。
2. Sidebar Filter 跟随当前 note/context，减少用户手动重新筛选的动作。
3. Planned Time Block 与任务/日历连接，但它本质是计划层，可以与实际完成记录分开。

**最重要的保留项：** Task Tracker 不应成为 Quire 或 NotePlan 的缩小复制品。它的产品价值来自一个更窄、更明确的承诺：

> 在 Roam 原生任务上，用一个真实的 Focused CLOCK 记录线性投入；同时把最近 45 分钟内仍可返回的工作线组织成 Parallel Threads；最后用 Dashboard 分析真实记录。

这个承诺决定了功能边界：

- 借鉴聚合，不复制任务；
- 借鉴层级视图，不建立 Project 数据库；
- 借鉴过滤排序，不引入复杂字段系统；
- 借鉴时间块的计划概念，但不混入实际 CLOCK；
- 借鉴清晰的摘要与分析，不堆叠完整 PM 套件；
- 所有计时写入仍由 Focused CLOCK 统一负责。

## 官方来源清单

### Quire

- [Quire Features](https://quire.io/features)
- [Quire 101: Tasks, Subtasks & Projects](https://quire.io/blog/p/Quire-101.html)
- [Organization vs. Project vs. Task](https://quire.io/faq/hierarchy?lang=en)
- [Quire User Interface](https://quire.io/guide/user-interface/)
- [Project Views](https://quire.io/guide/project-view/)
- [My Tasks](https://quire.io/guide/my-tasks/)
- [Filters and Sorts](https://quire.io/guide/filter-sort/)
- [Task Bundle](https://quire.io/guide/task-bundle/)
- [Task Dependency](https://quire.io/guide/task-dependency/)
- [Set Date and Time / Recurring Tasks](https://quire.io/guide/set-date-time/)
- [Time Tracking: Stopwatch, Pomodoro & Timesheets](https://quire.io/guide/time-tracking-timer/)
- [Calendar View](https://quire.io/guide/quire-calendar-view/)
- [Project Overview](https://quire.io/guide/project-overview/)
- [Project Workspace](https://quire.io/guide/project-workspace/)
- [Folders](https://quire.io/guide/sidebar-folders/)
- [Sections](https://quire.io/guide/sections/)
- [Sublists](https://quire.io/guide/create-sublists/)
- [Smart Folders](https://quire.io/guide/smart-folders/)
- [Project and Task Templates](https://quire.io/blog/p/Template-for-Your-Projects-and-Tasks.html)
- [Quire Templates](https://quire.io/blog/p/quire-templates.html)
- [Chat](https://quire.io/guide/chat/)
- [Permission Roles](https://quire.io/guide/permission-role/)

### NotePlan

- [NotePlan Features](https://noteplan.co/features)
- [NotePlan 官网](https://noteplan.co/)
- [Part 1: Daily Notes](https://help.noteplan.co/article/43-part-1-daily-notes)
- [Part 2: Tasks, Events and Reminders](https://help.noteplan.co/article/52-part-2-tasks-events-and-reminders)
- [Part 3: Project Notes and Backlinks](https://help.noteplan.co/article/63-part-3-project-notes-and-backlinks)
- [Part 4: Project Notes Best Practices](https://help.noteplan.co/article/93-part-4-project-notes-best-practices)
- [PARA / Folders](https://help.noteplan.co/article/155-how-to-organize-your-notes-and-folders-using-johnny-decimal-and-para)
- [Elements of a Task](https://help.noteplan.co/article/42-elements-task)
- [How to Schedule Tasks](https://help.noteplan.co/article/110-how-to-schedule-tasks)
- [Time Blocking](https://help.noteplan.co/article/121-time-blocking)
- [Sync Timeblocks with your Calendar](https://help.noteplan.co/article/217-sync-timeblocks-with-your-calendar)
- [Multi-Day Timeline](https://help.noteplan.co/article/201-multi-day-timeline)
- [Part 5: Find and Organize Notes](https://help.noteplan.co/article/94-part-5-find-notes-with-the-command-bar)
- [Part 6: Search & Filters](https://help.noteplan.co/article/95-part-6-search-review)
- [Advanced Search](https://help.noteplan.co/article/269-advanced-search)
- [Sidebar Filters](https://help.noteplan.co/article/223-how-to-open-sidebar-filters)
- [Folder Views](https://help.noteplan.co/article/238-notes-table-and-other-views)
- [How to create a repeating task](https://help.noteplan.co/article/106-how-to-create-a-recurring-or-repeating-todo)
- [Auto-Insert Templates](https://help.noteplan.co/article/229-auto-insert-templates)
- [Templates](https://help.noteplan.co/article/136-templates)
- [Meeting Notes](https://help.noteplan.co/article/134-meeting-notes)
- [Synced Lines](https://help.noteplan.co/article/138-synced-blocks)
- [Reminder <> Task Sync](https://help.noteplan.co/article/282-reminder-task-sync)
- [NotePlan Spaces](https://help.noteplan.co/article/230-noteplan-for-teams)
- [Publish a Note](https://help.noteplan.co/article/130-how-to-publish-a-note-on-the-web)

