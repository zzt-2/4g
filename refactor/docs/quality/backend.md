# 后端代码质量规则

> 实施阶段（3xx）代码质量标准。每条规则附示例，agent 和开发者对照执行。
>
> **硬规则** — 违反即为缺陷，必须修复。
> **经验规则** — 应当遵守；如有例外，需在代码中注释说明理由。
>
> 与 [后端开发规范](../conventions/backend.md) 的分工：convention 讲"怎么写"（完整模式与教程），本文档讲"写到什么程度才算合格"（检查标准）。

---

## 硬规则

### 类型安全

#### H1. 禁止 `any` 类型

所有变量、参数、返回值必须有明确类型。`any` 放弃了编译期检查。

```typescript
// ❌
const result: any = await someOperation();
function handle(data: any) { ... }
const completeFn: (...args: any[]) => Promise<any> = ...;

// ✅
const result: OperationResult = await someOperation();
function handle(data: InputData) { ... }
const completeFn: (prompt: string, opts: CompletionOpts) => Promise<CompletionResult> = ...;
```

Service 方法的入参和返回值使用 Prisma 生成的类型（如 `Prisma.XxxUpdateInput`），不用 `Record<string, unknown>` 等宽泛类型。

**例外**：Prisma JSON 字段桥接处允许受控的 `as unknown as`，但必须通过 E1 统一方案处理。

#### H2. 禁止占位 DTO Schema

DTO 中不允许 `z.any()`、`z.unknown()`、`z.record()` 作为字段 schema。占位 schema 等于放弃校验。

```typescript
// ❌ — template.dto.ts 的反面教材：9 个字段全是 z.any()
const TemplateSchema = z.object({
  inputs: z.any(),
  outputs: z.any(),
  modelConfig: z.any(),
});

// ✅ — 精确定义
const TemplateSchema = z.object({
  inputs: z.array(InputSchema),
  outputs: z.array(OutputSchema),
  modelConfig: ModelConfigSchema,
});
```

结构尚未稳定时，用 `z.object({}).passthrough()` 代替 `z.any()`，至少保留对象约束。

#### H3. 禁止 `as unknown as` 强制类型转换

`as unknown as` 绕过类型系统，隐藏真实的类型不匹配。Prisma JSON 桥接是唯一例外（见 E1）。

```typescript
// ❌
return data as unknown as WorkflowStep[];

// ✅ — 用类型守卫或运行时校验
function isWorkflowSteps(value: unknown): value is WorkflowStep[] {
  return Array.isArray(value) && value.every(v => 'id' in v && 'type' in v);
}
```

#### H4. 禁止 `console.log`，使用正确的日志组件

生产代码中 `console.log` 绕过结构化日志体系。根据所在层使用正确的日志组件：

| 场景 | 使用 |
|------|------|
| modules/ 关键路径 | `LoggerService` |
| SDK 关键执行路径 | `WorkflowLogger`（结构化事件，写 DB + 前端展示） |
| SDK 异常 catch 块 | `WorkflowLogger` + 可同时保留 NestJS `Logger`（stdout 排查） |
| SDK 非异常路径 | 不使用 NestJS Logger |

```typescript
// ❌
console.log('Processing step:', stepId);

// ✅ — modules 层
this.logger.info(`Processing step: ${stepId}`);

// ✅ — SDK 层
this.workflowLogger.log({ message: 'Processing step', data: { stepId }, ... });
```

### 代码结构

#### H5. Service 文件不超过 300 行

超过 300 行说明承担了过多职责，应拆分为多个 Service。拆分方式按职责边界切分，而非按行数机械切割。

```typescript
// ❌ — template.service.ts 310 行，承担 CRUD + 树查询 + YAML 导入导出 + 配置合并

// ✅ — 按职责拆分
// template.service.ts        — CRUD + 基础查询
// template-tree.service.ts   — 树结构查询
// template-import.service.ts — YAML 导入导出
```

#### H6. 单个方法不超过 100 行

超过 100 行的方法通常混合了多个步骤，应拆分为命名清晰的子方法。每个子方法名即文档。

