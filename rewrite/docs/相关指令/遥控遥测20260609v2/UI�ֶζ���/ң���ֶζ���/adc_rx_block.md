# adc_rx_block 遥控 UI 字段定义

- module_id：`4'h1`
- 来源：`指令与状态/遥控指令清单/adc_rx_block.md`、`指令与状态/遥控指令具体执行/adc_rx_block.md`
- word 列表示遥控 payload 数据字索引；`-` 表示该命令无 payload。

## ADC_RX_CMD_GROUP_MAP_C

| 参数原始字段名            | UI显示名称           | word | 索引位宽  | 有符号/无符号 | UI类型   | 参数表格索引                                                                                            |
| ------------------------- | -------------------- | ---- | --------- | ------------- | -------- | ------------------------------------------------------------------------------------------------------- |
| `ADC_RX_PARAM_CAL_LOOP_C` | ADC 校准环路使能配置 | `0`  | `word[0]` | 无符号数      | 使能开关 | [UI_ADC_RX_CMD_GROUP_MAP_C_ADC_RX_PARAM_CAL_LOOP_C](#ui_adc_rx_cmd_group_map_c_adc_rx_param_cal_loop_c) |

## ADC_RX_CMD_GROUP_PULSE_RESET_C

| 参数原始字段名         | UI显示名称 | word | 索引位宽     | 有符号/无符号 | UI类型   | 参数表格索引                                                                                                      |
| ---------------------- | ---------- | ---- | ------------ | ------------- | -------- | ----------------------------------------------------------------------------------------------------------------- |
| `ADC_RX_PARAM_RESET_C` | ADC复位    | `-`  | `无 payload` | 无符号数      | 触发按钮 | [UI_ADC_RX_CMD_GROUP_PULSE_RESET_C_ADC_RX_PARAM_RESET_C](#ui_adc_rx_cmd_group_pulse_reset_c_adc_rx_param_reset_c) |

## 参数表格

### UI_ADC_RX_CMD_GROUP_MAP_C_ADC_RX_PARAM_CAL_LOOP_C

- 原始字段：`ADC_RX_PARAM_CAL_LOOP_C`
- UI名称：ADC 校准环路使能配置
- UI类型：使能开关
- 数据宽度：`1 bit`

| UI字段/选项 | 协议写入值 | 说明                     |
| ----------- | ---------- | ------------------------ |
| 关闭        | `1'b0`     | ADC 校准环路使能配置关闭 |
| 开启        | `1'b1`     | ADC 校准环路使能配置开启 |

### UI_ADC_RX_CMD_GROUP_PULSE_RESET_C_ADC_RX_PARAM_RESET_C

- 原始字段：`ADC_RX_PARAM_RESET_C`
- UI名称：ADC复位
- UI类型：触发按钮
- 数据宽度：`0 bit`

| UI字段/选项 | 协议写入值   | 说明                                             |
| ----------- | ------------ | ------------------------------------------------ |
| 点击        | `无 payload` | 发送该 group，RTL 产生脉冲；软件不要保持开关状态 |
