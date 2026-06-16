# Handoff: getTestCaseAll 响应格式设计 + task 模板序列化

> 来源: S011 | 交接目标: 把 getTestCaseAll 从 mock 换成真实 task 模板列表，对齐 V1.0.4 spec 让甲方用例同步能跑通
> 文件名: H007-testcase-all-design-handoff.md

## 已完成边界

### 联调已通的部分（S011，2026-06-13）

- **网络层双向连通**：笔记本 → 甲方（NAT 880→80 穿透） + 甲方 → 笔记本（Windows 防火墙加规则）
- **认证层**：找到 RuoYi Plus partner 登录机制（sys_client + t_third_application），登录通
- **出站**：heartbeat / login 全通
- **入站**：getTestCaseAll / getSubSysState 甲方实际能打到我们，body 符合 V1.0.4 信封
- **设备同步**：甲方那边能用，getSubSysState 返回 mock 数据被接受
- **2 个 bug 已修**：heartbeat subSysType 硬编码空串、auth expire_in 字段兼容（待提交）

### 当前 getTestCaseAll 实现位置

- **stub handler**：`rewrite/src/features/northbound/services/northbound-service.ts`（搜 `getTestCaseAll`，应该是 handler 走 mock 数据分支）
- **mock 数据**：`rewrite/src/features/command-ingress/components/docking-labels.ts:81 DEFAULT_TEST_CATALOG`
- **类型定义**：`rewrite/src/features/northbound/core/types.ts`（GetTestCaseAll 相关类型）
- **service 接口**：`northboundService.setTestCatalogData()` 已存在（S008 加的，让 UI 喂数据）
- **入站 translator**：`rewrite/src/features/northbound/core/inbound-translator.ts`（如果需要解析 setTestTask 引用 testCaseInfo）

### 当前 task 模板基础设施（S009/H006 已就绪）

- **类型**：`TaskTemplate` 在 `rewrite/src/features/task/core/types.ts`
- **state**：`task-state.ts` 有模板列表 + 实例列表分离
- **service**：`task-service.ts` createTemplate / listTemplates / 等 CRUD
- **持久化**：localStorage + JSON 导入导出，debounce 500ms
- **UI**：TemplateListPage（模板列表） + ExecutionListPage（实例列表）

## 不要做什么

### 1. 不要把甲方内部数据库格式当成协议格式

用户贴的 ka 子系统 menu 列表（42 条顶层菜单，字段 menuId/outMenuId/outParentId/parentId/menuName）是**甲方 t_out_menu 表的存储格式**，**不是 getTestCaseAll 协议响应格式**。甲方收到响应后会做翻译存进他们内部表。

协议格式以 V1.0.4 spec 为准（`rewrite/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/03-用例管理.md`）。当前 mock 用 `datas[].isParent/children` 是按早期理解的 spec 写的，**需要先核对真实 spec 字段再决定改不改**。

### 2. 不要重新发明 task 模板序列化

S009 已经定义 TaskTemplate 类型 + 持久化 + CRUD。本轮**不要**新建模板存储 / 重新定义模板字段。直接读 task-state 里的模板列表，序列化成 V1.0.4 spec 格式即可。

### 3. 不要碰联调网络层 / 认证层

S011 已通的部分（heartbeat / login / 防火墙 / 穿透 / t_third_application 凭据）**不需要重新调试**。如果联调遇到问题，先怀疑协议字段不匹配，不要怀疑网络。

### 4. 不要在本轮做真实用例执行

setTestTask → 创建 task 实例 → msgReport → testCaseResultReport → verdict 上报，这条完整执行链路是**再下一个对话**的工作。本轮只做 getTestCaseAll（出方向：把模板列表告诉甲方）。

### 5. 不要做报告生成 / FTP 文件交付

S007/H004 规划过 TestReport.json + FTP 上传，本轮完全不碰。

## 必读

按优先级排，新对话开始时**完整读**这些：

### P0 — 直接合同

1. **本 handoff 文档**（H007）
2. **S011 笔记**：`.sessions/2026-05-18-northbound-integration/S011-real-customer-integration-debug.md` — 看阶段 7、8，理解联调现状和卡点
3. **V1.0.4 spec 用例管理**：`rewrite/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/03-用例管理.md` — **重点读 getTestCaseAll 章节的响应字段定义**，这是协议格式的唯一真相源
4. **S009 设计**：`codestable/features/rewrite-task/task-positioning-design.md` — 理解 task 模板/实例分离 + 模板字段定义

### P1 — 边界护栏

5. **CLAUDE.md** §重写总原则、§重写主线必读、§Electron 与平台边界、§Service Readiness Audit
6. **前端规范**：`codestable/quality/rewrite-frontend-conventions.md` + `rewrite-frontend-quickref.md`（如果涉及 UI 改动）
7. **northbound 现状**：`codestable/features/rewrite-northbound/` 下所有 design.md