```typescript
// ❌ — execute() 222 行，包含暂停恢复、模板解析、子 agent 调度、结果收集
async execute(runId: string, step: Step, cursor: Cursor, ...) {
  // 222 行混合逻辑
}

// ✅ — 拆分为职责清晰的子方法
async execute(params: ExecutionParams) {
  const context = await this.prepareContext(params);
  const result = await this.runExecution(context);
  await this.handleResult(result);
}
```

#### H7. 函数参数不超过 4 个

超过 4 个参数降低可读性，调用时容易搞错顺序。用对象封装。

```typescript
// ❌ — 7 个参数
async execute(runId: string, step: Step, cursor: Cursor, paramCtx: ParamContext, workflowContext: WorkflowContext, signal: AbortSignal, resumeFrom?: ResumeInfo) { ... }

// ✅ — 封装为接口
interface ExecutionParams {
  runId: string;
  step: Step;
  cursor: Cursor;
  paramCtx: ParamContext;
  workflowContext: WorkflowContext;
  signal: AbortSignal;
  resumeFrom?: ResumeInfo;
}
async execute(params: ExecutionParams) { ... }
```

### 常量与硬编码

#### H8. 禁止硬编码魔法数字和字符串

裸数字和字符串缺少语义，无法全局搜索，修改时容易遗漏。

```typescript
// ❌
const priority = item.sort ?? 99;
const url = `/api/knowledge?page_size=100`;
if (step.type === 'prompt') { ... }
await delay(5000);

// ✅
const DEFAULT_SORT_PRIORITY = 99;
const KNOWLEDGE_PAGE_SIZE = 100;
if (step.type === StepType.PROMPT) { ... }
await delay(WORKFLOW_RETRY_DELAY_MS);
```

各类常量的正确来源：

| 类别 | 来源 | 示例 |
|------|------|------|
| 系统配置键 | `SystemConfigKey` | `SystemConfigKey.AI_DEFAULT_MODEL` |
| 字典键 | `DictKey` | `DictKey.DOCUMENT_STATUS` |
| 事件名 | `WORKFLOW_EVENTS` / `TASK_EVENTS` | `WORKFLOW_EVENTS.RUN_STARTED` |
| 枚举值 | Prisma 生成枚举 / 自定义枚举 | `StepType.PROMPT` |
| 阈值/延时 | 模块顶部命名常量 | `const MAX_RETRY = 3` |

### 重复与复用

#### H9. DRY 三次法则

同一逻辑在第三处出现时必须提取。出现两次时可以先容忍，三次就是信号。

```typescript
// ❌ — 分页查询构造分散在各 service，每次都重写
// workflow.service.ts
const [records, total] = await Promise.all([
  this.prisma.workflow.findMany({ where, skip: (page - 1) * pageSize, take: pageSize }),
  this.prisma.workflow.count({ where }),
]);
// domain.service.ts — 几乎一样
// template.service.ts — 又来一次

// ✅ — 提取通用分页查询工具
// common/utils/pagination.ts
export async function paginate<T>(
  delegate: PrismaDelegate<T>,
  where: object,
  page: number,
  pageSize: number,
) { ... }
```

**但不要过早提取**（见 E4）。

#### H10. 跨模块复用代码放 `@thesis/shared`

前后端或多个模块共用的常量、类型、工具函数，统一放 `packages/shared`。不得在消费侧再手写一份等价结构。

```typescript
// ❌ — 前后端各自定义
// 前端: const PRIORITY_OPTIONS = [{ label: '高', value: 'HIGH' }, ...]
// 后端: const PRIORITY_HIGH = 'HIGH'

// ✅ — 从 shared 引入
import { DictKey } from '@thesis/shared';
```

判断标准：如果删掉本地结构后，字段边界仍能只从 shared 读出来，说明是包装层；如果本地结构自己决定了字段存在性，就已经越界成第二份契约。

### 架构边界

#### H11. SDK 层不 import modules/

SDK 是独立的 AI 编排引擎，通过 Port 接口与业务层解耦。

```typescript
// ❌
import { TemplateService } from '@/modules/template/services/template.service';

// ✅ — 通过 Port 接口
import { TemplateQueryPort } from '@/sdk/interfaces/template-query.port';
// modules 层实现 Port 并通过 DI 注入
```

#### H12. 跨模块数据通过注入对方 Service

不直接查对方模块的表，避免紧耦合。

