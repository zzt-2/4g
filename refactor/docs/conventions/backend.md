# 研究论文生成平台后端开发规范

## 技术栈

NestJS + TypeScript + Prisma + Zod + Swagger + PostgreSQL + Redis + JWT + BullMQ + Socket.IO

**注意**: Zod 是硬性限制，绝对不要使用其他方案（如 class-validator）！

## 项目结构

```
apps/server/src/
├── main.ts
├── common/                          # 底层公共模块（基础设施）
│   ├── prisma/                      # Prisma 相关
│   │   ├── prisma.service.ts        # Prisma 服务
│   │   ├── prisma.module.ts         # Prisma 模块
│   │   └── generated/               # Prisma 生成的类型和 Client
│   ├── filters/                     # 异常过滤器
│   ├── guards/                      # 通用守卫
│   ├── interceptors/                # 拦截器
│   ├── interfaces/                  # 通用接口定义
│   ├── runtime/                     # 运行时兼容 helper（如 CJS 导入 ESM）
│   ├── storage/                     # 文件存储抽象 (LocalStorage/OSS, 环境变量切换)
│   ├── types/                       # 类型定义
│   └── utils/                       # 工具函数
├── sdk/                             # Agent SDK（独立层，不依赖 modules/）
│   ├── sdk.module.ts                # SDK 注册入口
│   ├── interfaces/                  # 跨层共享的接口和 Port 定义
│   │   ├── routing.interface.ts     # RoutingDeclaration 接口
│   │   ├── knowledge-query.port.ts  # 文档库查询端口
│   │   ├── template-query.port.ts   # 模板查询端口
│   │   ├── control-action.interface.ts
│   │   └── task-result.interface.ts
│   ├── infrastructure/              # 基础设施层（状态管理、文件系统、事件总线）
│   ├── configuration/               # 配置层（模板合并、参数解析、提示词组装）
│   ├── input-model/                 # 输入模型层（knowledge/runtime/prompt-material/legacy）
│   │   ├── knowledge/               # 模板静态知识输入解析
│   │   ├── runtime/                 # 工作流运行时 binding 解析
│   │   ├── prompt-material/         # Prompt 物料归并整形
│   │   └── legacy/                  # 旧 DSL 到新核心模型的兼容映射
│   ├── orchestrator/                # 编排器层
│   │   ├── engine/                  # 核心编排 (R048 提取)
│   │   │   ├── workflow-engine.service.ts  # 主循环 + 控制流分发
│   │   │   ├── workflow-bootstrap.service.ts # 工作流初始化与状态恢复
│   │   │   ├── workflow-control-flow.service.ts # 控制流判断（gate/pause/skip）
│   │   │   ├── task-lifecycle.service.ts   # 单任务生命周期编排
│   │   │   ├── map-expander.service.ts     # map 子步骤展开
│   │   │   ├── map-runtime.bridge.ts       # map 子步骤局部运行时挂载
│   │   │   ├── workflow-abort.service.ts   # AbortController 信号管理
│   │   │   └── workflow-engine.utils.ts    # 纯函数工具
│   │   ├── io/                      # 文件 I/O（输出回收与共享目录读写辅助）
│   │   │   └── output-collector.service.ts  # 产出回收 (persistence 路由)
│   │   ├── control-processor/       # ControlProcessor 子系统
│   │   │   ├── control-processor.service.ts  # 薄路由器
│   │   │   ├── control-processor.parser.ts   # 解析/校验/决策纯函数
│   │   │   ├── control-processor.utils.ts    # JSON 容错、params 净化
│   │   │   └── handlers/            # 控制指令 Handler
│   │   ├── elastic-ops-handler.service.ts  # 弹性操作路由
│   │   ├── gate-checker.service.ts   # 输出门控
│   │   ├── cursor-advancer.service.ts
│   │   └── post-task-pipeline.service.ts
│   ├── execution/                   # 执行层（任务调度、AI/CODE 调用）
│   │   ├── task-prompt-executor.service.ts  # LLM/Agent 执行入口
│   │   ├── task-code-executor.service.ts    # CODE 执行入口
│   │   ├── subagent-runner.service.ts  # Agentic Loop (pi-agent-core agentLoop)
│   │   └── task-dispatcher.service.ts
│   └── tooling/                     # 工具层（文件读写工具 + 未来 MCP）
│       ├── tool-executor.service.ts  # 工具注册 + 调度
│       └── handlers/                # readFile / writeFile / listDir
└── modules/
    ├── app.module.ts                # 根模块
    ├── tokens.ts                    # 依赖注入 Token
    ├── auth/                        # 鉴权模块
    │   ├── decorators/              # 装饰器（CurrentUser, Permissions, Roles）
    │   ├── guards/                  # 鉴权守卫
    │   ├── enums/                   # 权限枚举
    │   └── services/                # 权限服务
    ├── common/                      # 业务公共模块
    │   ├── constants/               # 常量定义
    │   ├── enums/                   # 业务枚举
    │   ├── services/                # 公共服务（UserService, RedisService）
    │   ├── decorators/              # 业务装饰器
    │   ├── dto/                     # 公共 DTO
    │   ├── utils/                   # 工具函数（zod-schemas）
    │   └── provider/                # 服务提供者
    ├── system/                      # 系统管理模块
    │   ├── controllers/             # 控制器
    │   ├── services/                # 服务
    │   └── dto/                     # DTO 定义
    └── [其他业务模块]/
        ├── [module].module.ts
        ├── controllers/              # 控制器目录（多文件拆分）
        │   ├── admin-[module].controller.ts   # 管理端控制器
        │   └── api-[module].controller.ts     # 用户端控制器
        ├── services/                 # 服务目录（多文件拆分）
        │   ├── [module].service.ts            # 主服务（管理端）
        │   └── api-[module].service.ts        # 用户端服务
        ├── dto/
        │   ├── [module].dto.ts                # 管理端请求 DTO
        │   ├── [module]-response.dto.ts       # 管理端响应 DTO
        │   ├── api-[module].dto.ts            # 用户端请求 DTO
        │   └── api-[module]-response.dto.ts   # 用户端响应 DTO
        ├── queues/                    # BullMQ 队列（与模块同目录）
        │   ├── [queue-name].queue.ts          # 队列定义与 Schema
        │   └── [queue-name].processor.ts      # 队列处理器
        └── gateways/                  # Socket.IO 网关
            └── [module].gateway.ts

prisma/
├── schema/                          # 多文件 Prisma Schema (按业务域拆分)
└── seed.ts

scripts/                             # CLI 工具脚本
├── kb-import.ts                     # 文档库批量导入 (本地 .md -> DB + Storage)
└── kb-export.ts                     # 文档库批量导出 (DB + Storage -> 本地 .md)
```

