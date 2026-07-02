[English](DESIGN.md) | **简体中文**

# Inspect — 架构与契约

状态:**v0.1** · 负责人:Inspect · 最后更新:2026-07-03

这是权威的设计文档。代码是*依照*该规范编写的。当两者不一致时,在文档更新之前,以
文档为准视为待修 —— 先在这里改正,再改代码。

---

## 1. Inspect 是什么

**Inspect 在生产环境替你发现之前,先抓住治理漏洞。** 它是一个面向 AI agent 工作区
的静态治理 linter,在结构上则是一个**规则宿主 (rule host)**:一台遍历工作区、在其上
运行治理规则、并产出确定性发现项的引擎。

```
Workspace → Rules → Findings → Report (pretty / json / sarif)
```

你把 Inspect 指向一个装满 AI-agent 配置的目录 —— 提示词、agent 与工作流定义、
MCP 清单、决策记录 —— 它便报告那些不到上线就不会浮现的治理漏洞。它读取磁盘上的
目录树;就其所见之物的*形态*进行推理;返回一份排序好的、确定性的报告。

### 1.1 它*不是*什么(强制边界)

Inspect 不会、也绝不能:

- **执行**工作区、导入运行时,或造成任何副作用(唯一例外是加载已配置的**插件** ——
  见 §8)。
- **触达网络。** 扫描不做任何出站 I/O。
- **跟随符号链接。** 遍历器会跳过它们,以避免环与逃逸。
- **修改任何东西。** 检查是只读的;它绝不写入目录树。
- **复刻另一个运行时的语义。** 内置规则绝不编码某个特定策略引擎允许什么。那样做会
  分裂 "安全" 的定义(见 §3)。

若一个拟议功能需要上述任何一点,它就不属于内置规则集。

### 1.2 独立性

不依赖任何其他 Octopus 包 —— 事实上,**零运行时依赖**。本包在没有任何其他东西存在
的情况下也能端到端地构建、测试与运行。边界是 `Rule` / `Plugin` 契约,而非任何运行时
SDK。

---

## 2. 流水线 (The pipeline)

每个阶段都是单向边界。数据只向前流动。

```
磁盘上的目录
   │  buildWorkspace()        ── 遍历、忽略过滤、大小上限、二进制检测、排序
   ▼
Workspace  { root, files[], filesByExt() }
   │  对每条启用的 Rule:rule.check(workspace) → RawFinding[]
   ▼
RawFinding[]               ── message, file, line?, column?, excerpt?, suggestion?
   │  引擎附上 ruleId、解析生效严重度、排序
   ▼
InspectReport  { root, findings[], fileCount, ruleCount, summary }
   │  formatPretty | formatJson | formatSarif
   ▼
Report 字符串
```

1. **Workspace。** `buildWorkspace(root, { ignore, maxFileBytes })` 把目录树读入
   一个不可变的 `Workspace`。它应用内置的 `DEFAULT_IGNORES`(`node_modules`、
   `.git`、`dist`、锁文件、`*.min.js`……)加上任意配置 `ignore` glob,跳过超过
   `maxFileBytes`(默认 1 MiB)的文件,跳过符号链接,标记二进制文件,并按 POSIX
   相对路径排序。单文件目标会成为一个单文件工作区。每个 `WorkspaceFile` 惰性读取并
   缓存其 `text()` 与 `lines()`。

2. **Rules。** 引擎运行每条*启用*规则的 `check(workspace)`,返回 `RawFinding[]`。
   一条规则只描述*在哪里*与*是什么* —— 它绝不设置自己的 `ruleId`,也极少覆盖自己的
   `severity`。

3. **Findings。** 引擎把每个 `RawFinding` 包装为一个 `Finding`,附上规则的 `id`
   并解析**生效严重度**(配置覆盖 → 发现项自身的严重度 → 规则默认),然后按
   `file → line → column → ruleId → message` 对所有发现项排序。

4. **Report。** `InspectReport` 携带排序后的发现项、扫描的 `fileCount`、本次运行的
   `ruleCount`,以及按严重度分类的 `summary`。三个 reporter 渲染它:`pretty`、
   `json`、`sarif`。

---

## 3. 规则宿主哲学 (The rule-host philosophy)