```typescript
// ❌ — 在 WorkflowService 中直接查 Template 表
const template = await this.prisma.template.findUnique({ where: { id } });

// ✅ — 委托给归属模块
const template = await this.templateService.findOne(id);
```

#### H13. 不在 A 模块重新实现 B 模块已有逻辑

如果另一个模块已有合并、校验、格式化等逻辑，注入对方 Service 调用，不要复制。

#### H14. 不存在 `queryRaw`

优先使用 Prisma 原生方法（`groupBy`、`aggregate`、`count` 等）。如果 Prisma 确实无法表达，需注释说明原因。

#### H15. LLM 调用必须通过 AgentService

所有 LLM 调用必须通过 `AgentService` 统一封装，禁止业务代码直接调 AI SDK。这是 H11 的对称约束——SDK 不 import modules，modules 也不直接调 SDK。

```typescript
// ❌ — 直接调用 AI SDK
import { generateText } from 'ai';
const result = await generateText({ model: openai('gpt-4'), prompt: '...' });

// ✅ — 通过 AgentService
@Injectable()
export class PaperWritingService {
  constructor(private readonly agentService: AgentService) {}

  async generateSection(projectId: string, traceId: string) {
    return this.agentService.invoke({
      agentType: 'paper-writer',
      input: { projectId },
      traceId, // 必须，用于链路追踪
    });
  }
}
```

#### H16. 新建 `@Injectable()` 必须立即注册到 Module 的 providers

创建 Service 文件后，注册到对应 Module 是创建流程的一部分，不是"后续步骤"。遗漏会导致运行时 DI 报错，且错误信息对排查者不友好。

```typescript
// ❌ — 创建了文件但忘记注册
// sdk/orchestrator/engine/new-service.ts → 已创建
// sdk/sdk.module.ts → providers 数组里没有 NewService

// ✅ — 创建和注册同步完成
// sdk/sdk.module.ts
@Module({
  providers: [
    // ...existing
    NewService,  // ← 创建文件时同步添加
  ],
})
export class SdkModule {}
```

### DTO 与接口

#### H17. Response DTO 必须完整且 `@ApiResponse` 必须指定 `status`

Response DTO 是前后端契约。字段不完整会导致前端类型退化为 `unknown`。`@ApiResponse` 缺少 `status` 会导致 Swagger 注册为 default 错误响应，前端生成器产出 `unknown`。

```typescript
// ❌ — Response DTO 缺字段
const ResponseSchema = z.object({ id: z.string(), name: z.string() });
// 前端拿不到 status、createdAt 等字段

// ❌ — 缺少 status → 前端生成 unknown
@ApiResponse({ type: ProjectResponseDto })
async findOne(...) { ... }

// ✅ — 完整定义 + 显式 status
const ResponseSchema = z.object({
  id: z.string().describe('项目ID'),
  name: z.string().describe('项目名称'),
  status: z.number().int().describe('状态：1启用 0禁用'),
  created_at: z.coerce.date().describe('创建时间'),
  updated_at: z.coerce.date().describe('更新时间'),
});

@ApiResponse({ status: 200, type: ProjectResponseDto })
async findOne(...) { ... }
```

#### H18. Controller 方法不标注 `Promise<Dto>` 返回类型

Service 返回 Prisma 模型类型，与 Zod DTO 类型结构上兼容但 TypeScript 无法自动证明。标注返回类型会触发 TS 编译错误，用 `as unknown as` 绕过更差。只用 `@ApiResponse` 声明即可。

```typescript
// ❌ — 触发 TS2322
@ApiResponse({ status: 200, type: ProjectResponseDto })
async findOne(@Param('id') id: string): Promise<ProjectResponseDto> {
  return this.projectService.findOne(id);
}

// ❌❌ — 更差：用 as unknown as 掩盖问题
return this.projectService.findOne(id) as unknown as Promise<ProjectResponseDto>;

// ✅ — 只用 @ApiResponse 声明类型，不标注返回类型
@ApiResponse({ status: 200, type: ProjectResponseDto })
async findOne(@Param('id') id: string) {
  return this.projectService.findOne(id);
}
```

#### H19. 数组响应必须用 `[Dto]` 语法

直接用 `z.array()` 创建 DTO，Swagger 无法正确识别为数组类型，前端生成的类型会退化。必须定义单项 DTO，在 Controller 中使用 `[Dto]` 语法。

