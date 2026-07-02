[English](CONTRIBUTING.md) | **简体中文**

# 为 Inspect 贡献

感谢你有兴趣参与贡献。本指南覆盖基础事项。

## 开发环境

```bash
npm install
npm test        # node --test
npm run example # 运行内置的演示工作区
```

需要 Node ≥ 22。

## 提 PR 之前

跑一遍完整的本地门禁 —— CI 会执行相同的检查:

```bash
npm run typecheck      # 完整 strict 下的 tsc --noEmit,必须干净
npm run format:check   # prettier
npm run lint           # eslint
npm test               # node --test
npm run build          # 产出 dist/
```

- **类型安全:** 项目开启 `strict`(含 `exactOptionalPropertyTypes`、
  `verbatimModuleSyntax`、`noUncheckedIndexedAccess`)。除非不可避免并加注释,
  不允许 `any` 逃逸。
- **零运行时依赖:** 本工具只用 Node 内置能力。没有非常充分的理由,不要新增运行时
  依赖。
- **边界就是重点。** Inspect 是一个静态规则宿主:绝不执行工作区、导入运行时、触达
  网络,或修改文件。内置规则是**静态且自包含 (static and self-contained)** 的 ——
  需要特定运行时语义的规则属于**插件 (plugin)**,而非内置规则,以使 "安全" 的定义
  留在唯一一处。跨越这些边界的 PR,无论质量如何都会被拒绝。
- **确定性 (Determinism)。** 规则必须是纯的:相同的工作区产出相同顺序下相同的
  发现项。断言中不使用真实时钟、不使用随机性、不依赖文件系统的遍历顺序。
- **测试:** 新行为需要测试,且必须自洽(无网络、独立临时目录、用后清理)。

## 新增或修改规则

- 一条规则是一个 `{ id, title, description, severity, check }` 对象。`check`
  接收 `Workspace` 并返回 `RawFinding[]` —— 引擎会附上 `ruleId` 并解析生效严重度,
  因此规则只描述*在哪里*与*是什么*。
- 保持规则 id 稳定且为 kebab-case;它们是公开契约(配置键、SARIF 规则 id)。
  重命名是破坏性变更。
- 在 `excerpt` 中对任何敏感内容做脱敏 —— 报告绝不能回显完整凭据。
- 优先使用共享的 JSON 辅助函数(`parsedJsonFiles`、`walkJson`、`findKeyLine`、
  `keyMatches`),而非临时解析,以保持行号查找与 JSONC 处理的一致。

## 项目结构

权威的架构、流水线与边界见 [docs/DESIGN.zh-CN.md](docs/DESIGN.zh-CN.md)。代码依据该
规范编写;契约变化时先更新它。

## 提交 / PR

- PR 保持聚焦。说明改了什么、为什么。
- 面向用户的变更请更新 `CHANGELOG.md`。
- 改动公开 API 或 CLI 界面时,更新相关文档(`README.md`、`docs/`)。文档为双语
  (英文为准 + `*.zh-CN.md` 副本);可行时两者一并更新。

## 报告 Bug / 安全问题

普通 bug 请正常提 issue。安全漏洞请遵循 [SECURITY.md](SECURITY.md),不要提交公开
issue。