这是承重的思想,也是最锋利的那条边界的缘由。

一个治理检查有两种风味:

- **结构性 / 静态** —— 仅凭工作区的*形态*即可回答。"这个对象把自己标为自动执行、
  且有一个副作用键,却没有审批字段。" "这个允许列表里含 `*`。" "这些步骤构成一个
  环。" 看出这些漏洞,不需要了解任何特定运行时。
- **语义性** —— 只有知道某个特定运行时的规则才能回答。"*这个*策略引擎实际允许*这个*
  动作吗?" "在*这个* blackboard 的协议下,*这次*交接有效吗?" 不重新实现那个运行时
  的决策逻辑,你无法回答。

**内置规则专属于第一种风味。** 若 Inspect 把语义检查硬编码进来,它就会变成每个
运行时策略模型的第二份、且会漂移的副本 —— 而一旦这份副本与真实运行时产生分歧,
"安全" 就会有两种含义。所以内置规则刻意止步于*结构*:它们标记最常藏着漏洞的形态,
把语义裁决留给拥有那套语义的人。

语义检查以**插件 (plugin)** 的形式抵达,由拥有该模型的运行时贡献。那个运行时是它所
允许之事的唯一真相来源;它把那份真相作为规则交付,而 Inspect *托管*它们。这使每个
运行时的 "安全" 只有一个定义,且由知识所在之处来撰写。

`unsafe-autonomy` 是最典型的例证:它标记*结构性*的征兆 —— 一个自动执行标记紧挨着
一个副作用标记、且没有守卫字段 —— 并明确地**不**尝试判定某个给定的自动化设置在某个
运行时策略下是否可接受。那个裁决是插件的活儿。

---

## 4. 核心契约 (Core contracts)

定义于 `src/types.ts`。

- **`Rule`** —— `{ id, title, description, severity, check(workspace) }`。`id`
  是稳定的、kebab-case 的、全局唯一的公开标识(它是配置键,也是 SARIF 规则 id;
  重命名是破坏性的)。`check` 返回 `RawFinding[]`(或其 promise),且必须是**纯且
  确定性**的。
- **`RawFinding`** —— 规则返回之物:`message`、`file`、可选的 `line`、`column`、
  `excerpt`、`suggestion`,以及一个罕见的逐发现项 `severity`。没有 `ruleId` ——
  由引擎附上。
- **`Finding`** —— 引擎附上 `ruleId` 并解析生效 `severity` 之后的 `RawFinding`。
- **`Workspace` / `WorkspaceFile`** —— 被扫描的文件集。`files` 已排序且稳定;
  `filesByExt(...)` 按扩展名过滤非二进制文件;每个文件暴露缓存的 `text()` /
  `lines()` 与一个 POSIX 相对 `path`。
- **`Plugin`** —— `{ name, rules }`。一束额外规则,通常由理解它们的运行时贡献。
- **`InspectConfig`** —— `{ ignore?, rules?, plugins?, maxFileBytes? }`。
- **`InspectReport`** —— `{ root, findings, fileCount, ruleCount, summary }`。

---

## 5. 内置规则 (Built-in rules)

开箱即带七条规则,全部静态且自包含。

| Id                          | 默认      | 类型       | 读取 |
| --------------------------- | --------- | ---------- | ---- |
| `secret-in-source`          | `error`   | 文本       | 每个非二进制文件,逐行 |
| `prompt-injection-sink`     | `warning` | 文本/json  | `.prompt` 文件、`prompts/` 下的文本/markdown,以及 prompt/system/instruction 的 JSON 字符串字段 |
| `unsafe-autonomy`           | `error`   | 结构性     | 解析后的 JSON 对象 |
| `overbroad-permission`      | `warning` | 结构性     | 解析后的 JSON 权限/工具/作用域字段 |
| `missing-evidence`          | `warning` | 结构性     | 带有 claim 字段的解析后 JSON 记录 |
| `circular-workflow`         | `error`   | 结构性     | 解析后的 JSON 步骤图(数组或 id 为键的映射) |
| `unpinned-agent-dependency` | `info`    | 结构性     | 解析后的 JSON 启动参数与依赖映射 |

