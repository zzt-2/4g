# Claude Code 配置与使用说明

本目录包含项目 owner 的 Claude Code 配置快照，供接手人参考。

## 文件说明

### CLAUDE-global.md
全局个人指令（`~/.claude/CLAUDE.md`），所有项目所有对话都会加载。包含：
- **OMC（oh-my-claudecode）**：多 agent 编排层，负责 agent 调度、并行执行、验证流程
- **协作风格**：facts-first、先讨论再执行、规范书面中文
- **子 agent 规则**：小任务主线程做，中任务派 explore/executor，大任务拆多对话
- **自动提交规则**：每个对话只提交一次，在对话结束时统一 commit
- **Session 管理**：`.sessions/` 目录的编号体系和生命周期规则
- **全局禁止事项**：不丢改动、不跳注册表查重、不用无前缀命名

**使用方式**：将此文件内容放到你自己的 `~/.claude/CLAUDE.md`（或根据你的偏好修改）。这是 Claude Code 的全局指令文件，每次对话自动加载。

### RTK.md
RTK（Rust Token Killer）工具说明，用于减少 token 消耗。Hook 自动调用，不需要手动操作。

### settings.json
Claude Code 配置文件（`~/.claude/settings.json`）。关键配置：
- **模型映射**：Haiku→glm-4.7, Sonnet→glm-5.1, Opus→glm-5.1
- **自动压缩窗口**：200K tokens
- **实验特性**：Agent Teams 启用
- **OMC 插件路径**：`/home/zzt/.claude-marketplaces/oh-my-claudecode`
- **权限白名单**：MCP 工具、Bash 命令等

**使用方式**：参考此文件配置你自己的 `~/.claude/settings.json`。模型映射可能需要根据你的 API 端点调整。

### memory/
项目级 AI 记忆文件（`~/.claude/projects/-mnt-d-code-frontend-dongfanghong/memory/`）。Claude Code 在每个对话开始时自动加载 `MEMORY.md` 索引。包含：
- **用户角色与偏好**：project owner、并行多 AI 对话、facts-first
- **重写目标与方法论**：为什么 rewrite、当前阶段、下一步
- **硬边界**：platform/feature/UI/节奏四大不可违反约束
- **历史决策记录**：各阶段的设计决策和技术选择
- **文档读取清单**：按场景分层的必读文档

**使用方式**：这些文件会随着项目进展更新。接手后 AI 会自动在新对话中读取。如果你用不同的 Claude Code 项目路径，需要将 memory/ 目录放到对应的 `~/.claude/projects/<your-project-path>/memory/` 下。

## 快速配置步骤

1. 安装 Claude Code CLI
2. 复制 `CLAUDE-global.md` 内容到 `~/.claude/CLAUDE.md`
3. 参考 `settings.json` 配置你自己的 `~/.claude/settings.json`（调整模型映射和 API 端点）
4. 将 `memory/` 目录复制到你的 Claude Code 项目记忆路径下
5. 项目级 CLAUDE.md 已在仓库根目录（`/CLAUDE.md`），会自动加载
