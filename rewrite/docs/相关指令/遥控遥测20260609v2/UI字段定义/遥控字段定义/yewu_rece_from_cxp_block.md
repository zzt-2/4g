# yewu_rece_from_cxp_block 遥控 UI 字段定义

- module_id：`4'h5`
- 来源：`指令与状态/遥控指令清单/yewu_rece_from_cxp_block.md`、`指令与状态/遥控指令具体执行/yewu_rece_from_cxp_block.md`
- word 列表示遥控 payload 数据字索引；`-` 表示该命令无 payload。

## BIZ_RX_CMD_GROUP_MAP_C

| 参数原始字段名          | UI显示名称       | word | 索引位宽  | 有符号/无符号 | UI类型   | 参数表格索引                                                                                        |
| ----------------------- | ---------------- | ---- | --------- | ------------- | -------- | --------------------------------------------------------------------------------------------------- |
| `BIZ_RX_PARAM_ENABLE_C` | 业务接收使能配置 | `0`  | `word[0]` | 无符号数      | 使能开关 | [UI_BIZ_RX_CMD_GROUP_MAP_C_BIZ_RX_PARAM_ENABLE_C](#ui_biz_rx_cmd_group_map_c_biz_rx_param_enable_c) |

## BIZ_RX_CMD_GROUP_PULSE_CLEAR_C

| 参数原始字段名               | UI显示名称 | word | 索引位宽     | 有符号/无符号 | UI类型   | 参数表格索引                                                                                                                  |
| ---------------------------- | ---------- | ---- | ------------ | ------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `BIZ_RX_PARAM_COUNT_CLEAR_C` | 计数复位   | `-`  | `无 payload` | 无符号数      | 触发按钮 | [UI_BIZ_RX_CMD_GROUP_PULSE_CLEAR_C_BIZ_RX_PARAM_COUNT_CLEAR_C](#ui_biz_rx_cmd_group_pulse_clear_c_biz_rx_param_count_clear_c) |

## BIZ_RX_CMD_GROUP_PULSE_RESET_C

| 参数原始字段名         | UI显示名称   | word | 索引位宽     | 有符号/无符号 | UI类型   | 参数表格索引                                                                                                      |
| ---------------------- | ------------ | ---- | ------------ | ------------- | -------- | ----------------------------------------------------------------------------------------------------------------- |
| `BIZ_RX_PARAM_RESET_C` | 业务接收复位 | `-`  | `无 payload` | 无符号数      | 触发按钮 | [UI_BIZ_RX_CMD_GROUP_PULSE_RESET_C_BIZ_RX_PARAM_RESET_C](#ui_biz_rx_cmd_group_pulse_reset_c_biz_rx_param_reset_c) |

## 参数表格

### UI_BIZ_RX_CMD_GROUP_MAP_C_BIZ_RX_PARAM_ENABLE_C

- 原始字段：`BIZ_RX_PARAM_ENABLE_C`
- UI名称：业务接收使能配置
- UI类型：使能开关
- 数据宽度：`1 bit`

| UI字段/选项 | 协议写入值 | 说明                       |
| ----------- | ---------- | -------------------------- |
| 关闭/禁用   | `1'b0`     | 业务接收使能配置关闭或禁用 |
| 开启/使能   | `1'b1`     | 业务接收使能配置开启或使能 |

### UI_BIZ_RX_CMD_GROUP_PULSE_CLEAR_C_BIZ_RX_PARAM_COUNT_CLEAR_C

- 原始字段：`BIZ_RX_PARAM_COUNT_CLEAR_C`
- UI名称：计数复位
- UI类型：触发按钮
- 数据宽度：`0 bit`

| UI字段/选项 | 协议写入值   | 说明                                             |
| ----------- | ------------ | ------------------------------------------------ |
| 点击        | `无 payload` | 发送该 group，RTL 产生脉冲；软件不要保持开关状态 |

### UI_BIZ_RX_CMD_GROUP_PULSE_RESET_C_BIZ_RX_PARAM_RESET_C

- 原始字段：`BIZ_RX_PARAM_RESET_C`
- UI名称：业务接收复位
- UI类型：触发按钮
- 数据宽度：`0 bit`

| UI字段/选项 | 协议写入值   | 说明                                             |
| ----------- | ------------ | ------------------------------------------------ |
| 点击        | `无 payload` | 发送该 group，RTL 产生脉冲；软件不要保持开关状态 |