- `secret-in-source` 匹配已知的凭据形态(AWS/Google 密钥、Anthropic 与 OpenAI
  API key、GitHub/Slack token、私钥块)与通用的 `secret = "…"` 赋值,并过滤明显的
  占位符。命中的密钥在发现项中被**脱敏**;报告绝不回显完整凭据。
- `prompt-injection-sink` 标记一个经 `{{ }}`、`${ }` 或 `%( )s` 直接插入指令的
  不可信变量(`user`、`input`、`query`、`message`、`content`……)。它是启发式的:
  重点是让每一次这样的拼接都成为经过评审的决策。
- `unsafe-autonomy`、`overbroad-permission`、`missing-evidence`、
  `circular-workflow`、`unpinned-agent-dependency` 全都只作用于解析后的 JSON/JSONC
  形态,使用共享的 `parsedJsonFiles` / `walkJson` / `findKeyLine` 辅助函数。无法解析
  为 JSON 的文件会被结构性规则跳过(文本规则仍然能看到它)。

规则模块位于 `src/rules/`;有序集合是 `src/rules/index.ts` 中的 `builtinRules`。

---

## 6. 确定性保证 (Determinism guarantees)

确定性是一条硬契约,而非期望。磁盘上相同的字节 → 任意机器上相同顺序下相同的发现项。

- **稳定的文件顺序。** `buildWorkspace` 按 POSIX 相对路径排序文件,因此规则绝不会
  看到文件系统的遍历顺序。
- **纯规则。** 一个 `check` 只能读取工作区。不用真实时钟、不用随机性、不用环境。当
  一条规则有内部选择(例如 `circular-workflow` 选择报告*某一个*环)时,它先对根排序,
  使该选择可复现。
- **发现项的全序。** 引擎按 `file → line → column → ruleId → message` 排序所有
  发现项 —— 这是一个全序,因此并列绝不依赖规则的执行顺序。
- **稳定的渲染。** 每个 reporter 都是报告的纯函数。`sarif` 只输出实际触发的规则,
  且按报告顺序。

`shouldFail(report, threshold)` 同样是纯的:当且仅当存在达到或超过阈值严重度
(默认 `error`)的发现项时返回 `true`,采用 `error > warning > info` 的等级。

---

## 7. 配置模型 (Configuration model)

工作区根目录下的 `.octoinspect.json`(JSONC —— 允许注释),或显式的
`--config <file>`。由 `src/config.ts` 加载并规范化。

- **提示性,绝非硬闸门。** 损坏或缺失的默认配置会产出一个空配置,运行以默认值继续 ——
  你总能检查。(一个解析失败的*显式* `--config` *则是*配置错误,退出 2,因为运维方
  专门要求了那个文件。)
- **`ignore`** —— 额外的 glob,*叠加*在 `DEFAULT_IGNORES` 之上(绝不替换它们)。
  支持 `*` 与 `**`。
- **`rules`** —— 一个规则 id → 设置的映射。`"off"` 禁用规则(它根本不运行);某个
  严重度(`"error"` / `"warning"` / `"info"`)重新评级它。未列出的规则保持其默认。
  未知设置在规范化时被丢弃。
- **`plugins`** —— 要加载的模块 specifier(见 §8)。
- **`maxFileBytes`** —— 跳过大于此的文件(默认 1 MiB)。

**严重度解析**(`resolveSeverity`):配置覆盖优先,否则发现项自身的严重度,否则规则
默认。阈值与退出码比较的正是这个生效严重度。

---

## 8. 插件模型 (Plugin model)

`src/plugin.ts`。Inspect 是一个规则*宿主*;插件是语义检查抵达它的方式(§3)。

- **形态。** 一个插件模块把一个 `Plugin`(`{ name, rules }`)作为其默认导出、具名的
  `plugin` 导出,或模块形态本身导出。`rules` 必须是一个有效 `Rule` 的数组(每个都有
  字符串 `id` 与一个 `check` 函数);不满足此条件的模块会被报告,而非加载。
- **解析。** 相对或绝对 specifier 相对工作区根目录解析;裸 specifier 按普通 node
  模块解析。
- **合并。** `mergeRules` 把内置与插件规则连接成一个注册表,并**拒绝重复的 id** ——
  插件永远无法悄悄遮蔽(或被遮蔽)另一条规则。
