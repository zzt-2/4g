# clock_manager_block 遥控 UI 字段定义

- module_id：`4'h0`
- 来源：`指令与状态/遥控指令清单/clock_manager_block.md`、`指令与状态/遥控指令具体执行/clock_manager_block.md`
- word 列表示遥控 payload 数据字索引；`-` 表示该命令无 payload。

## CLOCK_MANAGER_CMD_GROUP_MAP_C

| 参数原始字段名 | UI显示名称 | word | 索引位宽 | 有符号/无符号 | UI类型 | 参数表格索引 |
| --- | --- | --- | --- | --- | --- | --- |
| `CLOCK_MANAGER_PARAM_PPS_SRC_C` | PPS 来源选择 | `0` | `word[0]` | 无符号数 | 下拉栏 | [UI_CLOCK_MANAGER_CMD_GROUP_MAP_C_CLOCK_MANAGER_PARAM_PPS_SRC_C](#ui_clock_manager_cmd_group_map_c_clock_manager_param_pps_src_c) |
| `CLOCK_MANAGER_PARAM_REF_SRC_C` | 参考时钟来源选择 | `1` | `word[0]` | 无符号数 | 下拉栏 | [UI_CLOCK_MANAGER_CMD_GROUP_MAP_C_CLOCK_MANAGER_PARAM_REF_SRC_C](#ui_clock_manager_cmd_group_map_c_clock_manager_param_ref_src_c) |

## 参数表格

### UI_CLOCK_MANAGER_CMD_GROUP_MAP_C_CLOCK_MANAGER_PARAM_PPS_SRC_C

- 原始字段：`CLOCK_MANAGER_PARAM_PPS_SRC_C`
- UI名称：PPS 来源选择
- UI类型：下拉栏
- 数据宽度：`1 bit`

| UI字段/选项 | 协议写入值 | 说明 |
| --- | --- | --- |
| 内参考 | `1'b0` | 使用内部参考 |
| 外参考 | `1'b1` | 使用外部参考 |

### UI_CLOCK_MANAGER_CMD_GROUP_MAP_C_CLOCK_MANAGER_PARAM_REF_SRC_C

- 原始字段：`CLOCK_MANAGER_PARAM_REF_SRC_C`
- UI名称：参考时钟来源选择
- UI类型：下拉栏
- 数据宽度：`1 bit`

| UI字段/选项 | 协议写入值 | 说明 |
| --- | --- | --- |
| 内参考 | `1'b0` | 使用内部参考 |
| 外参考 | `1'b1` | 使用外部参考 |
