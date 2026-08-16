# Org Mode LOGBOOK/CLOCK 格式评审

日期：2026-08-16  
范围：仅比较 Org Mode 官方手册、Emacs 官方源码镜像，以及本仓库当前实现与测试。  
执行边界：本次只新增研究文档，不修改生产代码，不提交、不推送。

## 结论先行

当前插件是“Roam 原生存储 + Org 形状的计时内容”，不是字节级兼容的 Org 文件格式。
计时的核心语义基本正确：一个未带结束时间的 `CLOCK::` block 表示正在运行，结束后补上结束时间和 `=> H:MM`；但有三个与 Org 默认行为不同的地方：

1. Org 的抽屉是 `:LOGBOOK:` … `:END:`，Org 的时钟关键字是 `CLOCK:`；插件写入的是 Roam block `LOGBOOK::` 和 `CLOCK::`。
2. Org 默认把同一任务的新 CLOCK 放在 LOGBOOK 顶部；插件把新 CLOCK 追加到 Roam drawer 的末尾，原始页面因此是旧→新，而插件读取后的列表会按开始时间新→旧排序。
3. Org 的正常汇总以起止时间戳计算；插件当前把已有的 `=> H:MM` 当作 `effectiveMinutes`，所以手工修改摘要会改变报表口径。这是最值得优化、也最需要谨慎迁移的差异。

## 1. 官方格式与当前格式

| 项目 | Org Mode 官方行为 | 本仓库当前行为 | 判断 |
|---|---|---|---|
| 抽屉 | `:LOGBOOK:`，内容结束于独立的 `:END:` | 任务下的 `LOGBOOK::` 子 block，CLOCK 是其子 block | 结构语义相似，文本格式不同 |
| 已结束 CLOCK | `CLOCK: [start]--[end] => H:MM` | `CLOCK:: [start]--[end] => H:MM` | 仅关键字多一个 `:` |
| 运行中 CLOCK | `CLOCK: [start]`，没有结束时间和摘要 | `CLOCK:: [start]` | 语义一致 |
| 多次记录 | 默认最新记录在 LOGBOOK 顶部；可由 Org 配置改变 | 新 block 追加到末尾；读取时单独按 start 降序排序 | 展示可接受，原始顺序不一致 |
| 零分钟 | 默认保留 `=> 0:00`；`org-clock-out-remove-zero-time-clocks` 开启时才删除 | 保留 `=> 0:00`；结束时间早于开始时间时钳制为同一时刻 | 与默认保留策略一致 |

