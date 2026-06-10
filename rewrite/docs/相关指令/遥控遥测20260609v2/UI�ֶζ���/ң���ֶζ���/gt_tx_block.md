# gt_tx_block 遥控 UI 字段定义

- module_id：`4'h2`
- 来源：`指令与状态/遥控指令清单/gt_tx_block.md`、`指令与状态/遥控指令具体执行/gt_tx_block.md`
- word 列表示遥控 payload 数据字索引；`-` 表示该命令无 payload。

## GT_TX_CMD_GROUP_PULSE_RESET_C

| 参数原始字段名        | UI显示名称 | word | 索引位宽     | 有符号/无符号 | UI类型   | 参数表格索引                                                                                                  |
| --------------------- | ---------- | ---- | ------------ | ------------- | -------- | ------------------------------------------------------------------------------------------------------------- |
| `GT_TX_PARAM_RESET_C` | gt复位     | `-`  | `无 payload` | 无符号数      | 触发按钮 | [UI_GT_TX_CMD_GROUP_PULSE_RESET_C_GT_TX_PARAM_RESET_C](#ui_gt_tx_cmd_group_pulse_reset_c_gt_tx_param_reset_c) |

## 参数表格

### UI_GT_TX_CMD_GROUP_PULSE_RESET_C_GT_TX_PARAM_RESET_C

- 原始字段：`GT_TX_PARAM_RESET_C`
- UI名称：gt复位
- UI类型：触发按钮
- 数据宽度：`0 bit`

| UI字段/选项 | 协议写入值   | 说明                                             |
| ----------- | ------------ | ------------------------------------------------ |
| 点击        | `无 payload` | 发送该 group，RTL 产生脉冲；软件不要保持开关状态 |
