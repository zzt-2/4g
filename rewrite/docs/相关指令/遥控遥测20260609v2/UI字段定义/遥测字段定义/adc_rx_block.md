# adc_rx_block 遥测 UI 字段定义

- 来源：`import/rtl_source/adc_rx_block/vars/*_ctrl_pkg.sv` 和 `指令与状态/遥测指令清单/adc_rx_block.md`
- word 列表示遥测 payload 数据字索引，不包含 RS422 帧头、长度字、应用层头和 checksum。
- 对于 64bit/192bit 这类跨 word 字段，表中会按每个 32bit 分片列出，软件按字段切片说明重组。

## TM_GROUP_RUNTIME_C

- group_id：`8'h80`

| 参数原始字段名 | UI显示名称 | word | 索引位宽 | 有符号/无符号 | UI类型 | 参数表格索引 |
| --- | --- | --- | --- | --- | --- | --- |
| `reset_status` | ADC 复位状态 | `0` | `word[0]` | 无符号数 | 显示 | [UI_TM_GROUP_RUNTIME_C_RESET_STATUS](#ui_tm_group_runtime_c_reset_status) |
| `power_good_status` | 时钟/电源正常状态 | `1` | `word[0]` | 无符号数 | 显示 | [UI_TM_GROUP_RUNTIME_C_POWER_GOOD_STATUS](#ui_tm_group_runtime_c_power_good_status) |
| `lmx_locked_status` | LMX 锁定状态 | `2` | `word[0]` | 无符号数 | 显示 | [UI_TM_GROUP_RUNTIME_C_LMX_LOCKED_STATUS](#ui_tm_group_runtime_c_lmx_locked_status) |
| `lmk_locked_status` | LMK 锁定状态 | `3` | `word[0]` | 无符号数 | 显示 | [UI_TM_GROUP_RUNTIME_C_LMK_LOCKED_STATUS](#ui_tm_group_runtime_c_lmk_locked_status) |
| `data_valid_status` | 数据有效状态 | `4` | `word[0]` | 无符号数 | 显示 | [UI_TM_GROUP_RUNTIME_C_DATA_VALID_STATUS](#ui_tm_group_runtime_c_data_valid_status) |
| `board_status[4]` | LMX1 | `5` | `word[4]` | 无符号数 | 显示 | [UI_TM_GROUP_RUNTIME_C_BOARD_STATUS_4](#ui_tm_group_runtime_c_board_status_4) |
| `board_status[3]` | LMK12 | `5` | `word[3]` | 无符号数 | 显示 | [UI_TM_GROUP_RUNTIME_C_BOARD_STATUS_3](#ui_tm_group_runtime_c_board_status_3) |
| `board_status[2]` | SPI完成 | `5` | `word[2]` | 无符号数 | 显示 | [UI_TM_GROUP_RUNTIME_C_BOARD_STATUS_2](#ui_tm_group_runtime_c_board_status_2) |
| `board_status[1]` | 采样有效 | `5` | `word[1]` | 无符号数 | 显示 | [UI_TM_GROUP_RUNTIME_C_BOARD_STATUS_1](#ui_tm_group_runtime_c_board_status_1) |
| `board_status[0]` | ADC上电 | `5` | `word[0]` | 无符号数 | 显示 | [UI_TM_GROUP_RUNTIME_C_BOARD_STATUS_0](#ui_tm_group_runtime_c_board_status_0) |
| `rx_power_value` | 接收功率测量值 | `6` | `word[31:0]` | 无符号数 | 显示 | [UI_TM_GROUP_RUNTIME_C_RX_POWER_VALUE](#ui_tm_group_runtime_c_rx_power_value) |

## TM_GROUP_CFG_C

- group_id：`8'h81`

| 参数原始字段名 | UI显示名称 | word | 索引位宽 | 有符号/无符号 | UI类型 | 参数表格索引 |
| --- | --- | --- | --- | --- | --- | --- |
| `cal_loop_enable` | ADC 校准环路使能配置 | `0` | `word[0]` | 无符号数 | 显示 | [UI_TM_GROUP_CFG_C_CAL_LOOP_ENABLE](#ui_tm_group_cfg_c_cal_loop_enable) |

## 参数表格

### UI_TM_GROUP_RUNTIME_C_RESET_STATUS

- 原始字段：`reset_status`
- UI名称：ADC 复位状态
- 显示类型：复位状态
- 截取位置：`word[0]`
- 数据宽度：`1 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `0` | 空闲 | 未处于复位请求/忙状态 |
| `1` | 复位中/已接受 | 复位请求已接受或复位忙 |

### UI_TM_GROUP_RUNTIME_C_POWER_GOOD_STATUS

- 原始字段：`power_good_status`
- UI名称：时钟/电源正常状态
- 显示类型：正常状态
- 截取位置：`word[0]`
- 数据宽度：`1 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `0` | 异常 | 正常/电源好状态位为 0 |
| `1` | 正常 | 正常/电源好状态位为 1 |

### UI_TM_GROUP_RUNTIME_C_LMX_LOCKED_STATUS

- 原始字段：`lmx_locked_status`
- UI名称：LMX 锁定状态
- 显示类型：锁定状态
- 截取位置：`word[0]`
- 数据宽度：`1 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `0` | 未锁定 | 锁定类状态位为 0 |
| `1` | 锁定 | 锁定类状态位为 1 |

### UI_TM_GROUP_RUNTIME_C_LMK_LOCKED_STATUS

- 原始字段：`lmk_locked_status`
- UI名称：LMK 锁定状态
- 显示类型：锁定状态
- 截取位置：`word[0]`
- 数据宽度：`1 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `0` | 未锁定 | 锁定类状态位为 0 |
| `1` | 锁定 | 锁定类状态位为 1 |

### UI_TM_GROUP_RUNTIME_C_DATA_VALID_STATUS

- 原始字段：`data_valid_status`
- UI名称：数据有效状态
- 显示类型：有效状态
- 截取位置：`word[0]`
- 数据宽度：`1 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `0` | 无效 | 有效状态位为 0 |
| `1` | 有效 | 有效状态位为 1 |

### UI_TM_GROUP_RUNTIME_C_BOARD_STATUS_4

- 原始字段：`board_status[4]`
- UI名称：LMX1
- 显示类型：就绪状态
- 截取位置：`word[4]`
- 数据宽度：`1 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `0` | 未就绪 | LMX1 状态位为 0 |
| `1` | 就绪 | LMX1 状态位为 1 |

### UI_TM_GROUP_RUNTIME_C_BOARD_STATUS_3

- 原始字段：`board_status[3]`
- UI名称：LMK12
- 显示类型：就绪状态
- 截取位置：`word[3]`
- 数据宽度：`1 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `0` | 未就绪 | LMK12 状态位为 0 |
| `1` | 就绪 | LMK12 状态位为 1 |

### UI_TM_GROUP_RUNTIME_C_BOARD_STATUS_2

- 原始字段：`board_status[2]`
- UI名称：SPI完成
- 显示类型：完成状态
- 截取位置：`word[2]`
- 数据宽度：`1 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `0` | 未完成 | 完成状态位为 0 |
| `1` | 完成 | 完成状态位为 1 |

### UI_TM_GROUP_RUNTIME_C_BOARD_STATUS_1

- 原始字段：`board_status[1]`
- UI名称：采样有效
- 显示类型：有效状态
- 截取位置：`word[1]`
- 数据宽度：`1 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `0` | 无效 | 有效状态位为 0 |
| `1` | 有效 | 有效状态位为 1 |

### UI_TM_GROUP_RUNTIME_C_BOARD_STATUS_0

- 原始字段：`board_status[0]`
- UI名称：ADC上电
- 显示类型：上电状态
- 截取位置：`word[0]`
- 数据宽度：`1 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `0` | 未上电 | 上电状态位为 0 |
| `1` | 已上电 | 上电状态位为 1 |

### UI_TM_GROUP_RUNTIME_C_RX_POWER_VALUE

- 原始字段：`rx_power_value`
- UI名称：接收功率测量值
- 显示类型：数值显示
- 截取位置：`word[31:0]`
- 数据宽度：`32 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `原始值` | 32 bit 无符号数 | 按无符号十进制显示 |

### UI_TM_GROUP_CFG_C_CAL_LOOP_ENABLE

- 原始字段：`cal_loop_enable`
- UI名称：ADC 校准环路使能配置
- 显示类型：使能状态
- 截取位置：`word[0]`
- 数据宽度：`1 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `0` | 未使能 | ADC 校准环路未使能 |
| `1` | 使能 | ADC 校准环路使能 |
