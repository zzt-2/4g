# 任务进度

[2025-01-15_15:30:00]

- 已修改：
  - src/types/frames/sendInstances.ts: 重新定义InstanceStrategyConfig和相关类型
  - src/types/frames/sendInstanceFactories.ts: 添加默认strategyConfig字段
  - src/stores/frames/sendFrameInstancesStore.ts: 添加多帧策略配置管理
  - src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue: 重构为使用实例配置
  - src/components/frames/FrameSend/TriggerSend/TriggerSendDialog.vue: 重构为独立配置界面
- 更改：核心架构重构已完成，实现了单帧实例和多帧的策略配置分离管理
- 原因：解决所有帧实例共享同一配置的问题，实现每个实例独立配置
- 阻碍因素：需要更新其他相关组件以使用新的配置结构
- 状态：待确认

[2025-01-15_16:00:00]

- 已修改：
  - src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue: 修复selectedTargetId共享问题
  - src/components/frames/FrameSend/TriggerSend/TriggerSendDialog.vue: 修复selectedTargetId共享问题
- 更改：
  1. 使用instanceId作为useConnectionTargets的storage key一部分，确保每个实例有独立的目标选择
  2. 修复watchEffect监听问题，明确监听props.instanceId变化以确保实例切换时重新同步配置
  3. 添加默认配置逻辑，当实例没有配置时使用合理的默认值
- 原因：解决用户反馈的不同实例共享selectedTargetId的问题
- 阻碍因素：无
- 状态：待确认

[2025-01-15_16:15:00]

- 已修改：
  - src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue: 重构useConnectionTargets使用方式
  - src/components/frames/FrameSend/TriggerSend/TriggerSendDialog.vue: 重构useConnectionTargets使用方式
- 更改：
  1. **修复useConnectionTargets使用错误**：将useConnectionTargets从组件初始化移到watch中，确保instanceId变化时重新创建连接目标管理
  2. **watchEffect vs watch的区别**：
     - watchEffect: 自动追踪函数内使用的所有响应式依赖，依赖变化时自动执行
     - watch: 需要明确指定监听的数据源，更精确的控制，可以获取新旧值
  3. **选择watch的原因**：需要明确监听props.instanceId变化，并在变化时重新初始化连接目标管理
  4. **手动管理状态**：使用ref手动管理availableTargets和selectedTargetId，在watch中更新
- 原因：用户指出useConnectionTargets在组件初始化时就固定了storage key，instanceId变化时不会重新创建
- 阻碍因素：无
- 状态：待确认