```typescript
// ❌ — z.array() 创建 DTO，Swagger 无法识别
const PaperListSchema = z.array(PaperItemSchema);
export class PaperListDto extends createZodDto(PaperListSchema) {}

@Get('list')
@ApiResponse({ status: 200, type: PaperListDto })  // 前端生成错误的类型
async findAll() { ... }

// ✅ — 单项 DTO + [Dto] 语法
export class PaperItemDto extends createZodDto(PaperItemSchema) {}

@Get('list')
@ApiResponse({ status: 200, type: [PaperItemDto] })  // 注意方括号
async findAll() { ... }
```

#### H20. DTO Schema 必须适配 HTTP 传输语义

HTTP Query 参数全是字符串，Zod Schema 必须做对应的类型转换，否则校验失败。两个常见陷阱：

**数字和布尔必须用 `z.coerce`：**

```typescript
// ❌ — Query 参数 "1" 无法通过 z.number() 校验
const QuerySchema = z.object({
  page: z.number().int().min(1),
  isEnabled: z.boolean(),
});

// ✅ — coerce 自动将字符串转为目标类型
const QuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  isEnabled: z.coerce.boolean().optional(),
});
```

**可选字符串必须加 `.or(z.literal(''))`：**

```typescript
// ❌ — 前端传空字符串时校验失败（空字符串不是 undefined）
const FilterSchema = z.object({
  name: z.string().optional(),
});

// ✅ — 同时接受 undefined 和空字符串
const FilterSchema = z.object({
  name: z.string().optional().or(z.literal('')),
});
```

#### H21. 时间字段用 `z.string()` 不用 `z.date()`

`z.date()` 会导致前后端时间类型不一致（JS Date vs ISO string）。DTO 中统一用 `z.string()`，Service 中用 dayjs 转换。

```typescript
// ❌
const Schema = z.object({
  startDate: z.date(),
  endDate: z.date(),
});

// ✅
const Schema = z.object({
  startDate: z.string(),
  endDate: z.string(),
});
// Service 中: dayjs(dto.startDate).toDate()
```

#### H22. 列表接口必须 `select` / `omit` 裁剪大字段

`findAll` / `findMany` 列表查询必须排除前端不需要的大字段（JSON 配置、长文本等），只在详情接口返回完整数据。

---

## 经验规则

### Prisma JSON 类型安全

#### E1. Prisma JSON 字段统一通过类型安全访问层处理

项目中 Prisma JSON 字段（steps、routing、layout 等）存在 25+ 处 `as unknown as` 强转。应建立统一的类型安全转换机制。

```typescript
// ❌ — 到处散布 as unknown as
const steps = stepData.steps as unknown as WorkflowStep[];
const routing = config.routing as unknown as RoutingDeclaration;

// ✅ — 统一类型安全转换函数
// common/utils/json-types.ts
function parseJsonField<T>(value: Prisma.JsonValue, schema: z.ZodSchema<T>): T {
  return schema.parse(value);
}

// 使用
const steps = parseJsonField(stepData.steps, WorkflowStepArraySchema);
const routing = parseJsonField(config.routing, RoutingDeclarationSchema);
```

好处：`schema.parse` 提供运行时校验，`as unknown as` 不提供。将来如果 JSON 结构和业务类型出现漂移，`parseJsonField` 会在运行时报错而不是静默产出错误类型。

### 新建文件决策

#### E2. 新建文件/模块前先确认必要性

Agent 容易一上来就建新文件或新目录。决策流程：

1. **这个逻辑属于现有哪个模块？** 能否在现有文件中追加方法？
2. **如果需要新建**，是加在现有模块的子目录（如 `services/`、`handlers/`）还是独立模块？
3. **新建 Service 后**是否已注册到 Module 的 providers？（见 H16）
4. **新建工具函数**是否应该放 `common/utils/` 而非模块内部？

```typescript
// ❌ — 每个辅助函数都新建文件
// utils/string-helper.ts (5 行)
// utils/number-helper.ts (3 行)
// utils/date-helper.ts (8 行)

// ✅ — 相关辅助函数放在一起
// utils/format.ts — 包含 formatString, formatNumber, formatDate
```

### 存在性检查模式

