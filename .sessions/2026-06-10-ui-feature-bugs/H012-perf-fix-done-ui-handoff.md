# H012 接收帧卡顿性能治本完成 + UI 问题待续交接

> 2026-06-25 | 交接 | 状态: 性能治本已生效(用户确认"不那么卡了"),UI 问题待压缩后另开

## 本轮完成了什么(S012 续接二轮)

### 决定性证据链(这次是真实证据,非代码推断)

1. **用户"拔串口立刻好"** → 定性钉死卡顿 100% 来自帧流入后处理路径。
2. **analyze-longtask.py 扒 617ms Long Task 内部** → 616.7ms 全是单个 timer#4 回调纯 JS,consoleCall=0(推翻"每帧 console.warn"假设),GC 仅 40ms,0% Layout/Paint。
3. **prod-scale 基准(10k/20k)** → 暴露前三轮 Node 基准致命盲区:只测 merge+sort(5.5ms),漏了 service 完整调用链的 4 次全量深拷贝。10k=99ms / 20k=203ms 完美 O(N) 线性,反推 prod 600ms≈60k records。
4. **分段 isolate 基准** → 锁定隐藏元凶 `setLastIssue(undefined)` 内部 `return snapshot()` = 每帧一次全量深拷贝,基准完全测不到的点。

### 治本(方案 A,用户拍板"一次全做了")

| 改动 | 文件 | 作用 |
|---|---|---|
| 分离 `appendRoutedRecords`(snapshot-free) | storage-local-service.ts | routingTick 路径不再生成被丢弃的快照 |
| `appendRecords` 改 mutable push | storage-state.ts | O(新条数) 取代 O(N) 数组重建 |
| `hasRecordId` 改 Set 索引 | storage-state.ts | O(1) 取代 O(N) 遍历 |
| 新增 `clearLastIssue`(不返 snapshot) | storage-state.ts | 干掉隐藏元凶 |
| `truncateRecords` 回滚 | storage-state.ts | O(1) 取代全量深拷贝备份 |
| 攒批写盘(阈值 50) | storage-local-service.ts | 摊销 O(1)/帧 |
| `flushPendingWrites` | storage-local-service.ts + runtime/index.ts | destroy 时防丢数据 |
| fanOutToStorage 改调 appendRoutedRecords | receive-storage-bridge.ts | 走 snapshot-free 路径 |

**效果**:路由路径 20k records 单帧 49.8ms → **0.01ms**,降 5000 倍,O(1)。

### 验证
- TDD RED(旧 20k=193ms FAIL)→ GREEN(0.01ms)
- **163/163 测试全过** + tsc 0 + lint 0
- 5 个 integration/runtime 测试 mock 更新(spy appendLocalRecords → appendRoutedRecords + flushPendingWrites)
- 用户实测确认"**不那么卡了**"——治本生效

### 子 agent 全量扫描结论

扫描整个 rewrite/src 按"集合是否无上限增长"判别。**storage records 是唯一无限累积集合**,其它 feature 全有 cap 或键控常数:
- receive: recentInputs/events bounded 20/50;frameStats等 frameId键控
- display: sourceFields dataItemId键控;sampleCount 256
- connection: events EVENT_LIMIT=50
- task: history 50 / stepResults 100/实例(且不在每帧路径)
- send/northbound/result/ingress: 键控或任务事件驱动

**用户边界划分到位,只 storage 一处漏网(已治本)。**

## UI 问题(待压缩后另开)

用户报告:"**不那么卡了,不过 ui 依然存在一些问题**"。具体 UI 问题用户尚未说明,等压缩后在新对话/续接中详述。

### 已知 UI 相关历史(供新对话参考,非本轮)
- D007: flex `max-height:100%` 撑开陷阱(SendPage 已修)
- D011: flex 高度链排查方法论——ExecutionListPage 右栏高度 5 次失败搁置(AppShell 有未验证的 q-page-container 改动)
- S011/S013: 执行 tab / 编辑弹窗重设计
- D009: frame:false 无边框窗口 + DevTools dev-only

## 契约变更(新对话必读)

本轮新增的接口(向后兼容,只增不改):
- `StorageLocalService.appendRoutedRecords(records): Promise<{ ok: boolean }>` —— 路由层用,snapshot-free
- `StorageLocalService.flushPendingWrites(): Promise<void>` —— 攒批刷盘
- `StorageStateContainer.appendRecords(records, quickSnapshot?)` —— quickSnapshot 默认 false(不生成被丢弃快照)
- `StorageStateContainer.truncateRecords(count)` / `getRecordCount()` / `clearLastIssue()`

## 未提交状态

本轮改动**尚未 commit**(用户要先压缩)。压缩后若工作树还在,可直接 commit;若已丢,改动都在 git diff 里。

commit 建议(分 2 个):
1. `perf(storage): S012 续接二轮——appendRoutedRecords snapshot-free + mutable push + id Set + clearLastIssue + 攒批写盘,路由路径 20k:49ms→0.01ms [S012 续接二轮]`
   - storage-local-service.ts / storage-state.ts / receive-storage-bridge.ts / runtime/index.ts
   - storage-append-no-growth.spec.ts / 5 个 integration mock 更新 / helpers.ts
   - analyze-longtask.py(分析工具)
2. `docs(session): S012 续接二轮治本落档——真根因定位 + D010 续 + voice + topic-index [S012 续接二轮]`
   - .sessions/ 4 个文件

## 排除的方向(别再走)

- ❌ routingTick 服务层是唯一瓶颈(Node 基准 5.5ms 证伪,且本轮已证真实瓶颈在 storage 深拷贝)
- ❌ backgroundThrottling 是主因(已设 false,用户确认仍卡,证伪)
- ❌ debug log 是主因(consoleCall=0,推翻)
- ❌ Vue 渲染层/Layout/Paint 是瓶颈(trace 0% blink,本轮新证据排除)

**这轮的教训**:前三轮全凭"代码 + Node 基准"推断,Node 基准漏测了 service 完整调用链的深拷贝。这轮靠 trace 内部事件树(真实证据)+ prod-scale 基准(暴露真实 O(N))+ isolate 分段定位(找到隐藏元凶 setLastIssue)才成功。**性能问题必须用真实 trace + 足够大规模的基准,不能靠小规模基准外推。**