### SDK 层架构约束

SDK 是独立的 AI 编排引擎，与 modules/ 业务层完全隔离。以下约束适用于 `src/sdk/` 下的所有代码：

1. **依赖方向**: `infrastructure/` 为底层；`configuration/` 与 `input-model/` 不得依赖 `orchestrator/`；`orchestrator/` 负责编排并调用 `configuration/`、`input-model/`；`execution/` 与 `tooling/` 不得反向承载输入解析职责。orchestrator 不得直接解释 legacy 输入声明，必须通过 `input-model/legacy/` adapter 转译后消费标准模型
2. **模块隔离**: SDK 不得 import `modules/` 或 `common/` 中的任何内容（通过 Port 接口解耦；`common/logging/` 例外——WorkflowLogger 是全局基础设施）
3. **路径归口**: 所有文件路径操作必须通过 `AgentFsManagerService`，禁止直接使用 `path.join` / `fs.readFile`
4. **日志**: 关键执行路径使用 `WorkflowLogger`（结构化事件，写 DB + 前端展示）。异常 catch 块可同时保留 NestJS 内置 `Logger`（运维排查 stdout，因此时 DB 操作可能失败）。非异常路径不使用 NestJS Logger。`onAiResponse` 回调中含 toolCall 的 message_end 不上报 text 部分（防止鹦鹉学舌污染日志）(R052-R053 同步)
5. **数据库访问**: 通过 `interfaces/` 中定义的 Port 接口，由 modules/ 层实现并注入
6. **Service 行数**: 单个 Service 文件不超过 300 行（不含类型定义和注释），超过则拆分
7. **新建 @Injectable() Service**: 创建文件后必须立即注册到对应 Module 的 providers——作为创建流程的一部分，而非后续步骤
8. **目录放置规范**: 输入解析相关新能力优先放 `input-model/`，不要再塞回 `orchestrator/io/`；`engine/` 存放核心编排与 map 局部桥接；`io/` 存放输出回收等文件 I/O；`control-processor/` 存放控制指令解析子系统
9. **真相源先锁定**: 进入实现前，先明确本次改动的真相源是 front matter、seed、spec、运行时快照还是兼容层；禁止多个层同时定义同一产品边界
10. **兼容层归口**: 旧 DSL、旧字段和过渡写法必须优先收口到 `input-model/legacy/`、adapter 或显式兼容层，不要在 orchestrator / execution 主链直接解释旧口径
11. **字段穿透检查**: 新增、删除或重命名模板/工作流核心字段时，必须同步检查 Prisma schema、DTO、query adapter、TemplateMerger、运行时空配置回退、YAML 导入导出、seed helper、测试和相关 spec

