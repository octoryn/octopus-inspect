[English](CHANGELOG.md) | **简体中文**

# Changelog

Inspect 的所有重要变更都记录于此。格式遵循
[Keep a Changelog](https://keepachangelog.com/),项目在达到 1.0 后将遵循语义化
版本 (semantic versioning)。

## [0.3.2] — 2026-07-03

### 新增

- **参考语义插件 —— `runtime-policy` —— 证明"规则宿主"论点。** 一个可运行示例
  (`inspect-plugins/runtime-policy.ts` + `docs/PLUGINS.md`)展示了静态 linter 做不到
  的语义检查如何存在于一个由"其语义所属的运行时"拥有的插件中。其
  `runtime-over-autonomy` 规则标记:被授予超过安全上限的自主度、且无任何门控的
  副作用工具 —— 且该上限是**由 octopus-runtime 真实的 `AutonomyLevel` 顺序推导**
  (`routeExecutes(routeFor(...))`),而非可能漂移的硬编码副本。通过 inspect 真实的
  插件加载器加载。插件源码/夹具仅存在于仓库(不进 npm tarball,且 `octopus-runtime`
  仅为 devDependency);`docs/PLUGINS.md` 作为编写指南随包发布。

### 修复

- **参考插件:声明了但为空的门控不再让规则静默。** `hasExplicitGate` 曾把空字符串
  / `0` / 空对象当作真实的策略门控,导致
  `{ autonomy: "autonomous", execute: "…", policy: "" }` 作为假阴性溜过。现要求门控值
  必须有意义。由对抗性评审发现,已加回归测试。

## [0.3.1] — 2026-07-03

### 新增

- **开箱即用的 GitHub Action。** 组合式 `action.yml`(`octoryn/octopus-inspect@v0.3.1`)
  在 CI 中运行 linter 并写出 SARIF,几行配置即可让发现出现在仓库的 Security 标签页。
  输入 `path` / `args` / `version` / `sarif-file` / `fail-on-findings`;可直接复制的
  消费方工作流(搭配 `github/codeql-action/upload-sarif`)见 README。另有
  `self-scan.yml` 工作流对本仓库做狗粮测试。

### 修复

- **仓库根 `.octoinspect.json` 不再破坏全仓扫描。** 该示例配置曾主动引用一个不存在的
  插件(`./inspect-plugins/runtime-policy.js`),导致在仓库根运行 `octopus-inspect .`
  时以配置错误(退出码 2)失败 —— linter 竟无法扫描自己的仓库。现已将悬空的
  `plugins` 条目注释掉(保留为示例语法)。

## [0.3.0] — 2026-07-03

### 新增

- **`--format evidence` 报告器。** 每条发现现在都可作为可独立验证的
  [`octopus-evidence`](https://github.com/octoryn/octopus-evidence) `Evidence`
  输出 —— `kind = governance-finding:<ruleId>`、subject = 文件/位置、content =
  规范化的发现详情(严重度、消息、行/列、OWASP 标签)、provenance =
  `{ source: "octopus-inspect", method: "static-analysis" }`。任何人都能重算哈希、
  确认某次提交上存在过哪些治理漏洞,而**无需信任 linter** —— 即 EU AI Act
  第 12/14 条的审计叙事。新增导出 `reportEvidence` / `formatEvidence` /
  `findingToEvidence`;可选 `integritySecret` 以带密钥 HMAC 封存记录。报告器核心
  是确定性的(时钟可注入;绝不在模块作用域调用 `Date.now()`)。既有
  `pretty` / `json` / `sarif` 输出、规则 id 与发现语义均未改变。

### 变更

- 现依赖第一方 `octopus-evidence@^0.2.0` —— 其**唯一**的运行时依赖(仍零第三方
  依赖)。README/DESIGN 重新表述为"构建于第一方 octopus-evidence 原语之上"。

## [0.2.0] — 2026-07-03

### 新增

- **OWASP Top 10 for Agentic Applications (2026) 映射。** 每条内置规则现在都声明它
  所对应的 ASI 类别(`Rule` 契约上新增的可选 `owasp` 字段)。以 `OWASP_AGENTIC_2026` /
  `owaspLabel` 导出,并在 SARIF 规则元数据(`properties.tags`,如
  `OWASP-ASI-2026:ASI01`)中输出,使 finding 落入代码扫描共享的安全词汇表。

## [0.1.0] — 2026-07-03

首个公开发布。

### Added
- **检查引擎 (inspection engine)**(`inspect`)—— 遍历一个工作区目录(或单个
  文件),在其上运行治理规则,并返回一个确定性的 `InspectReport`(`root`、已排序的
  `findings`、`fileCount`、`ruleCount`,以及按严重度分类的 `summary`)。磁盘上相同的
  字节 → 相同顺序下相同的发现项。`shouldFail(report, threshold)` 决定退出条件。
- **七条内置规则**,全部静态且自包含:
  `secret-in-source`(error)、`prompt-injection-sink`(warning)、
  `unsafe-autonomy`(error,结构性)、`overbroad-permission`(warning)、
  `missing-evidence`(warning,结构性)、`circular-workflow`(error),以及
  `unpinned-agent-dependency`(info)。
- **插件宿主 (plugin host)** —— Inspect 是一个*规则宿主*。运行时以插件形式贡献
  语义检查(`definePlugin({ name, rules })`),在配置中引用并与内置规则合并。重复的
  规则 id 会被拒绝;加载失败的插件是一个被报告的配置错误,而非崩溃。
- **三个 reporter:** `pretty`(人类可读,TTY 着色)、`json`(机器可读),以及
  `sarif`(SARIF 2.1.0,供 GitHub 代码扫描及任何支持 SARIF 的工具使用)。
  `formatPretty` / `formatJson` / `formatSarif` 均已导出。
- **CLI**(`octopus-inspect`),含 `--format`、`--config`、`--threshold`、
  `--no-color`、`--version` 与 `--help`。退出码:`0` 干净,`1` 存在达到或超过阈值的
  发现项,`2` 配置错误。
- **配置**,经由 `.octoinspect.json`(JSONC):`ignore` glob、逐规则严重度覆盖与
  `off`、`plugins`,以及 `maxFileBytes`。损坏或缺失的配置会回退到默认值,而非失败。
- **JSON / JSONC / 文本 / Markdown 扫描**,并导出 `parseJsonc`、`walkJson`、
  `isJsonObject`、`findKeyLine` 等辅助函数,用于编写结构性插件规则。
- **零运行时依赖**;Node ≥ 22。按 Octoryn 生态标准进行开源发布打包:完整的
  `package.json` 元数据、双语文档(英文为准 + 带语言切换器的 `*.zh-CN.md` 副本)、
  README 徽章、一份设计文档,以及 `SECURITY.md` / `CONTRIBUTING.md` /
  `CODE_OF_CONDUCT.md`。
