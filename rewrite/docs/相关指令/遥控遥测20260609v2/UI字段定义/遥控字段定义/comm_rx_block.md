# comm_rx_block 遥控 UI 字段定义

- module_id：`4'h8`
- 来源：`指令与状态/遥控指令清单/comm_rx_block.md`、`指令与状态/遥控指令具体执行/comm_rx_block.md`
- word 列表示遥控 payload 数据字索引；`-` 表示该命令无 payload。

## COMM_RX_CMD_GROUP_MAP_C

| 参数原始字段名                  | UI显示名称             | word | 索引位宽    | 有符号/无符号 | UI类型   | 参数表格索引                                                                                                          |
| ------------------------------- | ---------------------- | ---- | ----------- | ------------- | -------- | --------------------------------------------------------------------------------------------------------------------- |
| `COMM_RX_PARAM_RATE_C`          | 接收链路速率选择       | `0`  | `word[7:0]` | 无符号数      | 下拉栏   | [UI_COMM_RX_CMD_GROUP_MAP_C_COMM_RX_PARAM_RATE_C](#ui_comm_rx_cmd_group_map_c_comm_rx_param_rate_c)                   |
| `COMM_RX_PARAM_DECODE_C`        | 解码选择，0=RS，1=LDPC | `1`  | `word[0]`   | 无符号数      | 下拉栏   | [UI_COMM_RX_CMD_GROUP_MAP_C_COMM_RX_PARAM_DECODE_C](#ui_comm_rx_cmd_group_map_c_comm_rx_param_decode_c)               |
| `COMM_RX_PARAM_DESCRAMBLE_C`    | 接收解扰使能           | `2`  | `word[0]`   | 无符号数      | 使能开关 | [UI_COMM_RX_CMD_GROUP_MAP_C_COMM_RX_PARAM_DESCRAMBLE_C](#ui_comm_rx_cmd_group_map_c_comm_rx_param_descramble_c)       |
| `COMM_RX_PARAM_FILTER_C`        | 载波滤波使能           | `3`  | `word[0]`   | 无符号数      | 使能开关 | [UI_COMM_RX_CMD_GROUP_MAP_C_COMM_RX_PARAM_FILTER_C](#ui_comm_rx_cmd_group_map_c_comm_rx_param_filter_c)               |
| `COMM_RX_PARAM_LOOP_BW_C`       | 定时环路带宽选择       | `4`  | `word[2:0]` | 无符号数      | 下拉栏   | [UI_COMM_RX_CMD_GROUP_MAP_C_COMM_RX_PARAM_LOOP_BW_C](#ui_comm_rx_cmd_group_map_c_comm_rx_param_loop_bw_c)             |
| `COMM_RX_PARAM_TIMING_FILTER_C` | 定时滤波使能           | `5`  | `word[0]`   | 无符号数      | 使能开关 | [UI_COMM_RX_CMD_GROUP_MAP_C_COMM_RX_PARAM_TIMING_FILTER_C](#ui_comm_rx_cmd_group_map_c_comm_rx_param_timing_filter_c) |
| `COMM_RX_PARAM_AUTO_RESET_C`    | 自动复位使能           | `6`  | `word[0]`   | 无符号数      | 使能开关 | [UI_COMM_RX_CMD_GROUP_MAP_C_COMM_RX_PARAM_AUTO_RESET_C](#ui_comm_rx_cmd_group_map_c_comm_rx_param_auto_reset_c)       |
| `COMM_RX_PARAM_LOOP_ENABLE_C`   | 接收链路环回使能       | `7`  | `word[0]`   | 无符号数      | 使能开关 | [UI_COMM_RX_CMD_GROUP_MAP_C_COMM_RX_PARAM_LOOP_ENABLE_C](#ui_comm_rx_cmd_group_map_c_comm_rx_param_loop_enable_c)     |

## COMM_RX_CMD_GROUP_VALUE_C

| 参数原始字段名                      | UI显示名称       | word | 索引位宽     | 有符号/无符号 | UI类型   | 参数表格索引                                                                                                                      |
| ----------------------------------- | ---------------- | ---- | ------------ | ------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `COMM_RX_PARAM_SYNC_CORR_PEAK_TH_C` | 帧同步相关峰阈值 | `0`  | `word[6:0]`  | 无符号数      | 数值填写 | [UI_COMM_RX_CMD_GROUP_VALUE_C_COMM_RX_PARAM_SYNC_CORR_PEAK_TH_C](#ui_comm_rx_cmd_group_value_c_comm_rx_param_sync_corr_peak_th_c) |
| `COMM_RX_PARAM_LOCK_TH_C`           | 帧锁定门限值     | `1`  | `word[15:0]` | 无符号数      | 数值填写 | [UI_COMM_RX_CMD_GROUP_VALUE_C_COMM_RX_PARAM_LOCK_TH_C](#ui_comm_rx_cmd_group_value_c_comm_rx_param_lock_th_c)                     |
| `COMM_RX_PARAM_UNLOCK_TH_C`         | 帧失锁门限值     | `2`  | `word[15:0]` | 无符号数      | 数值填写 | [UI_COMM_RX_CMD_GROUP_VALUE_C_COMM_RX_PARAM_UNLOCK_TH_C](#ui_comm_rx_cmd_group_value_c_comm_rx_param_unlock_th_c)                 |

## COMM_RX_CMD_GROUP_PULSE_RANGE_RST_C

| 参数原始字段名                | UI显示名称 | word | 索引位宽     | 有符号/无符号 | UI类型   | 参数表格索引                                                                                                                              |
| ----------------------------- | ---------- | ---- | ------------ | ------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `COMM_RX_PARAM_RANGE_RESET_C` | 测距复位   | `-`  | `无 payload` | 无符号数      | 触发按钮 | [UI_COMM_RX_CMD_GROUP_PULSE_RANGE_RST_C_COMM_RX_PARAM_RANGE_RESET_C](#ui_comm_rx_cmd_group_pulse_range_rst_c_comm_rx_param_range_reset_c) |

## COMM_RX_CMD_GROUP_PULSE_COUNT_CLR_C

| 参数原始字段名                | UI显示名称 | word | 索引位宽     | 有符号/无符号 | UI类型   | 参数表格索引                                                                                                                              |
| ----------------------------- | ---------- | ---- | ------------ | ------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `COMM_RX_PARAM_COUNT_CLEAR_C` | 计数复位   | `-`  | `无 payload` | 无符号数      | 触发按钮 | [UI_COMM_RX_CMD_GROUP_PULSE_COUNT_CLR_C_COMM_RX_PARAM_COUNT_CLEAR_C](#ui_comm_rx_cmd_group_pulse_count_clr_c_comm_rx_param_count_clear_c) |

## COMM_RX_CMD_GROUP_PULSE_MANUAL_RST_C

| 参数原始字段名                 | UI显示名称 | word | 索引位宽     | 有符号/无符号 | UI类型   | 参数表格索引                                                                                                                                  |
| ------------------------------ | ---------- | ---- | ------------ | ------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `COMM_RX_PARAM_MANUAL_RESET_C` | 全体复位   | `-`  | `无 payload` | 无符号数      | 触发按钮 | [UI_COMM_RX_CMD_GROUP_PULSE_MANUAL_RST_C_COMM_RX_PARAM_MANUAL_RESET_C](#ui_comm_rx_cmd_group_pulse_manual_rst_c_comm_rx_param_manual_reset_c) |

## 参数表格

### UI_COMM_RX_CMD_GROUP_MAP_C_COMM_RX_PARAM_RATE_C

- 原始字段：`COMM_RX_PARAM_RATE_C`
- UI名称：接收链路速率选择寄存值
- UI类型：下拉栏
- 数据宽度：`8 bit`

| UI字段/选项 | 协议写入值 | 说明                        |
| ----------- | ---------- | --------------------------- |
| 312M        | `8'h00`    | 速率选择 312M               |
| 625M        | `8'h01`    | 速率选择 625M               |
| 1.25G       | `8'h02`    | 速率选择 1.25G              |
| 2.5G        | `8'h03`    | 速率选择 2.5G               |
| 5G          | `8'h04`    | 速率选择 5G                 |
| OOK 20M     | `8'h80`    | OOK 接收已接入 20M 判决链路，`rate_sel[7:5]=3'b100` |
| OOK 10M     | `8'hA0`    | OOK 接收已接入 10M 判决链路，`rate_sel[7:5]=3'b101` |
| OOK 1M      | `8'hC0`    | OOK 1M 速率编码预留，当前 RTL 未单独实现 1M 判决阈值 |
| 其它        | `其它编码` | 保留/待确认，软件默认不提供 |

### UI_COMM_RX_CMD_GROUP_MAP_C_COMM_RX_PARAM_DECODE_C

- 原始字段：`COMM_RX_PARAM_DECODE_C`
- UI名称：解码选择，0=RS，1=LDPC
- UI类型：下拉栏
- 数据宽度：`1 bit`

| UI字段/选项 | 协议写入值 | 说明      |
| ----------- | ---------- | --------- |
| RS          | `1'b0`     | RS 译码   |
| LDPC        | `1'b1`     | LDPC 译码；需确认 LDPC DCP/source 绑定和 `LDPC_DeCode_EN` 参数后实际生效 |

### UI_COMM_RX_CMD_GROUP_MAP_C_COMM_RX_PARAM_DESCRAMBLE_C

- 原始字段：`COMM_RX_PARAM_DESCRAMBLE_C`
- UI名称：接收解扰使能
- UI类型：使能开关
- 数据宽度：`1 bit`

| UI字段/选项 | 协议写入值 | 说明               |
| ----------- | ---------- | ------------------ |
| 关闭        | `1'b0`     | 接收解扰使能位关闭 |
| 开启        | `1'b1`     | 接收解扰使能位开启 |

### UI_COMM_RX_CMD_GROUP_MAP_C_COMM_RX_PARAM_FILTER_C

- 原始字段：`COMM_RX_PARAM_FILTER_C`
- UI名称：载波滤波使能
- UI类型：使能开关
- 数据宽度：`1 bit`

| UI字段/选项 | 协议写入值 | 说明               |
| ----------- | ---------- | ------------------ |
| 关闭        | `1'b0`     | 载波滤波使能位关闭 |
| 开启        | `1'b1`     | 载波滤波使能位开启 |

### UI_COMM_RX_CMD_GROUP_MAP_C_COMM_RX_PARAM_LOOP_BW_C

- 原始字段：`COMM_RX_PARAM_LOOP_BW_C`
- UI名称：定时环路带宽选择编码
- UI类型：下拉栏
- 数据宽度：`3 bit`

| UI字段/选项 | 协议写入值 | 说明                               |
| ----------- | ---------- | ---------------------------------- |
| 带宽编码 0  | `3'd0`     | 定时环路带宽编码，具体带宽值待确认 |
| 带宽编码 1  | `3'd1`     | 定时环路带宽编码，具体带宽值待确认 |
| 带宽编码 2  | `3'd2`     | 定时环路带宽编码，具体带宽值待确认 |
| 带宽编码 3  | `3'd3`     | 定时环路带宽编码，具体带宽值待确认 |
| 带宽编码 4  | `3'd4`     | 定时环路带宽编码，具体带宽值待确认 |
| 带宽编码 5  | `3'd5`     | 定时环路带宽编码，具体带宽值待确认 |
| 带宽编码 6  | `3'd6`     | 定时环路带宽编码，具体带宽值待确认 |
| 带宽编码 7  | `3'd7`     | 定时环路带宽编码，具体带宽值待确认 |

### UI_COMM_RX_CMD_GROUP_MAP_C_COMM_RX_PARAM_TIMING_FILTER_C

- 原始字段：`COMM_RX_PARAM_TIMING_FILTER_C`
- UI名称：定时滤波使能位
- UI类型：使能开关
- 数据宽度：`1 bit`

| UI字段/选项 | 协议写入值 | 说明               |
| ----------- | ---------- | ------------------ |
| 关闭        | `1'b0`     | 定时滤波使能位关闭 |
| 开启        | `1'b1`     | 定时滤波使能位开启 |

### UI_COMM_RX_CMD_GROUP_MAP_C_COMM_RX_PARAM_AUTO_RESET_C

- 原始字段：`COMM_RX_PARAM_AUTO_RESET_C`
- UI名称：自动复位使能位
- UI类型：使能开关
- 数据宽度：`1 bit`

| UI字段/选项 | 协议写入值 | 说明               |
| ----------- | ---------- | ------------------ |
| 关闭        | `1'b0`     | 自动复位使能位关闭 |
| 开启        | `1'b1`     | 自动复位使能位开启 |

### UI_COMM_RX_CMD_GROUP_MAP_C_COMM_RX_PARAM_LOOP_ENABLE_C

- 原始字段：`COMM_RX_PARAM_LOOP_ENABLE_C`
- UI名称：接收链路环回使能位
- UI类型：使能开关
- 数据宽度：`1 bit`

| UI字段/选项 | 协议写入值 | 说明                   |
| ----------- | ---------- | ---------------------- |
| 关闭        | `1'b0`     | 接收链路环回使能位关闭 |
| 开启        | `1'b1`     | 接收链路环回使能位开启 |

### UI_COMM_RX_CMD_GROUP_VALUE_C_COMM_RX_PARAM_SYNC_CORR_PEAK_TH_C

- 原始字段：`COMM_RX_PARAM_SYNC_CORR_PEAK_TH_C`
- UI名称：帧同步相关峰阈值
- UI类型：数值填写
- 数据宽度：`7 bit`

| UI字段/选项 | 协议写入值 | 说明                                            |
| ----------- | ---------- | ----------------------------------------------- |
| 数值输入    | `7 bit`    | UI 输入十进制数，写入前截断到 7 bit；负数不允许 |

### UI_COMM_RX_CMD_GROUP_VALUE_C_COMM_RX_PARAM_LOCK_TH_C

- 原始字段：`COMM_RX_PARAM_LOCK_TH_C`
- UI名称：帧锁定门限值
- UI类型：数值填写
- 数据宽度：`16 bit`

| UI字段/选项 | 协议写入值 | 说明                                             |
| ----------- | ---------- | ------------------------------------------------ |
| 数值输入    | `16 bit`   | UI 输入十进制数，写入前截断到 16 bit；负数不允许 |

### UI_COMM_RX_CMD_GROUP_VALUE_C_COMM_RX_PARAM_UNLOCK_TH_C

- 原始字段：`COMM_RX_PARAM_UNLOCK_TH_C`
- UI名称：帧失锁门限值
- UI类型：数值填写
- 数据宽度：`16 bit`

| UI字段/选项 | 协议写入值 | 说明                                             |
| ----------- | ---------- | ------------------------------------------------ |
| 数值输入    | `16 bit`   | UI 输入十进制数，写入前截断到 16 bit；负数不允许 |

### UI_COMM_RX_CMD_GROUP_PULSE_RANGE_RST_C_COMM_RX_PARAM_RANGE_RESET_C

- 原始字段：`COMM_RX_PARAM_RANGE_RESET_C`
- UI名称：测距复位
- UI类型：触发按钮
- 数据宽度：`0 bit`

| UI字段/选项 | 协议写入值   | 说明                                             |
| ----------- | ------------ | ------------------------------------------------ |
| 点击        | `无 payload` | 发送该 group，RTL 产生脉冲；软件不要保持开关状态 |

### UI_COMM_RX_CMD_GROUP_PULSE_COUNT_CLR_C_COMM_RX_PARAM_COUNT_CLEAR_C

- 原始字段：`COMM_RX_PARAM_COUNT_CLEAR_C`
- UI名称：计数复位
- UI类型：触发按钮
- 数据宽度：`0 bit`

| UI字段/选项 | 协议写入值   | 说明                                             |
| ----------- | ------------ | ------------------------------------------------ |
| 点击        | `无 payload` | 发送该 group，RTL 产生脉冲；软件不要保持开关状态 |

### UI_COMM_RX_CMD_GROUP_PULSE_MANUAL_RST_C_COMM_RX_PARAM_MANUAL_RESET_C

- 原始字段：`COMM_RX_PARAM_MANUAL_RESET_C`
- UI名称：全体复位
- UI类型：触发按钮
- 数据宽度：`0 bit`

| UI字段/选项 | 协议写入值   | 说明                                             |
| ----------- | ------------ | ------------------------------------------------ |
| 点击        | `无 payload` | 发送该 group，RTL 产生脉冲；软件不要保持开关状态 |