## 导入路径规范

使用 `@/` 别名映射 `src/`，所有导入优先使用别名：

```typescript
// 正确
import { User, UserType, PrismaService } from "@/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

// 错误
import { User } from "../../../common/prisma/generated/client";
```

## 鉴权方案

### 接口鉴权与各种修饰器用法

```typescript
import {
  NeedLogin,
  Permissions,
  PermissionsOr,
  Roles,
  CurrentUser,
} from "@/modules/auth";

@Controller("user")
@NeedLogin() // 整个控制器需要登录
export class UserController {
  @Get("profile")
  getProfile(@CurrentUser() user: User) {} // 包含完整User信息

  @Get("type")
  getUserType(@CurrentUser("user_type") userType: string) {} // 仅获取特定字段

  @Post()
  @Permissions(Permission.CONFIG_CREATE) // 单个特定权限
  async createConfig() {}

  @Put(":id")
  @Permissions(Permission.CONFIG_READ, Permission.CONFIG_UPDATE) // 必须同时拥有多个权限
  async updateConfig() {}

  @Get()
  @PermissionsOr(Permission.CONFIG_READ, Permission.CONFIG_UPDATE) // 拥有其一权限即可
  async getConfigList() {}

  @Get("dashboard")
  @Roles(Role.ADMIN) // 只有特定角色访问
  async getDashboard() {}
}
```

### 4. 添加新权限

在 `src/modules/auth/enums/permission.enum.ts` 中添加：

```typescript
export enum Permission {
  // ... 已有权限

  // 新模块权限（按模块分组，使用 module:action 格式）
  PROJECT_CREATE = "project:create",
  PROJECT_READ = "project:read",
  PROJECT_UPDATE = "project:update",
  PROJECT_DELETE = "project:delete",
}
```

## DTO 定义规范

### 1. 基础 Zod 规范

```typescript
import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import {
  CommonFields,
  createQuerySchema,
} from "../../common/utils/zod-schemas";

// ================================
// Zod Schema 定义
// ================================

// 创建 DTO Schema
const CreateProjectSchema = z.object({
  name: z.string().min(1, "名称不能为空").max(100, "名称不能超过100个字符"),
  description: z.string().max(500).optional(),
  status: z.coerce.number().min(0).max(1).default(1), // 数字类型用 coerce
  tags: z.array(z.string()).optional(), // 数组类型
  remark: CommonFields.remark, // 使用通用字段
  metadata: z.record(z.string(), z.string()), // 第一个是 key 的类型，第二个是 value 的类型
});

// 更新 DTO Schema（基于创建 Schema 的 partial）
const UpdateProjectSchema = CreateProjectSchema.partial();

// 查询 DTO Schema（使用工厂函数，统一 page/pageSize 分页）
const QueryProjectSchema = createQuerySchema({
  name: z.string().optional().or(z.literal("")), // 可选字符串必须加 .or(z.literal(''))
  status: z.coerce.number().optional(), // 数字可选不需要
  category: z.enum(["thesis", "report", "review"]).optional().or(z.literal("")),
});

// ================================
// 导出 DTO 类
// ================================
export class CreateProjectDto extends createZodDto(CreateProjectSchema) {}
export class UpdateProjectDto extends createZodDto(UpdateProjectSchema) {}
export class QueryProjectDto extends createZodDto(QueryProjectSchema) {}
```

