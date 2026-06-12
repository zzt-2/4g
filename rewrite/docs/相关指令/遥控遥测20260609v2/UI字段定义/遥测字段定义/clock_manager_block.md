# clock_manager_block 遥测 UI 字段定义

- 来源：`import/rtl_source/clock_manager_block/vars/*_ctrl_pkg.sv` 和 `指令与状态/遥测指令清单/clock_manager_block.md`
- word 列表示遥测 payload 数据字索引，不包含 RS422 帧头、长度字、应用层头和 checksum。
- 对于 64bit/192bit 这类跨 word 字段，表中会按每个 32bit 分片列出，软件按字段切片说明重组。

## TM_GROUP_RUNTIME_C

- group_id：`8'h80`

| 参数原始字段名 | UI显示名称 | word | 索引位宽 | 有符号/无符号 | UI类型 | 参数表格索引 |
| --- | --- | --- | --- | --- | --- | --- |
| `clock_lock_status[2]` | lmk100M锁定 | `0` | `word[2]` | 无符号数 | 显示 | [UI_TM_GROUP_RUNTIME_C_CLOCK_LOCK_STATUS_2](#ui_tm_group_runtime_c_clock_lock_status_2) |
| `clock_lock_status[1]` | adc数据时钟锁定 | `0` | `word[1]` | 无符号数 | 显示 | [UI_TM_GROUP_RUNTIME_C_CLOCK_LOCK_STATUS_1](#ui_tm_group_runtime_c_clock_lock_status_1) |
| `clock_lock_status[0]` | adc核时钟锁定 | `0` | `word[0]` | 无符号数 | 显示 | [UI_TM_GROUP_RUNTIME_C_CLOCK_LOCK_STATUS_0](#ui_tm_group_runtime_c_clock_lock_status_0) |

## TM_GROUP_CFG_C

- group_id：`8'h81`

| 参数原始字段名 | UI显示名称 | word | 索引位宽 | 有符号/无符号 | UI类型 | 参数表格索引 |
| --- | --- | --- | --- | --- | --- | --- |
| `pps_source_sel` | PPS 来源选择 | `0` | `word[0]` | 无符号数 | 显示 | [UI_TM_GROUP_CFG_C_PPS_SOURCE_SEL](#ui_tm_group_cfg_c_pps_source_sel) |
| `ref_source_sel` | 参考时钟来源选择 | `1` | `word[0]` | 无符号数 | 显示 | [UI_TM_GROUP_CFG_C_REF_SOURCE_SEL](#ui_tm_group_cfg_c_ref_source_sel) |

## 参数表格

### UI_TM_GROUP_RUNTIME_C_CLOCK_LOCK_STATUS_2

- 原始字段：`clock_lock_status[2]`
- UI名称：lmk100M锁定
- 显示类型：锁定状态
- 截取位置：`word[2]`
- 数据宽度：`1 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `0` | 未锁定 | 锁定类状态位为 0 |
| `1` | 锁定 | 锁定类状态位为 1 |

### UI_TM_GROUP_RUNTIME_C_CLOCK_LOCK_STATUS_1

- 原始字段：`clock_lock_status[1]`
- UI名称：adc数据时钟锁定
- 显示类型：锁定状态
- 截取位置：`word[1]`
- 数据宽度：`1 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `0` | 未锁定 | 锁定类状态位为 0 |
| `1` | 锁定 | 锁定类状态位为 1 |

### UI_TM_GROUP_RUNTIME_C_CLOCK_LOCK_STATUS_0

- 原始字段：`clock_lock_status[0]`
- UI名称：adc核时钟锁定
- 显示类型：锁定状态
- 截取位置：`word[0]`
- 数据宽度：`1 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `0` | 未锁定 | 锁定类状态位为 0 |
| `1` | 锁定 | 锁定类状态位为 1 |

### UI_TM_GROUP_CFG_C_PPS_SOURCE_SEL

- 原始字段：`pps_source_sel`
- UI名称：PPS 来源选择
- 显示类型：来源选择
- 截取位置：`word[0]`
- 数据宽度：`1 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `0` | 内参考 | 使用内部参考 |
| `1` | 外参考 | 使用外部参考 |

### UI_TM_GROUP_CFG_C_REF_SOURCE_SEL

- 原始字段：`ref_source_sel`
- UI名称：参考时钟来源选择
- 显示类型：来源选择
- 截取位置：`word[0]`
- 数据宽度：`1 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `0` | 内参考 | 使用内部参考 |
| `1` | 外参考 | 使用外部参考 |