- **失败被隔离。** 导入失败、未导出有效插件,或在规则 id 上冲突的插件会被收集进本次
  运行的配置错误(退出 2),而非中止整次检查。
- **信任。** 插件以进程的权限执行。只配置你信任的插件;把 `plugins` 当作任何其他
  代码依赖来对待(见 `SECURITY.md`)。

`definePlugin(plugin)` 是用于类型检查式撰写的恒等辅助函数。导出的 JSON 辅助函数
(`parseJsonc`、`walkJson`、`isJsonObject`、`findKeyLine`)让结构性插件规则易于依照
内置规则所用的同一批原语来编写。

---

## 9. Reporter 与退出码

三个 reporter,全都是 `InspectReport` 的纯函数:

- **`pretty`** —— 人类可读,为终端分组。仅在 TTY 上着色;`--no-color` 强制关闭。
- **`json`** —— 机器可读的报告,供流水线与自定义工具使用。
- **`sarif`** —— SARIF 2.1.0,静态分析的标准交换格式,也是 Inspect 的**首选分发
  路径**。在 CI 中输出它,GitHub 代码扫描(及任何支持 SARIF 的工具)便能内联渲染
  每个发现项。SARIF 运行携带每条触发规则的 id、标题、描述与默认级别;`info` 严重度
  映射到 SARIF 的 `note` 级别。

**CLI 退出码:** `0` 干净 · `1` 达到或超过 `--threshold` 的发现项 · `2` 配置错误
(损坏的显式配置、无法加载/冲突的插件,或缺失的路径)。CI 中的 SARIF 上传步骤本身
永远不会让构建失败 —— 若想要那样,用一次单独的阈值运行来把守构建。

---

## 10. 文件范围与 YAML 边界

Inspect 扫描 **JSON / JSONC / 文本 / Markdown**。`.mcp.json`(及任何以 `.json`
结尾的文件)被解析为 JSON;`.prompt` 文件与 `prompts/` 下的文本/markdown 被作为
提示词文本扫描。二进制文件会被检测并被规则跳过。

**YAML 尚未解析。** 许多 agent 清单是 YAML,而结构性 YAML 支持是一项计划中的扩展 ——
但交付一个半成品解析器,比坦诚这一空缺更糟。在它落地之前,结构性规则只看到
JSON/JSONC。这是一项声明的限制,而非疏忽。

---

## 11. 模块布局 (`src/`)

| 模块              | 职责 |
| ----------------- | ---- |
| `types.ts`        | 核心契约:`Rule`、`RawFinding`、`Finding`、`Workspace`、`Plugin`、`InspectConfig`、`InspectReport`。 |
| `engine.ts`       | `inspect()`(构建 → 运行 → 聚合 → 排序)与 `shouldFail()`。 |
| `workspace.ts`    | `buildWorkspace()`、`DEFAULT_IGNORES`、目录树遍历器。 |
| `config.ts`       | `loadConfig`、`normalizeConfig`、`isRuleEnabled`、`resolveSeverity`。 |
| `plugin.ts`       | `definePlugin`、`loadPlugins`、`mergeRules`。 |
| `rules/`          | 七条内置规则 + 共享的 `helpers.ts`。 |
| `report/`         | `formatPretty`、`formatJson`、`formatSarif`。 |
| `jsonc.ts`        | JSONC 解析与 JSON 遍历(`parseJsonc`、`walkJson`、`isJsonObject`、`findKeyLine`)。 |
| `util.ts`         | `redact`、glob 匹配、路径/行号辅助函数。 |
| `cli.ts`          | 参数解析、配置/插件加载、分派、退出码。 |

---

## 12. 刻意的限制 (Deliberate limitations)

- **启发式,而非证明。** 内置规则标记漏洞的常见形态。一次干净的运行并非安全的证明;
  一个发现项也并非可被利用的证明。Inspect 是一道闸门。
- **内置规则重结构而非语义** —— 出于设计(§3)。深层语义裁决是插件的活儿。
- **尚无 YAML**(§10)。
- **JSON 解析失败对结构性规则是静默的** —— 一个畸形的 JSON 文件会被跳过,而非被
  报告为解析错误,因此一个真正损坏的清单本身不会产生发现项(文本规则仍会扫描它)。