### 2. Zod 注意事项

所有枚举都统一从 @/common 直接引入 prisma 自动生成的枚举定义，除非 prisma 没有定义，否则不要自己定义枚举

```typescript
// 正确示例

// 1. Query/Params 中的数字和布尔必须用 coerce
const QuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  isEnabled: z.coerce.boolean().optional(),
});

// 2. 可选字符串字段必须加 .or(z.literal(''))
const FilterSchema = z.object({
  name: z.string().optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
  status: z.enum(XXXXXX).optional().or(z.literal("")),
});

// 3. 时间字段使用 string，在 service 中用 dayjs 转换
const CreatePaperSchema = z.object({
  startDate: z.string(), // 不要用 z.date()
  endDate: z.string(),
});

// 4. Prisma 生成的枚举用 nativeEnum，自定义枚举用 z.enum
const StatusSchema = z.object({
  status: z.nativeEnum(PrismaGeneratedStatus), // Prisma 枚举
  customField: z.enum(["active", "archived"]), // 自定义字面量
});

// 5. ID 使用 string（UUID）
const IdParamSchema = z.object({
  id: z.string().uuid("ID格式不正确"),
});

// 错误示例
const BadSchema = z.object({
  page: z.number(), // Query 参数会是字符串
  name: z.string().optional(), // 空字符串会校验失败
  date: z.date(), // 会导致时间类型不一致
  url: z.string().url(), // 不要使用 url 验证
});
```

### 3. 响应 DTO 定义

**注意**: 响应 DTO 是硬性要求，不是可选项！每个有返回值的 Controller 方法都必须创建对应的 Response DTO 并加上 `@ApiResponse` 装饰器。缺少这一步会导致前端自动生成的 API 类型全部退化为 `unknown`，迫使前端手写类型、引发字段名不匹配等难以排查的 bug。

```typescript
// src/modules/project/dto/project-response.dto.ts
import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { createPaginatedResponseSchema } from "@/modules/common/dto/response.dto";

// 单个项目响应 Schema
const ProjectResponseSchema = z.object({
  id: z.string().describe("项目ID"),
  name: z.string().describe("项目名称"),
  description: z.string().nullable().describe("项目描述"),
  status: z.number().int().describe("状态：1启用 0禁用"),
  created_at: z.coerce.date().describe("创建时间"),
  updated_at: z.coerce.date().describe("更新时间"),
});

export class ProjectResponseDto extends createZodDto(ProjectResponseSchema) {}

// 分页响应 Schema
const ProjectPaginatedResponseSchema = createPaginatedResponseSchema(
  ProjectResponseSchema,
);

export class ProjectPaginatedResponseDto extends createZodDto(
  ProjectPaginatedResponseSchema,
) {}
```

#### @ApiResponse 必须指定 status（重要！）

`@ApiResponse` 装饰器**必须显式指定 `status` 字段**，否则 NestJS Swagger 会将其注册为 "default" 错误响应而非 2xx 成功响应，导致前端代码生成器（@hey-api/openapi-ts）生成的 query options 返回类型退化为 `unknown`。

```typescript
// 正确 -- 显式指定 status
@ApiResponse({ status: 200, type: ProjectResponseDto })
async findOne(@Param('id') id: string) {
  return this.projectService.findOne(id);
}

@ApiResponse({ status: 201, type: ProjectResponseDto })
async create(@Body() dto: CreateProjectDto) {
  return this.projectService.create(dto);
}

// 错误 -- 缺少 status，前端生成的类型是 unknown
@ApiResponse({ type: ProjectResponseDto })
async findOne(@Param('id') id: string) { ... }
```

#### 不要用 Promise<Dto> 返回类型标注

Controller 方法**不要添加** `Promise<XxxDto>` 返回类型标注。Service 层返回的是 Prisma 生成的模型类型，与 Zod 生成的 DTO 类型结构上兼容但 TypeScript 无法自动证明，会触发类型错误。也**不要用** `as unknown as` 强制转换来绕过，这只会掩盖真实的类型不匹配问题。