#### E3. 提取重复的"查询 + 不存在则抛异常"模式

项目中多处重复 `findUnique + if (!result) throw NotFoundException` 模式。

```typescript
// ❌ — 每个 service 重复写
const item = await this.prisma.xxx.findUnique({ where: { id } });
if (!item) throw new NotFoundException('xxx不存在');

// ✅ — 各 service 内部提取 private 方法
private async ensureExists(id: string) {
  const item = await this.prisma.xxx.findUnique({ where: { id } });
  if (!item) throw new NotFoundException('xxx不存在');
  return item;
}
```

不需要做全局通用工具——各 service 内部提取 private 方法即可，因为实体类型和提示文案各不相同。

### 抽取时机

#### E4. 不要过早提取

不是所有重复都需要立刻消除。以下信号说明还不该提取：

- 只出现两次，且变化节奏不同（一个可能改，另一个不会）
- 提取后需要传大量上下文参数（接口反而更复杂）
- "相似"但语义不同（只是恰好长得像）

遵循三次法则：等第三次出现再提取。提取前先确认已有的公共组件/函数能否直接复用。

### 注释边界

#### E5. 注释解释 why 不解释 what

代码本身应足够清晰表达 what。注释留给 WHY：非显而易见的设计决策、绕过方案、隐含约束。

```typescript
// ❌
// 获取用户列表
const users = await this.prisma.user.findMany();

// ✅
// 使用 findFirst 而非 findUnique，因为 name 字段不是唯一索引
const existing = await this.prisma.user.findFirst({ where: { name } });

// ✅
// 默认值 FAILED 是防御式编码：只有异常路径才会走到这里
const attempt = await this.createAttempt({ status: TaskStatus.FAILED });
```

### 职责判定

#### E6. 职责混写的常见信号

以下信号说明一个类/文件承担了过多职责，需要拆分：

- 一个 Service 同时有 CRUD、聚合查询、导入导出、格式转换方法
- 一个方法内同时做"获取数据 → 转换格式 → 写入存储 → 发通知"
- 一个类的 constructor 注入了超过 5 个依赖
- 测试时需要 mock 大量不相关的依赖

拆分原则：按变化的理由分组。如果两个方法会因为不同的产品需求而改变，它们不应在同一个类里。

### 错误处理

#### E7. 使用 NestJS 内建异常类

不抛原生 `Error`，使用 `NotFoundException`、`ConflictException`、`BadRequestException` 等 NestJS 异常，确保 HTTP 状态码和错误格式统一。

```typescript
// ❌
if (!item) throw new Error('找不到');

// ✅
if (!item) throw new NotFoundException('xxx不存在');
if (existing) throw new ConflictException('名称已存在');
```

### 测试

#### E8. 纯函数必须有独立单元测试

独立抽取的 validator、parser、transformer、utils 等纯函数，必须有对应的单元测试文件。纯函数无副作用、易测试，没有测试覆盖说明实现流程不完整。

```typescript
// control-processor.parser.ts
export function parseControlCommand(raw: unknown): ControlCommand { ... }

// control-processor.parser.spec.ts
describe('parseControlCommand', () => {
  it('should parse valid gate command', () => { ... });
  it('should reject invalid type', () => { ... });
});
```

### 数据契约稳定性

#### E9. 消费即契约 + 结构不压扁

两条相关约束：

**消费即契约**：如果 summary / projection / resolvedSummary 被前端用于能力判断、入口显示、下载聚合等关键行为，就不能当临时内部结构。必须显式暴露所需字段，并补回归测试。

**结构不压扁**：生产层已有的结构化语义（如 `outputSnapshot` 的 `type/source/persistence/collected`）在 DTO、Service 聚合与下载层应继续保留。只有确认消费方不需要时才能裁剪。

### 模块导入

#### E10. ESM 包必须通过 `importEsm()` 导入

项目是 CJS 模式，导入纯 ESM 包时使用 `@common/runtime/esm-import` 的 `importEsm()` 函数。禁止在业务代码中直接用 `new Function('return import(...)')`。

```typescript
// ❌
const mod = await (new Function('return import("some-esm-pkg")'))();

// ✅
import { importEsm } from '@/common/runtime/esm-import';
const mod = await importEsm<typeof SomePkg>('some-esm-pkg');
```
