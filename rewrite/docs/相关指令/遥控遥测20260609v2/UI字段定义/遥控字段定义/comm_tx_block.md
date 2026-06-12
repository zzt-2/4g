# comm_tx_block 遥控 UI 字段定义

- module_id：`4'h7`
- 来源：`指令与状态/遥控指令清单/comm_tx_block.md`、`指令与状态/遥控指令具体执行/comm_tx_block.md`
- word 列表示遥控 payload 数据字索引；`-` 表示该命令无 payload。

## COMM_TX_CMD_GROUP_MAP_C

| 参数原始字段名                    | UI显示名称           | word | 索引位宽    | 有符号/无符号 | UI类型   | 参数表格索引                                                                                                              |
| --------------------------------- | -------------------- | ---- | ----------- | ------------- | -------- | ------------------------------------------------------------------------------------------------------------------------- |
| `COMM_TX_PARAM_RATE_C`            | 发送速率选择         | `0`  | `word[7:0]` | 无符号数      | 下拉栏   | [UI_COMM_TX_CMD_GROUP_MAP_C_COMM_TX_PARAM_RATE_C](#ui_comm_tx_cmd_group_map_c_comm_tx_param_rate_c)                       |
| `COMM_TX_PARAM_SCRAMBLE_C`        | 扰码使能             | `1`  | `word[0]`   | 无符号数      | 使能开关 | [UI_COMM_TX_CMD_GROUP_MAP_C_COMM_TX_PARAM_SCRAMBLE_C](#ui_comm_tx_cmd_group_map_c_comm_tx_param_scramble_c)               |
| `COMM_TX_PARAM_ENCODE_C`          | 编码类型选择         | `2`  | `word[0]`   | 无符号数      | 下拉栏   | [UI_COMM_TX_CMD_GROUP_MAP_C_COMM_TX_PARAM_ENCODE_C](#ui_comm_tx_cmd_group_map_c_comm_tx_param_encode_c)                   |
| `COMM_TX_PARAM_BER_INJECT_C`      | 误码注入模式         | `3`  | `word[3:0]` | 无符号数      | 下拉栏   | [UI_COMM_TX_CMD_GROUP_MAP_C_COMM_TX_PARAM_BER_INJECT_C](#ui_comm_tx_cmd_group_map_c_comm_tx_param_ber_inject_c)           |
| `COMM_TX_PARAM_CRC_ERROR_C`       | CRC 故障注入控制     | `4`  | `word[3:0]` | 无符号数      | 下拉栏   | [UI_COMM_TX_CMD_GROUP_MAP_C_COMM_TX_PARAM_CRC_ERROR_C](#ui_comm_tx_cmd_group_map_c_comm_tx_param_crc_error_c)             |
| `COMM_TX_PARAM_HEADER_ERROR_C`    | 帧头故障注入控制     | `5`  | `word[3:0]` | 无符号数      | 下拉栏   | [UI_COMM_TX_CMD_GROUP_MAP_C_COMM_TX_PARAM_HEADER_ERROR_C](#ui_comm_tx_cmd_group_map_c_comm_tx_param_header_error_c)       |
| `COMM_TX_PARAM_DATA_TYPE_ERROR_C` | 数据类型故障注入控制 | `6`  | `word[3:0]` | 无符号数      | 下拉栏   | [UI_COMM_TX_CMD_GROUP_MAP_C_COMM_TX_PARAM_DATA_TYPE_ERROR_C](#ui_comm_tx_cmd_group_map_c_comm_tx_param_data_type_error_c) |
| `COMM_TX_PARAM_FIELD_POS_ERROR_C` | 字段位置故障注入控制 | `7`  | `word[3:0]` | 无符号数      | 下拉栏   | [UI_COMM_TX_CMD_GROUP_MAP_C_COMM_TX_PARAM_FIELD_POS_ERROR_C](#ui_comm_tx_cmd_group_map_c_comm_tx_param_field_pos_error_c) |
| `COMM_TX_PARAM_ENCODE_ERROR_C`    | 编码故障注入控制     | `8`  | `word[3:0]` | 无符号数      | 下拉栏   | [UI_COMM_TX_CMD_GROUP_MAP_C_COMM_TX_PARAM_ENCODE_ERROR_C](#ui_comm_tx_cmd_group_map_c_comm_tx_param_encode_error_c)       |
| `COMM_TX_PARAM_DATA_LINK_BREAK_C` | 数据断链异常注入控制 | `9`  | `word[0]`   | 无符号数      | 使能开关 | [UI_COMM_TX_CMD_GROUP_MAP_C_COMM_TX_PARAM_DATA_LINK_BREAK_C](#ui_comm_tx_cmd_group_map_c_comm_tx_param_data_link_break_c) |

## COMM_TX_CMD_GROUP_PULSE_RESET_C

| 参数原始字段名          | UI显示名称 | word | 索引位宽     | 有符号/无符号 | UI类型   | 参数表格索引                                                                                                          |
| ----------------------- | ---------- | ---- | ------------ | ------------- | -------- | --------------------------------------------------------------------------------------------------------------------- |
| `COMM_TX_PARAM_RESET_C` | 发送复位   | `-`  | `无 payload` | 无符号数      | 触发按钮 | [UI_COMM_TX_CMD_GROUP_PULSE_RESET_C_COMM_TX_PARAM_RESET_C](#ui_comm_tx_cmd_group_pulse_reset_c_comm_tx_param_reset_c) |

## COMM_TX_CMD_GROUP_PULSE_CLEAR_C

| 参数原始字段名                | UI显示名称 | word | 索引位宽     | 有符号/无符号 | UI类型   | 参数表格索引                                                                                                                      |
| ----------------------------- | ---------- | ---- | ------------ | ------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `COMM_TX_PARAM_COUNT_CLEAR_C` | 计数复位   | `-`  | `无 payload` | 无符号数      | 触发按钮 | [UI_COMM_TX_CMD_GROUP_PULSE_CLEAR_C_COMM_TX_PARAM_COUNT_CLEAR_C](#ui_comm_tx_cmd_group_pulse_clear_c_comm_tx_param_count_clear_c) |

## 参数表格

### UI_COMM_TX_CMD_GROUP_MAP_C_COMM_TX_PARAM_RATE_C

- 原始字段：`COMM_TX_PARAM_RATE_C`
- UI名称：发送速率选择
- UI类型：下拉栏
- 数据宽度：`8 bit`

| UI字段/选项 | 协议写入值 | 说明                        |
| ----------- | ---------- | --------------------------- |
| 312M        | `8'h00`    | 速率选择 312M               |
| 625M        | `8'h01`    | 速率选择 625M               |
| 1.25G       | `8'h02`    | 速率选择 1.25G              |
| 2.5G        | `8'h03`    | 速率选择 2.5G               |
| 5G          | `8'h04`    | 速率选择 5G                 |
| OOK 20M     | `8'h80`    | OOK 调制，`rate_sel[7:5]=3'b100` |
| OOK 10M     | `8'hA0`    | OOK 调制，`rate_sel[7:5]=3'b101` |
| OOK 1M      | `8'hC0`    | OOK 调制，`rate_sel[7:5]=3'b110` |
| 其它        | `其它编码` | 保留/待确认，软件默认不提供 |

### UI_COMM_TX_CMD_GROUP_MAP_C_COMM_TX_PARAM_SCRAMBLE_C

- 原始字段：`COMM_TX_PARAM_SCRAMBLE_C`
- UI名称：扰码使能
- UI类型：使能开关
- 数据宽度：`1 bit`

| UI字段/选项 | 协议写入值 | 说明               |
| ----------- | ---------- | ------------------ |
| 关闭/禁用   | `1'b0`     | 扰码使能关闭或禁用 |
| 开启/使能   | `1'b1`     | 扰码使能开启或使能 |

### UI_COMM_TX_CMD_GROUP_MAP_C_COMM_TX_PARAM_ENCODE_C

- 原始字段：`COMM_TX_PARAM_ENCODE_C`
- UI名称：编码类型选择
- UI类型：下拉栏
- 数据宽度：`1 bit`

| UI字段/选项 | 协议写入值 | 说明                |
| ----------- | ---------- | ------------------- |
| RS          | `1'b0`     | 选择 RS 编码/译码   |
| LDPC        | `1'b1`     | 选择 LDPC 编码；需确认 LDPC DCP/source 绑定和 `LDPC_ENCODE_EN` 参数后实际生效 |

### UI_COMM_TX_CMD_GROUP_MAP_C_COMM_TX_PARAM_BER_INJECT_C

- 原始字段：`COMM_TX_PARAM_BER_INJECT_C`
- UI名称：误码注入模式
- UI类型：下拉栏
- 数据宽度：`4 bit`

| UI字段/选项 | 协议写入值     | 说明                   |
| ----------- | -------------- | ---------------------- |
| 不注入      | `4'd0`         | BER 注入模式：不注入   |
| 轻量误码    | `4'd1`         | BER 注入模式：轻量误码 |
| 重度误码    | `4'd2`         | BER 注入模式：重度误码 |
| 随机误码    | `4'd3`         | BER 注入模式：随机误码 |
| 保留        | `4'd4 ~ 4'd15` | 软件默认不提供         |

### UI_COMM_TX_CMD_GROUP_MAP_C_COMM_TX_PARAM_CRC_ERROR_C

- 原始字段：`COMM_TX_PARAM_CRC_ERROR_C`
- UI名称：CRC 故障注入控制
- UI类型：下拉栏
- 数据宽度：`4 bit`

| UI字段/选项 | 协议写入值 | 说明                                                        |
| ----------- | ---------- | ----------------------------------------------------------- |
| 不注入      | `4'd0`     | CRC 故障注入控制关闭                                        |
| 注入编码值  | `4'd1`     | 具体错误模式未在当前 RTL 注释中定义，软件需要二次确认后展开 |

### UI_COMM_TX_CMD_GROUP_MAP_C_COMM_TX_PARAM_HEADER_ERROR_C

- 原始字段：`COMM_TX_PARAM_HEADER_ERROR_C`
- UI名称：帧头故障注入控制
- UI类型：下拉栏
- 数据宽度：`4 bit`

| UI字段/选项 | 协议写入值 | 说明                                                        |
| ----------- | ---------- | ----------------------------------------------------------- |
| 不注入      | `4'd0`     | 帧头故障注入控制关闭                                        |
| 注入编码值  | `4'd1`     | 具体错误模式未在当前 RTL 注释中定义，软件需要二次确认后展开 |

### UI_COMM_TX_CMD_GROUP_MAP_C_COMM_TX_PARAM_DATA_TYPE_ERROR_C

- 原始字段：`COMM_TX_PARAM_DATA_TYPE_ERROR_C`
- UI名称：数据类型故障注入控制
- UI类型：下拉栏
- 数据宽度：`4 bit`

| UI字段/选项 | 协议写入值 | 说明                                                        |
| ----------- | ---------- | ----------------------------------------------------------- |
| 不注入      | `4'd0`     | 数据类型故障注入控制关闭                                    |
| 注入编码值  | `4'd1`     | 具体错误模式未在当前 RTL 注释中定义，软件需要二次确认后展开 |

### UI_COMM_TX_CMD_GROUP_MAP_C_COMM_TX_PARAM_FIELD_POS_ERROR_C

- 原始字段：`COMM_TX_PARAM_FIELD_POS_ERROR_C`
- UI名称：字段位置故障注入控制
- UI类型：下拉栏
- 数据宽度：`4 bit`

| UI字段/选项 | 协议写入值 | 说明                                                        |
| ----------- | ---------- | ----------------------------------------------------------- |
| 不注入      | `4'd0`     | 字段位置故障注入控制关闭                                    |
| 注入编码值  | `4'd1`     | 具体错误模式未在当前 RTL 注释中定义，软件需要二次确认后展开 |

### UI_COMM_TX_CMD_GROUP_MAP_C_COMM_TX_PARAM_ENCODE_ERROR_C

- 原始字段：`COMM_TX_PARAM_ENCODE_ERROR_C`
- UI名称：编码故障注入控制
- UI类型：下拉栏
- 数据宽度：`4 bit`

| UI字段/选项 | 协议写入值 | 说明                                                        |
| ----------- | ---------- | ----------------------------------------------------------- |
| 不注入      | `4'd0`     | 编码故障注入控制关闭                                        |
| 注入编码值  | `4'd1`     | 具体错误模式未在当前 RTL 注释中定义，软件需要二次确认后展开 |

### UI_COMM_TX_CMD_GROUP_MAP_C_COMM_TX_PARAM_DATA_LINK_BREAK_C

- 原始字段：`COMM_TX_PARAM_DATA_LINK_BREAK_C`
- UI名称：数据断链异常注入控制
- UI类型：使能开关
- 数据宽度：`1 bit`

| UI字段/选项 | 协议写入值 | 说明             |
| ----------- | ---------- | ---------------- |
| 正常        | `1'b0`     | 不注入断链异常   |
| 注入断链    | `1'b1`     | 注入数据断链异常 |

### UI_COMM_TX_CMD_GROUP_PULSE_RESET_C_COMM_TX_PARAM_RESET_C

- 原始字段：`COMM_TX_PARAM_RESET_C`
- UI名称：发送复位
- UI类型：触发按钮
- 数据宽度：`0 bit`

| UI字段/选项 | 协议写入值   | 说明                                             |
| ----------- | ------------ | ------------------------------------------------ |
| 点击        | `无 payload` | 发送该 group，RTL 产生脉冲；软件不要保持开关状态 |

### UI_COMM_TX_CMD_GROUP_PULSE_CLEAR_C_COMM_TX_PARAM_COUNT_CLEAR_C

- 原始字段：`COMM_TX_PARAM_COUNT_CLEAR_C`
- UI名称：计数复位
- UI类型：触发按钮
- 数据宽度：`0 bit`

| UI字段/选项 | 协议写入值   | 说明                                             |
| ----------- | ------------ | ------------------------------------------------ |
| 点击        | `无 payload` | 发送该 group，RTL 产生脉冲；软件不要保持开关状态 |