Org 手册把 drawer 写作通用的 `:DRAWERNAME:` … `:END:` 结构，并说明 `LOGBOOK` 是保存状态日志和 clock 时间的推荐 drawer；clocking 手册给出的关闭动作也是在原位置写入第二个 timestamp，并计算 `=>HH:MM`。见 [Drawers](https://orgmode.org/manual/Drawers.html)、[Clocking commands](https://orgmode.org/manual/Clocking-commands.html)。

## 2. 需要特别确认的格式细节

### 抽屉语法

Org 的 drawer 起止行必须是独立行：

```text
:LOGBOOK:
  CLOCK: [2026-08-16 Sun 18:13]--[2026-08-16 Sun 18:14] => 0:01
:END:
```

`LOGBOOK` 不是必须的唯一 drawer 名称，但它是 Org 手册推荐的 clock/log drawer。官方源码的 drawer 正则也是以冒号包围名称、以独立 `:END:` 收尾。本仓库的 [org.js](../src/org.js) 则有意兼容 `:LOGBOOK:`、`LOGBOOK:` 和 `LOGBOOK::`，测试也明确覆盖了这些拼写（见 [test/org.test.js](../test/org.test.js)）。

### CLOCK 语法与运行状态

Org 正常生成的两种形态是：

```text
CLOCK: [2026-08-16 Sun 18:38]
CLOCK: [2026-08-16 Sun 18:13]--[2026-08-16 Sun 18:14] => 0:01
```

官方 `org-element` parser 将第一种视为 running clock；结束时由 `org-clock-out` 写入结束 timestamp 和 duration。Emacs 官方镜像中的 [org-clock.el](https://github.com/emacs-mirror/emacs/blob/master/lisp/org/org-clock.el)、[org-element.el](https://github.com/emacs-mirror/emacs/blob/master/lisp/org/org-element.el) 是本结论的源码依据。

当前插件的 [formatClockLine](../src/org.js) 正好保持“没有 end 就是运行中”的持久化约定；截图中最后一条 `CLOCK:: [2026-08-16 Sun 18:38]` 本身是正确的运行态表达，只是采用了 Roam 的 `::` 变体。

### `=> H:MM` 是否是权威数据

Org 会写入 duration 摘要，但它是由 timestamp 区间计算出来的结果。官方 `org-clock-sum` 对包含两个 timestamp 的 CLOCK 行按 start/end 计算分钟；`=>` 不是替代起止时间的主数据源。Org 也支持少见的“只有 `=> H:MM`”的 clock 表达，但那不是普通 clock-in/clock-out 的标准输出。

当前插件同时保存三种值：`computedMinutes`、`declaredMinutes` 和 `effectiveMinutes`。不过 [org.js](../src/org.js) 当前选择 `declaredMinutes ?? computedMinutes` 作为有效值，并在不一致时记录 `declared-duration-mismatch`；[test/org.test.js](../test/org.test.js) 还明确测试了“手工摘要优先”。因此，当前行为更像“兼容用户手工修正”，不是 Org 的默认汇总口径。

## 3. 多条 CLOCK 的顺序

Org 官方源码使用 `org-log-states-order-reversed` 控制日志顺序；默认值是 reversed，已有 LOGBOOK 时新 CLOCK 插入 drawer 开头，因此通常是最新在上、最旧在下。关闭该选项时可以按时间顺序追加。这个顺序是写入策略，不是 CLOCK 行本身的语法要求。相关说明见 [Tracking TODO state changes](https://orgmode.org/manual/Tracking-TODO-state-changes.html) 以及官方镜像的 [org.el](https://github.com/emacs-mirror/emacs/blob/master/lisp/org/org.el) 和 [org-clock.el](https://github.com/emacs-mirror/emacs/blob/master/lisp/org/org-clock.el)。

本仓库在 [clock.js](../src/clock.js) 中用子 block 数量作为新 CLOCK 的 order，所以 Roam 原始树是旧→新；[entries.js](../src/entries.js) 再把读取结果排序为最新开始时间在前。这个处理对 Dashboard 和弹窗是合理的，但不会让 Roam 页面里的原始 child 顺序看起来像 Org。

## 4. `::` 对 Roam 显示与语义的影响

在本仓库里，`LOGBOOK::` 和 `CLOCK::` 首先是 `:block/string` 的原始文本，真正的关联来自 Roam 的父子 block：

```text
TODO task
  LOGBOOK::
    CLOCK:: [start]--[end] => H:MM
```

`::` 让文本更适合 Roam 的属性/键值样式，但它也意味着这些 block 不能直接作为标准 Org 文本被 Org parser 原样识别：Org 期待的是行首 `:LOGBOOK:` drawer 和 `CLOCK:` keyword。插件通过查询 `LOGBOOK:` 相关 block，再由自己的 parser 同时兼容 Org/Roam 拼写来实现跨格式读取；见 [entries.js](../src/entries.js) 与 [org.js](../src/org.js)。本报告不把 Roam UI 对 `::` 的额外视觉装饰当作 Org 语义，因为当前允许的资料范围中没有引入 Roam 官方渲染规范。

## 5. 优化建议与迁移风险

### 安全、建议优先做

- 保持现有 Roam 写入格式和双向兼容读取，不自动把已有 `::` 改成 Org 冒号格式。
- 报表计算优先使用起止 timestamp；保留 `declaredMinutes` 作为审计字段，摘要与时间戳不一致时继续显示 Data Issue，不静默改写历史 block。
- 保持运行中 CLOCK 无 end、零分钟记录默认保留；这两点符合 Org 的持久化/审计习惯。
- 继续让 UI 按最新开始时间排序，不为了视觉顺序重排 Roam 原始 child；补充 Org 形态、Roam 形态、无摘要、零分钟和摘要不一致的回归测试。
- 如果以后需要真正导出 Org 文件，新增独立的 export formatter，输出 `:LOGBOOK:`、`CLOCK:`、`:END:`，不要改变 Roam 图谱内存储。

### 迁移风险高，当前不建议

- 批量把 `LOGBOOK::`/`CLOCK::` 重写成 `:LOGBOOK:`/`CLOCK:`：会改变 Roam block 的显示文本和现有查询边界。
- 批量重排已有 CLOCK child：会改变用户 Roam 页面里的顺序，且可能与新旧记录混排。
- 自动用 timestamp 覆盖所有旧的 `=> H:MM`：会改变当前用户已经存在的统计结果；应先提供差异预览和显式修复。
- 删除所有 `0:00` 记录或把 Roam 子 block 合并成 Org 多行文本：都会破坏当前的记录审计和 graph 层级。

## 最终建议

当前不需要做数据迁移。最稳妥的下一步是“只改变计算解释，不改变存储”：把 timestamp 区间作为新的统计基准，保留摘要差异提示；同时维持 `LOGBOOK::`/`CLOCK::` 的 Roam 原生写入和对 `:LOGBOOK:`/`CLOCK:` 的兼容读取。这样能更接近 Org 的真实语义，又不会破坏现有 Roam 数据。

### Sources

- [Org Manual — Drawers](https://orgmode.org/manual/Drawers.html)
- [Org Manual — Clocking commands](https://orgmode.org/manual/Clocking-commands.html)
- [Org Manual — Tracking TODO state changes](https://orgmode.org/manual/Tracking-TODO-state-changes.html)
- [Emacs official mirror — org-clock.el](https://github.com/emacs-mirror/emacs/blob/master/lisp/org/org-clock.el)
- [Emacs official mirror — org-element.el](https://github.com/emacs-mirror/emacs/blob/master/lisp/org/org-element.el)
- [Emacs official mirror — org.el](https://github.com/emacs-mirror/emacs/blob/master/lisp/org/org.el)
- 本仓库：[src/org.js](../src/org.js)、[src/clock.js](../src/clock.js)、[src/entries.js](../src/entries.js)、[src/time.js](../src/time.js)、[test/org.test.js](../test/org.test.js)、[test/clock.test.js](../test/clock.test.js)
