---
doc_type: learning
track: knowledge
date: 2026-05-06
slug: cross-feature-di-via-ports-and-core-input-types
component: rewrite/features/*
tags:
  - rewrite
  - architecture
  - testing
  - dependency-injection
  - feature-boundary
---

# 跨 feature 依赖注入：port 接口 + core 独立输入类型

## 背景

send feature 需要消费 frame（读帧定义）和 connection（解析 target、写字节）的公开能力。但 core 层必须保持纯 TypeScript，不依赖任何 feature 的类型或运行时。之前的 connection 和 frame feature 没有这个问题——它们是被消费方，自身不依赖其他 feature。

send 是第一个"需要主动消费两个上游 feature"的实现案例。实现过程中需要解决两个问题：

1. service 层怎么在测试和生产中切换上游依赖？
2. core 层怎么处理来自 frame 的字段定义，却不 import frame 类型？

## 指导原则

### 1. 在 adapters/ports.ts 定义 port 接口

服务层依赖的上游能力抽象为接口，放在 `features/{name}/adapters/ports.ts`：

```typescript
// send/adapters/ports.ts
export interface SendFrameReader {
  getFrame(frameId: string): ReadonlyFrameAsset | undefined;
}

export interface SendTargetResolver {
  resolveTarget(targetId: string): TransportTargetSnapshot | undefined;
}

export interface SendTransportWriter {
  writeBytes(connectionId: string, bytes: readonly number[]): Promise<SendTransportWriteOutcome>;
}
```

port 接口可以引用上游 feature 的 **公开 API 类型**（如 ReadonlyFrameAsset、TransportTargetSnapshot），但不能引用 internal subpath。port 文件本身在 adapters/ 目录，不在 core/。

### 2. core 层定义独立编码输入类型

core/ 不 import 其他 feature 的类型。需要来自上游的数据时，定义 feature 自己的输入类型：

```typescript
// send/core/types.ts
export interface SendFieldEncodingDef {
  readonly id: string;
  readonly dataType: string;    // 不引用 FrameDataType，用 string
  readonly length: number;
  readonly bigEndian: boolean;
  readonly isASCII: boolean;
  readonly offset: number;
}

export interface SendBuildInput {
  readonly fields: readonly SendFieldEncodingDef[];
  readonly totalByteLength: number;
  readonly fieldValues: Readonly<Record<string, SendFieldValue>>;
}
```

service 层负责翻译：`ReadonlyFrameAsset` → `SendFieldEncodingDef[]` → `SendBuildInput` → 传给 core 的 `buildFrame()`。

### 3. fake adapter 实现同一 port 接口

测试用的 fake adapter 实现 ports.ts 中定义的接口，提供预设数据和可控行为：

```typescript
// 测试：fake 实现 port 接口
const frameProvider = createFakeFrameProvider({ frames: sendFrameAssets });
const connectionWriter = createFakeConnectionWriter({ targets: [targetFixture] });

const service = createSendService({
  frameReader: frameProvider,
  targetResolver: connectionWriter,
  transportWriter: connectionWriter,
});
```

生产环境由 runtime 注入真实实现（frame reader 包装 FrameAssetReader，connection writer 包装 ConnectionService）。

### 4. service 通过构造函数/工厂参数注入

`createSendService(options)` 接收所有 port 接口实例。service 内部只通过接口方法调用，不直接 import 上游 feature 的 service/store/selector。

## 为什么重要

- **core 真正独立**：core/ 测试不需要任何 frame/connection fixture，只需要 SendBuildInput。测试更简单、更快。
- **边界可静态验证**：`rg` 扫描 core/ 无跨 feature import、无 vue/pinia/electron，一次通过。
- **fake 替换零成本**：测试用 fake adapter，生产用真实实现，service 代码完全相同。
- **类型安全但松耦合**：port 接口引用的是上游公开类型（不是 internal），编译期有类型检查，但 core 不感知。

## 何时适用

当一个 feature 需要消费一个或多个上游 feature 的读取/写入能力时：

- 需要读上游 feature 的 snapshot / reader → 定义 port 接口 + fake provider
- 需要调上游 feature 的 service 方法 → 定义 port 接口 + fake writer
- core 层需要来自上游的数据结构 → 定义独立输入类型，service 层翻译

不适用于：

- 上游 feature 不需要被消费（如 frame、connection 本身）
- 只需 import 上游的类型定义（如 `ReadonlyDeep`），不涉及运行时交互
- 两个 feature 交互通过 runtime 事件/编排，不直接依赖

## 示例

send feature 的完整分层：

```
send/
  core/types.ts          ← SendFieldEncodingDef、SendBuildInput（独立类型）
  core/encode.ts         ← buildFrame(input) 纯函数
  adapters/ports.ts      ← SendFrameReader、SendTargetResolver、SendTransportWriter
  adapters/fake-*.ts     ← 测试替身
  services/send-service  ← 翻译 frame→encoding def，注入 port，编排流程
  state/                 ← clone-on-read state container
  selectors/             ← 纯函数 selector
  index.ts               ← 公开 API（类型 + 工厂 + selector，无 mutable state）
```

boundary rg 检查全部一次性通过：
- `core/` 无 vue/pinia/electron/platform/node
- 无跨 feature internal subpath import
- index.ts 不导出 mutable state