```typescript
// 正确 -- 只用 @ApiResponse 声明类型，不标注返回类型
@ApiResponse({ status: 200, type: ProjectResponseDto })
async findOne(@Param('id') id: string) {
  return this.projectService.findOne(id);
}

// 错误 -- Prisma 返回类型与 Zod DTO 不兼容，触发 TS 类型错误
@ApiResponse({ status: 200, type: ProjectResponseDto })
async findOne(@Param('id') id: string): Promise<ProjectResponseDto> {
  return this.projectService.findOne(id);  // TS2322
}

// 更差 -- 用 as unknown as 绕过类型检查，掩盖真实问题
return this.projectService.findOne(id) as unknown as Promise<ProjectResponseDto>;
```

#### 数组响应类型定义

**核心原则：直接返回数组时，不能用 `z.array()` 创建 DTO，必须使用单项 DTO + `[Dto]` 语法。**

```typescript
// 错误用法 - 直接用 z.array 创建 DTO，Swagger 无法正确识别
const PaperListResponseSchema = z.array(PaperResponseSchema);
export class PaperListResponseDto extends createZodDto(PaperListResponseSchema) {}

// 正确用法 - 定义单项 DTO，在 Controller 中使用 [Dto] 语法
// 1. DTO 中只定义单项
const PaperItemSchema = z.object({
  id: z.string().describe('论文ID'),
  title: z.string().describe('论文标题'),
});
export class PaperItemDto extends createZodDto(PaperItemSchema) {}

// 2. Controller 中使用 [Dto] 表示数组
@Get('list')
@ApiOperation({ summary: '获取论文列表' })
@ApiResponse({ status: 200, type: [PaperItemDto] })
async findAll() {
  return this.paperService.findAll();
}
```

**何时需要这样处理：**

- 接口直接返回数组（如 `GET /options`、`GET /list` 不分页场景）
- 分页响应不受影响（分页响应本身是对象，内部包含数组字段）

### 4. 使用通用 Schema 工具

```typescript
import { CommonFields, CommonQueryFields, createQuerySchema } from "@/common";

// 使用通用字段
const CreateSchema = z.object({
  name: CommonFields.name, // 必填名称，1-100字符
  title: CommonFields.title, // 必填标题，1-200字符
  description: CommonFields.description, // 可选描述，最多500字符
  remark: CommonFields.remark, // 可选备注，最多500字符
  status: CommonFields.status, // 状态 0/1，默认1
  sort: CommonFields.sort, // 排序，默认0
  phone: CommonFields.phone, // 手机号验证
  email: CommonFields.email, // 邮箱验证
  password: CommonFields.password, // 密码，6-50字符
});

// 使用分页查询工厂（统一 page/pageSize 分页）
const QuerySchema = createQuerySchema({
  name: CommonQueryFields.name,
  status: CommonQueryFields.status,
});
// 结果包含: { name?, status?, page: 1, pageSize: 20 }
```

## API 标签命名规范

| 接口类型   | 前缀      | Controller 命名与路径                   | 文档过滤行为         |
| ---------- | --------- | --------------------------------------- | -------------------- |
| 管理端接口 | `管理端-` | `admin-*.controller.ts` 路径 `/admin/*` | 仅在 `/docs` 显示    |
| 用户端接口 | `用户端-` | `api-*.controller.ts` 路径 `/api/*`     | 仅在 `/api-doc` 显示 |
| 通用接口   | 无前缀    | 路径如 `/auth/*`                        | 两侧文档都可以看到   |

## Controller 示例

