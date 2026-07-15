[English](README.md) | **简体中文**

# Inspect

[![CI](https://github.com/octoryn/octopus-inspect/actions/workflows/ci.yml/badge.svg)](https://github.com/octoryn/octopus-inspect/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/octoryn/octopus-inspect?sort=semver)](https://github.com/octoryn/octopus-inspect/releases/latest)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](package.json)
[![Built on octopus-evidence](https://img.shields.io/badge/built%20on-octopus--evidence-7c9cff.svg)](https://github.com/octoryn/octopus-evidence)

> 在生产环境替你发现之前,先抓住治理漏洞。一个面向 AI agent 工作区的静态治理
> linter —— 同时也是一个**规则宿主 (rule host)**:一台遍历工作区、在其上运行治理
> 规则、并产出**确定性 (deterministic) 发现项 (findings)** 的引擎。

> **[Octopus Core](https://github.com/octoryn) 的一部分 —— 受治理 AI 的开源基础设施栈。** 每个仓库只做一件事，沿 agent 生命周期组合：[Scout](https://github.com/octoryn/octopus-scout) · [Observe](https://github.com/octoryn/octopus-observe) · [Experience](https://github.com/octoryn/octopus-experience) · [Blackboard](https://github.com/octoryn/octopus-blackboard) · [Workstate](https://github.com/octoryn/octopus-workstate) · [Runtime](https://github.com/octoryn/octopus-runtime) · [Replay](https://github.com/octoryn/octopus-replay) —— [Inspect](https://github.com/octoryn/octopus-inspect) 横贯每一环做治理。整个技术栈都构建在同一个根基元语上：**[Evidence](https://github.com/octoryn/octopus-evidence)** —— 规范化、防篡改的原子单元，也是 Octopus 其余部分赖以构建的根范畴 (root category)。
>
> **本仓库 —— Inspect · 治理（横贯每一环）：** 面向 AI 工作区的治理式 lint。

```
Workspace → Rules → Findings → Report (pretty / json / sarif)
```

把 Inspect 指向一个装满 AI-agent 配置的目录 —— 提示词 (prompt)、agent 与工作流
定义、MCP 清单 (manifest)、决策记录 —— 它会标记出那些不到上线就不会暴露的治理
漏洞:一个被提交的密钥、一个被拼接进提示词的不可信变量、一个没有审批闸门的
自动执行动作、一个通配符工具授权、一个没有证据的决策记录、一个永远无法完成的
工作流、一个钉在可变标签上的依赖。发现项会以排序好的、确定性的形式返回,可交给
人工、JSON 流水线,或 CI 代码扫描 (code scanning)。

## 边界 (Boundaries)

Inspect 是**静态且自包含 (static and self-contained)** 的。它读取磁盘上的目录树,
并就其所见之物的形态进行推理。它**不会**执行你的工作区、导入运行时、发起网络调用、
复刻另一个系统的策略语义,也不会修改任何文件。每条内置规则都是纯 (pure) 的:磁盘上
相同的字节 → 相同的发现项,顺序也相同。

最后这条边界是刻意为之。一个需要理解某个特定运行时语义的检查 —— 某个策略引擎实际
允许什么、某个 blackboard 认可什么样的交接 —— **不**属于内置规则;把它硬编码进去
会分裂 "安全" 的定义。这类检查以**插件 (plugin)** 的形式,由拥有那套语义的运行时
贡献,从而使 "安全" 只有唯一的真相来源 (single source of truth)。内置规则只标记那些
最常藏着漏洞的*形态*。

它**构建于第一方的 [octopus-evidence](https://github.com/octoryn/octopus-evidence)
原语之上** —— 这是它唯一的运行时依赖,也是整个技术栈共用的那个 Evidence 原子。
正是这一个依赖,让 `--format evidence` 能把每一条发现项变成防篡改 (tamper-evident)、
可独立验证的单元:你的 linter 的发现项无需信任 linter 本身即可作为呈堂证据。
除此之外本仓库自包含,不引入任何第三方依赖。

## 安装与构建 (Install & build)

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # node --test
npm run build       # emit dist/
npm run example     # 运行内置的演示工作区
```

需要 Node ≥ 22。Inspect 扫描 **JSON / JSONC / 文本 / Markdown** 文件;可识别
`.mcp.json` 与 `.prompt`。YAML 是一项有记录的未来扩展,**尚未**解析(见
[边界](#边界-boundaries) 与 [`docs/DESIGN.zh-CN.md`](docs/DESIGN.zh-CN.md))。

## CLI

```bash
octopus-inspect [path]                 # 检查目录或文件(默认 ".")
octopus-inspect . --format sarif       # 为 CI 代码扫描输出 SARIF
octopus-inspect . --format evidence    # 为每条发现项输出防篡改 Evidence
octopus-inspect . --threshold warning  # warning 也让构建失败
```

| 选项             | 含义                                                          |
| ---------------- | ------------------------------------------------------------- |
| `--format <f>`   | 输出格式:`pretty` \| `json` \| `sarif` \| `evidence`(默认 `pretty`) |
| `--config <file>`| 使用的配置文件(默认根目录下的 `.octoinspect.json`)         |
| `--threshold <s>`| 让本次运行失败的严重度:`error` \| `warning` \| `info`(默认 `error`) |
| `--no-color`     | 关闭 pretty 输出中的 ANSI 颜色                                |
| `--version`      | 打印版本并退出                                                |
| `--help`         | 显示帮助                                                      |

**退出码:** `0` 干净 · `1` 存在达到或超过阈值的发现项 · `2` 配置错误(配置损坏、
插件无法加载、规则 id 冲突,或路径缺失)。pretty 输出仅在 TTY 上着色;`--no-color`
可强制关闭。

## GitHub 代码扫描(首选路径)

SARIF 是静态分析的标准交换格式,也是 Inspect 的首选分发路径:在 CI 中输出 SARIF,
GitHub 便会把每个发现项内联渲染到 PR 上、Security 页,以及作为一项 check。在你的
工作流中加一步:

```yaml
# .github/workflows/inspect.yml
name: inspect
on: [push, pull_request]

jobs:
  governance:
    runs-on: ubuntu-latest
    permissions:
      security-events: write   # 上传 SARIF 所必需
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
      - run: npx octopus-inspect . --format sarif > inspect.sarif
      - uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: inspect.sarif
```

SARIF 运行结果携带每条规则的 id、标题、描述与默认级别,因此发现项落地时就已带好
标签并完成分组。若还想让作业**因发现项而失败**,再跑一次
`octopus-inspect .`(pretty 或 json)并带上你选定的 `--threshold`;上面的上传步骤
本身永远不会让构建失败。

## GitHub Action(开箱即用)

一个 composite action 封装了上面的 SARIF 路径,任何仓库都能两步接入:先运行
Inspect,再上传 SARIF。该 action 通过 `npx` 运行**已发布的 npm 包** —— 无需构建、
无需检出本仓库。SARIF 上传刻意留在 action 之外,让**权限掌握在调用方工作流手中**
(`security-events: write` 授权属于你,而非第三方 action)。

```yaml
# .github/workflows/inspect.yml
name: inspect
on: [push, pull_request]

permissions:
  security-events: write # 上传 SARIF 所必需
  contents: read

jobs:
  governance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - id: inspect
        uses: octoryn/octopus-inspect@v0.3.2
        with:
          path: .
          fail-on-findings: "false" # 只报告,不让构建失败
      - uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: ${{ steps.inspect.outputs.sarif-file }}
```

发现项随后会内联渲染到 PR、**Security** 页,以及作为一项 check。将
`fail-on-findings: "true"`(默认值)保留,可在 Inspect 以非零码退出时让步骤失败 ——
配合 `args: "--threshold warning"` 选择哪个严重级别会阻断构建。

### 输入 (Inputs)

| 输入               | 默认值                  | 含义 |
| ------------------ | ----------------------- | ---- |
| `path`             | `.`                     | 要扫描的工作区目录或文件。 |
| `args`             | `""`                    | 透传给 `octopus-inspect` 的额外 CLI 参数(如 `--threshold warning`)。 |
| `version`          | `0.3.2`                 | 要运行的 `octopus-inspect` 的 npm 版本/规格(`octopus-inspect@<version>`)。 |
| `sarif-file`       | `octopus-inspect.sarif` | SARIF 报告写入的路径。 |
| `fail-on-findings` | `true`                  | 为 `true` 时,Inspect 非零退出(达到阈值的发现项,或配置错误)会让步骤失败;为 `false` 时步骤总是成功,以便仍能上传 SARIF。 |

### 输出 (Outputs)

| 输出         | 含义 |
| ------------ | ---- |
| `sarif-file` | action 生成的 SARIF 报告路径 —— 传给 `upload-sarif`。 |

CLI 将 SARIF 写到 **stdout**;action 会把它重定向到 `sarif-file` 并捕获退出码,
使 `fail-on-findings` 能独立于上传步骤对该步骤进行门控。

## 编程式 API (Programmatic API)

CLI 所做的一切都以库的形式可用:

```ts
import { inspect, shouldFail, formatSarif } from "octopus-inspect";

const report = await inspect("./workspace");

for (const f of report.findings) {
  console.log(`${f.severity}\t${f.file}:${f.line ?? 0}\t${f.ruleId}\t${f.message}`);
}

console.log(report.summary);              // { error, warning, info }
console.log(shouldFail(report, "error")); // CI 会失败吗?

const sarif = formatSarif(report);        // SARIF 2.1.0 字符串
```

`inspect(root, options?)` 返回一个确定性的 `InspectReport`
(`{ root, findings, fileCount, ruleCount, summary }`);传入 `{ config, rules }`
可覆盖任一项。`formatPretty` 与 `formatJson` 是另外两个 reporter。完整的内置规则
集以 `builtinRules` 导出。

## 内置规则 (Built-in rules)

开箱即带七条静态规则。每条都有稳定的 id 与一个默认严重度,你可在配置中覆盖或禁用。

| Id                          | 默认      | 类型       | 标记什么 |
| --------------------------- | --------- | ---------- | -------- |
| `secret-in-source`          | `error`   | 文本       | 提交进目录树的硬编码凭据 —— 云密钥、厂商 API key、私钥块、通用的 `secret = "…"` 赋值。占位符(`your-…`、`${…}`、`process.env`)保持沉默;命中的密钥在发现项中被脱敏。 |
| `prompt-injection-sink`     | `warning` | 文本/json  | 一个把不可信变量(`{{ user_input }}`、`${userMessage}`、`%(query)s`)直接拼接进指令的提示词/指令模板,可能夹带对抗性指令。 |
| `unsafe-autonomy`           | `error`   | 结构性     | 一个既把自己标记为自动执行(`autonomy`、`autoApprove`、`requireApproval: false`……)、又带有副作用标记(`execute`、`command`、`tool`……)、却未声明任何审批或策略字段的配置对象。 |
| `overbroad-permission`      | `warning` | 结构性     | 允许列表、工具列表或作用域授权中的通配符(`*`、`all`、`*:*`)—— 放开了每一种能力,而非一份最小权限集合。 |
| `missing-evidence`          | `warning` | 结构性     | 一条陈述了 `decision` / `claim` / `conclusion`、却不带 `evidence` / `source` / `rationale` / `citation` 字段的记录。只看形态 —— 它不评判证据*好不好*,只看是否存在证据。 |
| `circular-workflow`         | `error`   | 结构性     | 从 JSON 解析出的工作流/agent 步骤间的依赖环(经由 `next` / `then` / `dependsOn` / `requires` / `needs` 边)。有环的图永远无法完成。 |
| `unpinned-agent-dependency` | `info`    | 结构性     | 一个 MCP/agent 启动参数(`npx pkg@latest`)或钉在可变标签(`latest`、`*`、`next`……)上的清单依赖,其执行代码可在无评审的情况下改变。 |

"结构性" 规则读取 JSON/JSONC 对象解析后的形态;它们绝不推理运行时语义 —— 正是这条
边界把 "安全" 的定义留在唯一一处。`secret-in-source` 与 `prompt-injection-sink`
另会扫描纯文本与提示词文件。

## OWASP Agentic Top 10 映射

每条内置规则都标注了它所对应的 [OWASP Top 10 for Agentic Applications (2026)](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/) 类别,并在 SARIF 中输出(`properties.tags`,如 `OWASP-ASI-2026:ASI01`),让 finding 落入安全团队已在用的词汇表。

| 规则 | OWASP Agentic 2026 |
|---|---|
| `secret-in-source` | ASI03 · Identity and Privilege Abuse |
| `prompt-injection-sink` | ASI01 · Agent Goal Hijack |
| `unsafe-autonomy` | ASI02 · Tool Misuse · ASI09 · Human-Agent Trust |
| `overbroad-permission` | ASI03 · Identity and Privilege Abuse |
| `missing-evidence` | ASI09 · Human-Agent Trust Exploitation |
| `circular-workflow` | ASI08 · Cascading Failures |
| `unpinned-agent-dependency` | ASI04 · Agentic Supply Chain Vulnerabilities |

Inspect 的静态规则覆盖 Top 10 中"提交进工作区配置里可见"的那部分;运行时才产生的风险按设计不在 linter 范围内。类别表已导出(`OWASP_AGENTIC_2026`、`owaspLabel`)供插件使用。

## 配置 (Configuration)

Inspect 会在根目录寻找 `.octoinspect.json`(JSONC —— 允许注释),或接受显式的
`--config <file>`。损坏或缺失的配置不算错误;运行会以默认值继续。

```jsonc
{
  // 额外的忽略 glob,叠加在内置默认之上(node_modules、.git、dist……)。
  "ignore": ["fixtures/**", "**/*.generated.json"],

  // 逐规则覆盖:"off" 禁用规则;某个严重度会重新评级。
  "rules": {
    "unpinned-agent-dependency": "off",     // 本仓库不关心
    "prompt-injection-sink": "error",       // 在此视为阻断级
    "missing-evidence": "info"              // 降级为提示性
  },

  // 插件模块 specifier,从工作区根目录解析。
  "plugins": ["./inspect-plugins/runtime-policy.js"],

  // 跳过大于此字节数的文件(默认 1 MiB)。
  "maxFileBytes": 524288
}
```

设为 `"off"` 的规则根本不会运行。严重度覆盖(或某个插件规则自己的默认)优先于内置
默认;阈值与退出码比较的正是这个生效严重度。完整的带注释示例见
[`.octoinspect.json`](.octoinspect.json)。

## 插件 (Plugins)

Inspect 是一个**规则宿主 (rule host)**。当某个检查需要特定运行时的语义时,由那个
运行时把规则作为插件交付,Inspect 托管它 —— 从而 "安全" 的定义绝不会被分裂进内置
规则。一个插件不过是一个导出 `{ name, rules }` 对象的模块(作为默认导出、具名的
`plugin`,或模块形态本身):

```ts
// inspect-plugins/runtime-policy.ts
import { definePlugin, type Rule, type Workspace } from "octopus-inspect";

const noProdWrites: Rule = {
  id: "runtime/no-prod-writes",
  title: "Agent may write to production without a policy",
  description: "Rejects a manifest that grants prod write scope with no attached policy.",
  severity: "error",
  check(workspace: Workspace) {
    // 读取工作区的形态;返回原始发现项。
    return [];
  },
};

export default definePlugin({ name: "runtime-policy", rules: [noProdWrites] });
```

在配置中引用它,它的规则便与内置规则并肩运行:

```jsonc
{ "plugins": ["./inspect-plugins/runtime-policy.js"] }
```

相对 specifier 相对工作区根目录解析;裸 specifier 按普通 node 模块解析。重复的规则
id 会被拒绝(插件永远无法悄悄遮蔽另一条规则),而加载失败的插件会被报告为配置错误,
而非中止整次运行。`parseJsonc`、`walkJson`、`isJsonObject`、`findKeyLine` 等辅助函数
均已导出,便于编写结构性插件规则。

## 设计 (Design)

权威的架构与契约文档位于 [`docs/DESIGN.zh-CN.md`](docs/DESIGN.zh-CN.md) —— 规则宿主
哲学、Workspace → Rules → Findings → Report 流水线、确定性保证,以及配置/插件模型。
在做出更改之前请先阅读它;代码是依照该规范编写的。

## 许可证 (License)

[Apache-2.0](LICENSE) © Octoryn。