### P2 — 上下文参考

8. **S001 决策**：`.sessions/2026-05-18-northbound-integration/S001-closed-loop-analysis.md` — "testCase = task 模板"映射的来源
9. **S008 第四轮**：`.sessions/2026-05-18-northbound-integration/S008-docking-ui-design.md` 末尾的 "2026-06-11 第四轮 HAR 真实流量比对"（V1.0.4 信封字段决策依据）
10. **甲方控制接口规范 V1.0**：`refactor/docs/甲方文档/集成系统控制接口规范V1.0.md`（出站 9 接口路径前缀 `/partner-api/admin/`）

## 下一轮

### 任务范围

把 `getTestCaseAll` handler 从返回 mock 数据，改成返回**真实 task 模板列表**，序列化成 V1.0.4 spec 格式，让甲方"用例同步"能跑通。

### 具体步骤（建议先开 brainstorm 再 design）

#### Step 1 — 厘清协议（最关键）

读 `03-用例管理.md` 里 getTestCaseAll 章节的**响应字段定义**。要回答：

- 响应体顶层是不是 `datas[]` 数组？
- `datas[]` 每项有哪些必填字段？字段名是什么？
- 是不是树形结构（用 isParent/children）？还是平铺数组 + parentId？
- 子层用例的字段有哪些？（V1.0.4 文档示例可能含 inputPars、preHandle、afterHandle 等字段）

**用户给的参考**（ka 子系统在甲方系统里的菜单格式）：

```json
{
    "menuId": 1780069365941,
    "subSysId": 1780069394660,
    "subSysName": "ka子系统导测",
    "outMenuId": "d33b322c840845078d05787f9c18d804",
    "outParentId": "0",
    "parentId": null,
    "parentMenuName": null,
    "menuName": "功能验证"
}
```

这是**甲方内部存储格式**，**不是协议格式**。但能看出甲方的用例模型是**两层树形**：menu（分类）→ 用例。规模参考：ka 子系统有 20+ 顶层菜单。

#### Step 2 — 设计 task 模板 → testCase 映射

每个 TaskTemplate 怎么序列化成一个 testCase？需要回答：

- 一对一翻译，还是有过滤（只暴露某种 type 的模板）？
- 模板的 steps 怎么处理？塞进 testCase.inputPars / preHandle / afterHandle？还是省略（甲方只关心用例存在，不关心内部步骤）？
- 当前 task 模板有没有"分类"概念？要不要在 UI 上让用户分菜单（功能验证/基本业务连通性/...）？
- 顶层菜单 vs 子用例的层级关系怎么从 task 模板推导出来？

#### Step 3 — 实现 + 替换 mock

- 改 getTestCaseAll handler：从读 `DEFAULT_TEST_CATALOG` 改成读 `taskService.listTemplates()` + 序列化
- 类型可能要改：当前 GetTestCaseAllResponse 类型如果跟 spec 不符，需要改
- mock 数据保留为 fallback / 测试 fixture，但运行时不再用

#### Step 4 — 验证联调

- 重启对接，让甲方调 getTestCaseAll
- 看甲方后端日志：syncCase 是不是成功？有没有 SQL 插入 t_out_menu？
- 看甲方前端：用例列表能不能显示我们的 task 模板？
- 我们这边 devtools console：响应体符合 spec？

### 开对话第一句建议

> 读 H007 handoff + S011 笔记 + V1.0.4 03-用例管理.md。本轮要做的是把 getTestCaseAll 从 mock 换成真实 task 模板列表。先开 brainstorm 厘清协议格式和映射方案，确认后再进 design。

### 关键开放问题（先和用户讨论）

1. **V1.0.4 spec 字段是当前 mock 的格式吗？**（isParent/children 树形结构）如果不是，需要先改类型再改实现
2. **task 模板怎么分类成顶层菜单？** 用户可能想要"功能验证/基本业务连通性/典型应用场景测试"这种 ka 风格的菜单分类，当前 task 模板可能没有这个字段
3. **甲方用例同步"不太行"的具体根因还没诊断** — 开对话时让用户先贴三个证据：
   - 甲方前端"用例同步"页面报什么错
   - 甲方后端日志 syncCase 后面有没有报错（JSON 解析失败 / 字段缺失 / SQL 异常）
   - 我们这边 devtools console `[northbound ← 甲方]` 的响应体内容

### 不要承诺的

- 不要承诺一轮搞定用例同步 → 真实执行 → verdict 上报。范围控制在 getTestCaseAll 单接口
- 不要承诺 UI 美化（用户之前提过"UI 丑"，但本轮不解决）
- 不要承诺报告生成 / FTP 文件交付