```typescript
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import {
  ApiOperation,
  ApiParam,
  ApiBody,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { User } from "@/common";
import {
  CurrentUser,
  Permissions,
  Permission,
  NeedLogin,
} from "@/modules/auth";
import {
  CreateProjectDto,
  UpdateProjectDto,
  QueryProjectDto,
} from "./dto/project.dto";
import {
  ProjectResponseDto,
  ProjectPaginatedResponseDto,
} from "./dto/project-response.dto";
import { ProjectService } from "./project.service";

@ApiTags("管理端-项目管理") // 管理端接口使用 "管理端-" 前缀
@Controller("admin/project")
@NeedLogin()
export class AdminProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @Post()
  @ApiOperation({ summary: "创建项目" })
  @ApiResponse({ type: ProjectResponseDto, status: 201 })
  @Permissions(Permission.PROJECT_CREATE)
  async create(@Body() dto: CreateProjectDto, @CurrentUser() user: User) {
    return await this.projectService.create(dto, user.id);
  }

  @Get()
  @ApiOperation({ summary: "获取项目分页列表" })
  @ApiResponse({ type: ProjectPaginatedResponseDto, status: 200 })
  @Permissions(Permission.PROJECT_READ)
  async findAll(@Query() query: QueryProjectDto) {
    return await this.projectService.findAll(query);
  }

  @Get(":id")
  @ApiOperation({ summary: "获取项目详情" })
  @ApiResponse({ type: ProjectResponseDto, status: 200 }) // 普通的返回 200
  @Permissions(Permission.PROJECT_READ)
  async findOne(@Param("id") id: string) {
    return await this.projectService.findOne(id);
  }

  @Put(":id")
  @ApiOperation({ summary: "更新项目" })
  @ApiResponse({ type: ProjectResponseDto, status: 200 })
  @Permissions(Permission.PROJECT_UPDATE)
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateProjectDto,
    @CurrentUser() user: User,
  ) {
    return await this.projectService.update(id, dto, user.id);
  }

  @Delete(":id")
  @ApiOperation({ summary: "删除项目" })
  @ApiResponse({ status: 200 }) // 无返回值的方法也必须声明 status，否则前端生成 unknown
  @Permissions(Permission.PROJECT_DELETE)
  async remove(@Param("id") id: string, @CurrentUser() user: User) {
    return await this.projectService.remove(id, user.id);
  }
}
```

## Service 示例

注意 不需要各种 toDTO 函数，直接返回即可

```typescript
import {
  Injectable,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { PrismaService, LoggerService } from "@/common";
import {
  CreateProjectDto,
  UpdateProjectDto,
  QueryProjectDto,
} from "./dto/project.dto";

@Injectable()
export class ProjectService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  async create(dto: CreateProjectDto, userId: string) {
    // 检查是否重复
    const exists = await this.prisma.project.findFirst({
      where: { name: dto.name },
    });
    if (exists) {
      throw new ConflictException("项目名称已存在");
    }

    const project = await this.prisma.project.create({
      data: {
        ...dto,
        created_by: userId,
      },
    });

    this.logger.info(`用户 ${userId} 创建项目 ${project.id}`);
    return project;
  }

  async findAll(query: QueryProjectDto) {
    const { page, pageSize, name, status } = query;

    const where = {
      ...(name && { name: { contains: name } }),
      ...(status !== undefined && { status }),
    };

    const [records, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { created_at: "desc" },
      }),
      this.prisma.project.count({ where }),
    ]);

    return {
      records,
      total,
      page,
      pageSize,
    };
  }

  async findOne(id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
    });

    if (!project) {
      throw new NotFoundException("项目不存在");
    }

    return project;
  }

  // 省略 update, remove 等标准 CRUD 方法...
}
```

## 共享常量 (`@thesis/shared`)

`packages/shared` 提供前后端共用的常量和类型定义，通过 `@thesis/shared` 引入。

### 共享契约复用规范

如果某个对象已经在 `@thesis/shared` 中定义为正式产品级契约（例如 type、zod schema、runtime helper），消费侧必须直接复用它，而不是再手写一份等价结构。

适用要求：

- server DTO / service / web form 可以在正式契约外补充各自层的包装与约束
- 但不得再次定义一份产品级字段结构真相
- 不得用 `as unknown as` 之类桥接方式掩盖 shared 导出或构建问题；shared 有问题时先修 shared

判断标准：

- 如果删掉本地结构后，正式字段边界仍能只从 shared 读出来，则本地结构是包装层
- 如果本地结构自己决定了字段层级、字段存在性或产品边界，它就已经越界成第二份契约

### 已有常量

| 导出                        | 用途                                                  |
| --------------------------- | ----------------------------------------------------- |
| `DictKey`                   | 字典键名常量 (`DOCUMENT_PRIORITY` 等, 蛇形命名)       |
| `SystemConfigKey`           | 系统配置键名常量 (`AI_DEFAULT_MODEL` 等)              |
| `SYSTEM_CONFIG_DEFINITIONS` | 配置元信息 (默认值、分组、描述), 种子数据直接遍历写入 |
| `SYSTEM_CONFIG_DEFAULTS`    | 按 key 索引的默认值映射                               |

