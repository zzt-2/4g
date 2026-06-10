# laser_ctrl_block 遥控 UI 字段定义

- module_id：`4'h4`
- 来源：`指令与状态/遥控指令清单/laser_ctrl_block.md`、`指令与状态/遥控指令具体执行/laser_ctrl_block.md`
- word 列表示遥控 payload 数据字索引；`-` 表示该命令无 payload。

## LASER_CTRL_CMD_GROUP_TXM_ON_C

| 参数原始字段名         | UI显示名称     | word | 索引位宽    | 有符号/无符号 | UI类型 | 参数表格索引                                                                                                    |
| ---------------------- | -------------- | ---- | ----------- | ------------- | ------ | --------------------------------------------------------------------------------------------------------------- |
| `LASER_PARAM_TXM_ON_C` | 发射激光器开关 | `0`  | `word[1:0]` | 无符号数      | 下拉栏 | [UI_LASER_CTRL_CMD_GROUP_TXM_ON_C_LASER_PARAM_TXM_ON_C](#ui_laser_ctrl_cmd_group_txm_on_c_laser_param_txm_on_c) |

## LASER_CTRL_CMD_GROUP_LO_ON_C

| 参数原始字段名        | UI显示名称     | word | 索引位宽    | 有符号/无符号 | UI类型 | 参数表格索引                                                                                                |
| --------------------- | -------------- | ---- | ----------- | ------------- | ------ | ----------------------------------------------------------------------------------------------------------- |
| `LASER_PARAM_LO_ON_C` | 本振激光器开关 | `0`  | `word[1:0]` | 无符号数      | 下拉栏 | [UI_LASER_CTRL_CMD_GROUP_LO_ON_C_LASER_PARAM_LO_ON_C](#ui_laser_ctrl_cmd_group_lo_on_c_laser_param_lo_on_c) |

## LASER_CTRL_CMD_GROUP_WAVE_SET_ON_C

| 参数原始字段名              | UI显示名称          | word | 索引位宽  | 有符号/无符号 | UI类型 | 参数表格索引                                                                                                                        |
| --------------------------- | ------------------- | ---- | --------- | ------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `LASER_PARAM_WAVE_SET_ON_C` | 参数包/手动温度选择 | `0`  | `word[0]` | 无符号数      | 下拉栏 | [UI_LASER_CTRL_CMD_GROUP_WAVE_SET_ON_C_LASER_PARAM_WAVE_SET_ON_C](#ui_laser_ctrl_cmd_group_wave_set_on_c_laser_param_wave_set_on_c) |

## LASER_CTRL_CMD_GROUP_TEC_ON1_C

| 参数原始字段名          | UI显示名称 | word | 索引位宽  | 有符号/无符号 | UI类型   | 参数表格索引                                                                                                        |
| ----------------------- | ---------- | ---- | --------- | ------------- | -------- | ------------------------------------------------------------------------------------------------------------------- |
| `LASER_PARAM_TEC_ON1_C` | TEC1 开关  | `0`  | `word[0]` | 无符号数      | 使能开关 | [UI_LASER_CTRL_CMD_GROUP_TEC_ON1_C_LASER_PARAM_TEC_ON1_C](#ui_laser_ctrl_cmd_group_tec_on1_c_laser_param_tec_on1_c) |

## LASER_CTRL_CMD_GROUP_TEC_ON2_C

| 参数原始字段名          | UI显示名称 | word | 索引位宽  | 有符号/无符号 | UI类型   | 参数表格索引                                                                                                        |
| ----------------------- | ---------- | ---- | --------- | ------------- | -------- | ------------------------------------------------------------------------------------------------------------------- |
| `LASER_PARAM_TEC_ON2_C` | TEC2 开关  | `0`  | `word[0]` | 无符号数      | 使能开关 | [UI_LASER_CTRL_CMD_GROUP_TEC_ON2_C_LASER_PARAM_TEC_ON2_C](#ui_laser_ctrl_cmd_group_tec_on2_c_laser_param_tec_on2_c) |

## LASER_CTRL_CMD_GROUP_MODU_MODE_C

| 参数原始字段名            | UI显示名称 | word | 索引位宽    | 有符号/无符号 | UI类型 | 参数表格索引                                                                                                                |
| ------------------------- | ---------- | ---- | ----------- | ------------- | ------ | --------------------------------------------------------------------------------------------------------------------------- |
| `LASER_PARAM_MODU_MODE_C` | 调制模式   | `0`  | `word[1:0]` | 无符号数      | 下拉栏 | [UI_LASER_CTRL_CMD_GROUP_MODU_MODE_C_LASER_PARAM_MODU_MODE_C](#ui_laser_ctrl_cmd_group_modu_mode_c_laser_param_modu_mode_c) |

## LASER_CTRL_CMD_GROUP_VOL_AUTO_C

| 参数原始字段名           | UI显示名称 | word | 索引位宽  | 有符号/无符号 | UI类型   | 参数表格索引                                                                                                            |
| ------------------------ | ---------- | ---- | --------- | ------------- | -------- | ----------------------------------------------------------------------------------------------------------------------- |
| `LASER_PARAM_VOL_AUTO_C` | 调制开始   | `0`  | `word[0]` | 无符号数      | 使能开关 | [UI_LASER_CTRL_CMD_GROUP_VOL_AUTO_C_LASER_PARAM_VOL_AUTO_C](#ui_laser_ctrl_cmd_group_vol_auto_c_laser_param_vol_auto_c) |

## LASER_CTRL_CMD_GROUP_TXM1_SET_C

| 参数原始字段名           | UI显示名称                | word | 索引位宽     | 有符号/无符号 | UI类型   | 参数表格索引                                                                                                            |
| ------------------------ | ------------------------- | ---- | ------------ | ------------- | -------- | ----------------------------------------------------------------------------------------------------------------------- |
| `LASER_PARAM_TXM1_SET_C` | 发射激光器1温度手动设置值 | `0`  | `word[15:0]` | 无符号数      | 数值填写 | [UI_LASER_CTRL_CMD_GROUP_TXM1_SET_C_LASER_PARAM_TXM1_SET_C](#ui_laser_ctrl_cmd_group_txm1_set_c_laser_param_txm1_set_c) |

## LASER_CTRL_CMD_GROUP_TXM2_SET_C

| 参数原始字段名           | UI显示名称                | word | 索引位宽     | 有符号/无符号 | UI类型   | 参数表格索引                                                                                                            |
| ------------------------ | ------------------------- | ---- | ------------ | ------------- | -------- | ----------------------------------------------------------------------------------------------------------------------- |
| `LASER_PARAM_TXM2_SET_C` | 发射激光器2温度手动设置值 | `0`  | `word[15:0]` | 无符号数      | 数值填写 | [UI_LASER_CTRL_CMD_GROUP_TXM2_SET_C_LASER_PARAM_TXM2_SET_C](#ui_laser_ctrl_cmd_group_txm2_set_c_laser_param_txm2_set_c) |

## LASER_CTRL_CMD_GROUP_LO1_SET_C

| 参数原始字段名          | UI显示名称                | word | 索引位宽     | 有符号/无符号 | UI类型   | 参数表格索引                                                                                                        |
| ----------------------- | ------------------------- | ---- | ------------ | ------------- | -------- | ------------------------------------------------------------------------------------------------------------------- |
| `LASER_PARAM_LO1_SET_C` | 本振激光器1温度手动设置值 | `0`  | `word[15:0]` | 无符号数      | 数值填写 | [UI_LASER_CTRL_CMD_GROUP_LO1_SET_C_LASER_PARAM_LO1_SET_C](#ui_laser_ctrl_cmd_group_lo1_set_c_laser_param_lo1_set_c) |

## LASER_CTRL_CMD_GROUP_LO2_SET_C

| 参数原始字段名          | UI显示名称                | word | 索引位宽     | 有符号/无符号 | UI类型   | 参数表格索引                                                                                                        |
| ----------------------- | ------------------------- | ---- | ------------ | ------------- | -------- | ------------------------------------------------------------------------------------------------------------------- |
| `LASER_PARAM_LO2_SET_C` | 本振激光器2温度手动设置值 | `0`  | `word[15:0]` | 无符号数      | 数值填写 | [UI_LASER_CTRL_CMD_GROUP_LO2_SET_C_LASER_PARAM_LO2_SET_C](#ui_laser_ctrl_cmd_group_lo2_set_c_laser_param_lo2_set_c) |

## 参数表格

### UI_LASER_CTRL_CMD_GROUP_TXM_ON_C_LASER_PARAM_TXM_ON_C

- 原始字段：`LASER_PARAM_TXM_ON_C`
- UI名称：发射激光器开关
- UI类型：下拉栏
- 数据宽度：`2 bit`

| UI字段/选项 | 协议写入值 | 说明             |
| ----------- | ---------- | ---------------- |
| 关闭        | `2'b00`    | TXM1/TXM2 均关闭 |
| TXM1 开     | `2'b01`    | 打开 TXM1        |
| TXM2 开     | `2'b10`    | 打开 TXM2        |

### UI_LASER_CTRL_CMD_GROUP_LO_ON_C_LASER_PARAM_LO_ON_C

- 原始字段：`LASER_PARAM_LO_ON_C`
- UI名称：本振激光器开关
- UI类型：下拉栏
- 数据宽度：`2 bit`

| UI字段/选项 | 协议写入值 | 说明           |
| ----------- | ---------- | -------------- |
| 关闭        | `2'b00`    | LO1/LO2 均关闭 |
| LO1 开      | `2'b01`    | 打开 LO1       |
| LO2 开      | `2'b10`    | 打开 LO2       |

### UI_LASER_CTRL_CMD_GROUP_WAVE_SET_ON_C_LASER_PARAM_WAVE_SET_ON_C

- 原始字段：`LASER_PARAM_WAVE_SET_ON_C`
- UI名称：参数包/手动温度选择
- UI类型：下拉栏
- 数据宽度：`1 bit`

| UI字段/选项 | 协议写入值 | 说明                    |
| ----------- | ---------- | ----------------------- |
| 参数包      | `1'b0`     | 使用参数包/默认温度路径 |
| 手动温度    | `1'b1`     | 使用手动温度设置值      |

### UI_LASER_CTRL_CMD_GROUP_TEC_ON1_C_LASER_PARAM_TEC_ON1_C

- 原始字段：`LASER_PARAM_TEC_ON1_C`
- UI名称：TEC1 开关
- UI类型：使能开关
- 数据宽度：`1 bit`

| UI字段/选项 | 协议写入值 | 说明                |
| ----------- | ---------- | ------------------- |
| 关闭/禁用   | `1'b0`     | TEC1 开关关闭或禁用 |
| 开启/使能   | `1'b1`     | TEC1 开关开启或使能 |

### UI_LASER_CTRL_CMD_GROUP_TEC_ON2_C_LASER_PARAM_TEC_ON2_C

- 原始字段：`LASER_PARAM_TEC_ON2_C`
- UI名称：TEC2 开关
- UI类型：使能开关
- 数据宽度：`1 bit`

| UI字段/选项 | 协议写入值 | 说明                |
| ----------- | ---------- | ------------------- |
| 关闭/禁用   | `1'b0`     | TEC2 开关关闭或禁用 |
| 开启/使能   | `1'b1`     | TEC2 开关开启或使能 |

### UI_LASER_CTRL_CMD_GROUP_MODU_MODE_C_LASER_PARAM_MODU_MODE_C

- 原始字段：`LASER_PARAM_MODU_MODE_C`
- UI名称：调制模式
- UI类型：下拉栏
- 数据宽度：`2 bit`

| UI字段/选项 | 协议写入值 | 说明             |
| ----------- | ---------- | ---------------- |
| OOK         | `2'd0`     | 调制模式编码OOK  |
| BPSK        | `2'd1`     | 调制模式编码BPSK |
| QPSK        | `2'd2`     | 调制模式编码QPSK |

### UI_LASER_CTRL_CMD_GROUP_VOL_AUTO_C_LASER_PARAM_VOL_AUTO_C

- 原始字段：`LASER_PARAM_VOL_AUTO_C`
- UI名称：调制开始
- UI类型：使能开关
- 数据宽度：`1 bit`

| UI字段/选项 | 协议写入值 | 说明           |
| ----------- | ---------- | -------------- |
| 停止/不开始 | `1'b0`     | 调制开始位写 0 |
| 开始        | `1'b1`     | 调制开始位写 1 |

### UI_LASER_CTRL_CMD_GROUP_TXM1_SET_C_LASER_PARAM_TXM1_SET_C

- 原始字段：`LASER_PARAM_TXM1_SET_C`
- UI名称：发射激光器1温度手动设置值
- UI类型：数值填写
- 数据宽度：`16 bit`

| UI字段/选项 | 协议写入值 | 说明                                             |
| ----------- | ---------- | ------------------------------------------------ |
| 数值输入    | `16 bit`   | UI 输入十进制数，写入前截断到 16 bit；负数不允许 |

### UI_LASER_CTRL_CMD_GROUP_TXM2_SET_C_LASER_PARAM_TXM2_SET_C

- 原始字段：`LASER_PARAM_TXM2_SET_C`
- UI名称：发射激光器2温度手动设置值
- UI类型：数值填写
- 数据宽度：`16 bit`

| UI字段/选项 | 协议写入值 | 说明                                             |
| ----------- | ---------- | ------------------------------------------------ |
| 数值输入    | `16 bit`   | UI 输入十进制数，写入前截断到 16 bit；负数不允许 |

### UI_LASER_CTRL_CMD_GROUP_LO1_SET_C_LASER_PARAM_LO1_SET_C

- 原始字段：`LASER_PARAM_LO1_SET_C`
- UI名称：本振激光器1温度手动设置值
- UI类型：数值填写
- 数据宽度：`16 bit`

| UI字段/选项 | 协议写入值 | 说明                                             |
| ----------- | ---------- | ------------------------------------------------ |
| 数值输入    | `16 bit`   | UI 输入十进制数，写入前截断到 16 bit；负数不允许 |

### UI_LASER_CTRL_CMD_GROUP_LO2_SET_C_LASER_PARAM_LO2_SET_C

- 原始字段：`LASER_PARAM_LO2_SET_C`
- UI名称：本振激光器2温度手动设置值
- UI类型：数值填写
- 数据宽度：`16 bit`

| UI字段/选项 | 协议写入值 | 说明                                             |
| ----------- | ---------- | ------------------------------------------------ |
| 数值输入    | `16 bit`   | UI 输入十进制数，写入前截断到 16 bit；负数不允许 |