### 系统配置使用规范

系统配置的键名、默认值、分组等元信息统一定义在 `@thesis/shared` 中，种子数据和 Service 共同引用，禁止硬编码 configKey 字符串。

```typescript
import { SystemConfigKey } from "@thesis/shared";

// 获取字符串配置
const model = await this.systemConfigService.getValue(
  SystemConfigKey.AI_DEFAULT_MODEL,
);

// 获取数值配置
const retries = await this.systemConfigService.getNumber(
  SystemConfigKey.WORKFLOW_DEFAULT_MAX_RETRIES,
);
```

`getValue` / `getNumber` 在 DB 无数据时自动 fallback 到 shared 中定义的默认值，调用方无需自行处理缺失情况。

### 新增共享常量的步骤

1. 在 `packages/shared/src/constants/` 下新增或修改对应文件
2. 确保 `constants/index.ts` 导出新模块
3. 后端和前端通过 `@thesis/shared` 引入

## BullMQ 队列规范

- Job Data 必须用 Zod Schema 定义并验证
- Queue 名使用 SCREAMING_SNAKE_CASE（如 `PAPER_GENERATION`、`REFERENCE_CHECK`）
- Processor 与 Queue 定义放在同一模块目录的 `queues/` 子目录下

```typescript
// queues/paper-generation.queue.ts
import { z } from "zod";

export const PAPER_GENERATION_QUEUE = "PAPER_GENERATION";

export const PaperGenerationJobSchema = z.object({
  projectId: z.string().uuid(),
  userId: z.string().uuid(),
  templateId: z.string().uuid().optional(),
});
export type PaperGenerationJobData = z.infer<
  typeof PaperGenerationJobSchema
>;

// queues/paper-generation.processor.ts
import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";
import {
  PAPER_GENERATION_QUEUE,
  PaperGenerationJobSchema,
  PaperGenerationJobData,
} from "./paper-generation.queue";

@Processor(PAPER_GENERATION_QUEUE)
export class PaperGenerationProcessor extends WorkerHost {
  async process(job: Job<PaperGenerationJobData>) {
    const data = PaperGenerationJobSchema.parse(job.data);
    // ...
  }
}
```

## Socket.IO 规范

- Gateway 使用 `@WebSocketGateway` 装饰器
- 事件名使用 kebab-case（如 `paper-progress`、`generation-complete`）
- 所有 WebSocket 连接必须通过 JWT 认证（实现 `WsAuthGuard`）

```typescript
@WebSocketGateway({ namespace: "/paper", cors: true })
@UseGuards(WsAuthGuard)
export class PaperGateway {
  @SubscribeMessage("subscribe-progress")
  handleSubscribe(client: Socket, payload: { projectId: string }) {
    client.join(`project:${payload.projectId}`);
  }

  // 从 Service 中发送事件
  notifyProgress(projectId: string, progress: number) {
    this.server
      .to(`project:${projectId}`)
      .emit("paper-progress", { progress });
  }
}
```

> 代码质量检查标准（类型安全、代码结构、DTO 规范、架构边界等）详见 [后端代码质量规则](../quality/backend.md)。

## 常用导入汇总

```typescript
import { SystemConfigKey, DictKey, UserType } from "@thesis/shared";
import {
  User,
  Prisma,
  PrismaService,
  CommonFields,
  CommonQueryFields,
  createQuerySchema,
} from "@/common";
import { UserService, RedisService, LoggerService } from "@/modules/common";
import {
  createPaginatedResponseSchema,
  SuccessResponseDto,
} from "@/modules/common/dto/response.dto";
import {
  CurrentUser,
  Permissions,
  PermissionsOr,
  Permission,
  NeedLogin,
} from "@/modules/auth";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { InjectQueue, Processor, WorkerHost } from "@nestjs/bullmq";
import { Queue, Job } from "bullmq";
import {
  WebSocketGateway,
  SubscribeMessage,
  WebSocketServer,
} from "@nestjs/websockets";
```
