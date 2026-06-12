# comm_tx_block 遥测 UI 字段定义

- 来源：`import/rtl_source/comm_tx_block/vars/*_ctrl_pkg.sv` 和 `指令与状态/遥测指令清单/comm_tx_block.md`
- word 列表示遥测 payload 数据字索引，不包含 RS422 帧头、长度字、应用层头和 checksum。
- 对于 64bit/192bit 这类跨 word 字段，表中会按每个 32bit 分片列出，软件按字段切片说明重组。

## TM_GROUP_RUNTIME_C

- group_id：`8'h80`

| 参数原始字段名 | UI显示名称 | word | 索引位宽 | 有符号/无符号 | UI类型 | 参数表格索引 |
| --- | --- | --- | --- | --- | --- | --- |
| `idle_frame_count_sec` | 空闲帧每秒计数 | `0` | `word[31:0]` | 无符号数 | 显示 | [UI_TM_GROUP_RUNTIME_C_IDLE_FRAME_COUNT_SEC](#ui_tm_group_runtime_c_idle_frame_count_sec) |
| `biz_frame_count_sec` | 业务帧每秒计数 | `1` | `word[31:0]` | 无符号数 | 显示 | [UI_TM_GROUP_RUNTIME_C_BIZ_FRAME_COUNT_SEC](#ui_tm_group_runtime_c_biz_frame_count_sec) |
| `biz_frame_count_total` | 业务帧累计计数 | `2` | `word[31:0]` | 无符号数 | 显示 | [UI_TM_GROUP_RUNTIME_C_BIZ_FRAME_COUNT_TOTAL](#ui_tm_group_runtime_c_biz_frame_count_total) |
| `reset_status` | 复位状态 | `3` | `word[0]` | 无符号数 | 显示 | [UI_TM_GROUP_RUNTIME_C_RESET_STATUS](#ui_tm_group_runtime_c_reset_status) |
| `ber_inject_mode_status` | 当前误码注入模式状态 | `4` | `word[3:0]` | 无符号数 | 显示 | [UI_TM_GROUP_RUNTIME_C_BER_INJECT_MODE_STATUS](#ui_tm_group_runtime_c_ber_inject_mode_status) |
| `crc_error_inject_status` | 当前 CRC 故障注入状态 | `5` | `word[15:12]` | 无符号数 | 显示 | [UI_TM_GROUP_RUNTIME_C_CRC_ERROR_INJECT_STATUS](#ui_tm_group_runtime_c_crc_error_inject_status) |
| `header_error_inject_status` | 当前帧头故障注入状态 | `5` | `word[11:8]` | 无符号数 | 显示 | [UI_TM_GROUP_RUNTIME_C_HEADER_ERROR_INJECT_STATUS](#ui_tm_group_runtime_c_header_error_inject_status) |
| `data_type_error_inject_status` | 当前数据类型故障注入状态 | `5` | `word[7:4]` | 无符号数 | 显示 | [UI_TM_GROUP_RUNTIME_C_DATA_TYPE_ERROR_INJECT_STATUS](#ui_tm_group_runtime_c_data_type_error_inject_status) |
| `field_pos_error_inject_status` | 当前字段位置故障注入状态 | `5` | `word[3:0]` | 无符号数 | 显示 | [UI_TM_GROUP_RUNTIME_C_FIELD_POS_ERROR_INJECT_STATUS](#ui_tm_group_runtime_c_field_pos_error_inject_status) |
| `encode_error_inject_status` | 当前编码故障注入状态 | `6` | `word[7:4]` | 无符号数 | 显示 | [UI_TM_GROUP_RUNTIME_C_ENCODE_ERROR_INJECT_STATUS](#ui_tm_group_runtime_c_encode_error_inject_status) |
| `encode_sel_status` | 配置编码类型状态 | `6` | `word[3:0]` | 无符号数 | 显示 | [UI_TM_GROUP_RUNTIME_C_ENCODE_SEL_STATUS](#ui_tm_group_runtime_c_encode_sel_status) |
| `actual_encode_sel_status` | 实际编码类型状态 | `7` | `word[3:0]` | 无符号数 | 显示 | [UI_TM_GROUP_RUNTIME_C_ACTUAL_ENCODE_SEL_STATUS](#ui_tm_group_runtime_c_actual_encode_sel_status) |

## TM_GROUP_CFG_C

- group_id：`8'h81`

| 参数原始字段名 | UI显示名称 | word | 索引位宽 | 有符号/无符号 | UI类型 | 参数表格索引 |
| --- | --- | --- | --- | --- | --- | --- |
| `rate_sel` | 发送速率选择 | `0` | `word[7:0]` | 无符号数 | 显示 | [UI_TM_GROUP_CFG_C_RATE_SEL](#ui_tm_group_cfg_c_rate_sel) |
| `scramble_enable` | 扰码使能 | `1` | `word[0]` | 无符号数 | 显示 | [UI_TM_GROUP_CFG_C_SCRAMBLE_ENABLE](#ui_tm_group_cfg_c_scramble_enable) |
| `encode_sel` | 编码类型选择 | `2` | `word[0]` | 无符号数 | 显示 | [UI_TM_GROUP_CFG_C_ENCODE_SEL](#ui_tm_group_cfg_c_encode_sel) |
| `ber_inject_mode` | 误码注入模式 | `3` | `word[3:0]` | 无符号数 | 显示 | [UI_TM_GROUP_CFG_C_BER_INJECT_MODE](#ui_tm_group_cfg_c_ber_inject_mode) |
| `crc_error_inject` | CRC 故障注入控制 | `4` | `word[3:0]` | 无符号数 | 显示 | [UI_TM_GROUP_CFG_C_CRC_ERROR_INJECT](#ui_tm_group_cfg_c_crc_error_inject) |
| `header_error_inject` | 帧头故障注入控制 | `5` | `word[3:0]` | 无符号数 | 显示 | [UI_TM_GROUP_CFG_C_HEADER_ERROR_INJECT](#ui_tm_group_cfg_c_header_error_inject) |
| `data_type_error_inject` | 数据类型故障注入控制 | `6` | `word[3:0]` | 无符号数 | 显示 | [UI_TM_GROUP_CFG_C_DATA_TYPE_ERROR_INJECT](#ui_tm_group_cfg_c_data_type_error_inject) |
| `field_pos_error_inject` | 字段位置故障注入控制 | `7` | `word[3:0]` | 无符号数 | 显示 | [UI_TM_GROUP_CFG_C_FIELD_POS_ERROR_INJECT](#ui_tm_group_cfg_c_field_pos_error_inject) |
| `encode_error_inject` | 编码故障注入控制 | `8` | `word[3:0]` | 无符号数 | 显示 | [UI_TM_GROUP_CFG_C_ENCODE_ERROR_INJECT](#ui_tm_group_cfg_c_encode_error_inject) |
| `data_link_break_inject` | 数据断链异常注入控制 | `9` | `word[0]` | 无符号数 | 显示 | [UI_TM_GROUP_CFG_C_DATA_LINK_BREAK_INJECT](#ui_tm_group_cfg_c_data_link_break_inject) |

## 参数表格

### UI_TM_GROUP_RUNTIME_C_IDLE_FRAME_COUNT_SEC

- 原始字段：`idle_frame_count_sec`
- UI名称：空闲帧每秒计数
- 显示类型：数值显示
- 截取位置：`word[31:0]`
- 数据宽度：`32 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `原始值` | 32 bit 无符号数 | 按无符号十进制显示 |

### UI_TM_GROUP_RUNTIME_C_BIZ_FRAME_COUNT_SEC

- 原始字段：`biz_frame_count_sec`
- UI名称：业务帧每秒计数
- 显示类型：数值显示
- 截取位置：`word[31:0]`
- 数据宽度：`32 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `原始值` | 32 bit 无符号数 | 按无符号十进制显示 |

### UI_TM_GROUP_RUNTIME_C_BIZ_FRAME_COUNT_TOTAL

- 原始字段：`biz_frame_count_total`
- UI名称：业务帧累计计数
- 显示类型：数值显示
- 截取位置：`word[31:0]`
- 数据宽度：`32 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `原始值` | 32 bit 无符号数 | 按无符号十进制显示 |

### UI_TM_GROUP_RUNTIME_C_RESET_STATUS

- 原始字段：`reset_status`
- UI名称：复位状态
- 显示类型：复位状态
- 截取位置：`word[0]`
- 数据宽度：`1 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `0` | 空闲 | 未处于复位请求/忙状态 |
| `1` | 复位中/已接受 | 复位请求已接受或复位忙 |

### UI_TM_GROUP_RUNTIME_C_BER_INJECT_MODE_STATUS

- 原始字段：`ber_inject_mode_status`
- UI名称：当前误码注入模式状态
- 显示类型：枚举状态
- 截取位置：`word[3:0]`
- 数据宽度：`4 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `0` | 不注入 | BER 注入模式：不注入 |
| `1` | 轻量误码 | BER 注入模式：轻量误码 |
| `2` | 重度误码 | BER 注入模式：重度误码 |
| `3` | 随机误码 | BER 注入模式：随机误码 |
| `4~15` | 保留/未知 | 当前 RTL 未定义中文含义 |

### UI_TM_GROUP_RUNTIME_C_CRC_ERROR_INJECT_STATUS

- 原始字段：`crc_error_inject_status`
- UI名称：当前 CRC 故障注入状态
- 显示类型：枚举状态
- 截取位置：`word[15:12]`
- 数据宽度：`4 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `0` | 不注入 | 故障注入关闭 |
| `1~15` | 注入编码值 | 具体错误模式未在当前 RTL 注释中定义 |

### UI_TM_GROUP_RUNTIME_C_HEADER_ERROR_INJECT_STATUS

- 原始字段：`header_error_inject_status`
- UI名称：当前帧头故障注入状态
- 显示类型：枚举状态
- 截取位置：`word[11:8]`
- 数据宽度：`4 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `0` | 不注入 | 故障注入关闭 |
| `1~15` | 注入编码值 | 具体错误模式未在当前 RTL 注释中定义 |

### UI_TM_GROUP_RUNTIME_C_DATA_TYPE_ERROR_INJECT_STATUS

- 原始字段：`data_type_error_inject_status`
- UI名称：当前数据类型故障注入状态
- 显示类型：枚举状态
- 截取位置：`word[7:4]`
- 数据宽度：`4 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `0` | 不注入 | 故障注入关闭 |
| `1~15` | 注入编码值 | 具体错误模式未在当前 RTL 注释中定义 |

### UI_TM_GROUP_RUNTIME_C_FIELD_POS_ERROR_INJECT_STATUS

- 原始字段：`field_pos_error_inject_status`
- UI名称：当前字段位置故障注入状态
- 显示类型：枚举状态
- 截取位置：`word[3:0]`
- 数据宽度：`4 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `0` | 不注入 | 故障注入关闭 |
| `1~15` | 注入编码值 | 具体错误模式未在当前 RTL 注释中定义 |

### UI_TM_GROUP_RUNTIME_C_ENCODE_ERROR_INJECT_STATUS

- 原始字段：`encode_error_inject_status`
- UI名称：当前编码故障注入状态
- 显示类型：枚举状态
- 截取位置：`word[7:4]`
- 数据宽度：`4 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `0` | 不注入 | 故障注入关闭 |
| `1~15` | 注入编码值 | 具体错误模式未在当前 RTL 注释中定义 |

### UI_TM_GROUP_RUNTIME_C_ENCODE_SEL_STATUS

- 原始字段：`encode_sel_status`
- UI名称：配置编码类型状态
- 显示类型：枚举状态
- 截取位置：`word[3:0]`
- 数据宽度：`4 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `0` | RS | RS 编码/译码 |
| `1` | LDPC | LDPC 编码；需确认 LDPC DCP/source 绑定和 `LDPC_ENCODE_EN` 参数后实际生效 |
| `其它` | 保留/未知 | 当前按低 1 bit 使用 |

### UI_TM_GROUP_RUNTIME_C_ACTUAL_ENCODE_SEL_STATUS

- 原始字段：`actual_encode_sel_status`
- UI名称：实际编码类型状态
- 显示类型：枚举状态
- 截取位置：`word[3:0]`
- 数据宽度：`4 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `0` | RS | RS 编码/译码 |
| `1` | LDPC | LDPC 编码；需确认 LDPC DCP/source 绑定和 `LDPC_ENCODE_EN` 参数后实际生效 |
| `其它` | 保留/未知 | 当前按低 1 bit 使用 |

### UI_TM_GROUP_CFG_C_RATE_SEL

- 原始字段：`rate_sel`
- UI名称：发送速率选择
- 显示类型：枚举状态
- 截取位置：`word[7:0]`
- 数据宽度：`8 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `0` | 312M | 速率选择 312M |
| `1` | 625M | 速率选择 625M |
| `2` | 1.25G | 速率选择 1.25G |
| `3` | 2.5G | 速率选择 2.5G |
| `4` | 5G | 速率选择 5G |
| `128` / `8'h80` | OOK 20M | OOK 调制，`rate_sel[7:5]=3'b100` |
| `160` / `8'hA0` | OOK 10M | OOK 调制，`rate_sel[7:5]=3'b101` |
| `192` / `8'hC0` | OOK 1M | OOK 调制，`rate_sel[7:5]=3'b110` |
| `其它` | 保留/未知 | 未定义速率编码 |

### UI_TM_GROUP_CFG_C_SCRAMBLE_ENABLE

- 原始字段：`scramble_enable`
- UI名称：扰码使能
- 显示类型：使能状态
- 截取位置：`word[0]`
- 数据宽度：`1 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `0` | 未使能 | 使能状态位为 0 |
| `1` | 使能 | 使能状态位为 1 |

### UI_TM_GROUP_CFG_C_ENCODE_SEL

- 原始字段：`encode_sel`
- UI名称：编码类型选择
- 显示类型：枚举状态
- 截取位置：`word[0]`
- 数据宽度：`1 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `0` | RS | RS 编码/译码 |
| `1` | LDPC | LDPC 编码；需确认 LDPC DCP/source 绑定和 `LDPC_ENCODE_EN` 参数后实际生效 |
| `其它` | 保留/未知 | 当前按低 1 bit 使用 |

### UI_TM_GROUP_CFG_C_BER_INJECT_MODE

- 原始字段：`ber_inject_mode`
- UI名称：误码注入模式
- 显示类型：枚举状态
- 截取位置：`word[3:0]`
- 数据宽度：`4 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `0` | 不注入 | BER 注入模式：不注入 |
| `1` | 轻量误码 | BER 注入模式：轻量误码 |
| `2` | 重度误码 | BER 注入模式：重度误码 |
| `3` | 随机误码 | BER 注入模式：随机误码 |
| `4~15` | 保留/未知 | 当前 RTL 未定义中文含义 |

### UI_TM_GROUP_CFG_C_CRC_ERROR_INJECT

- 原始字段：`crc_error_inject`
- UI名称：CRC 故障注入控制
- 显示类型：枚举状态
- 截取位置：`word[3:0]`
- 数据宽度：`4 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `0` | 不注入 | 故障注入关闭 |
| `1~15` | 注入编码值 | 具体错误模式未在当前 RTL 注释中定义 |

### UI_TM_GROUP_CFG_C_HEADER_ERROR_INJECT

- 原始字段：`header_error_inject`
- UI名称：帧头故障注入控制
- 显示类型：枚举状态
- 截取位置：`word[3:0]`
- 数据宽度：`4 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `0` | 不注入 | 故障注入关闭 |
| `1~15` | 注入编码值 | 具体错误模式未在当前 RTL 注释中定义 |

### UI_TM_GROUP_CFG_C_DATA_TYPE_ERROR_INJECT

- 原始字段：`data_type_error_inject`
- UI名称：数据类型故障注入控制
- 显示类型：枚举状态
- 截取位置：`word[3:0]`
- 数据宽度：`4 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `0` | 不注入 | 故障注入关闭 |
| `1~15` | 注入编码值 | 具体错误模式未在当前 RTL 注释中定义 |

### UI_TM_GROUP_CFG_C_FIELD_POS_ERROR_INJECT

- 原始字段：`field_pos_error_inject`
- UI名称：字段位置故障注入控制
- 显示类型：枚举状态
- 截取位置：`word[3:0]`
- 数据宽度：`4 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `0` | 不注入 | 故障注入关闭 |
| `1~15` | 注入编码值 | 具体错误模式未在当前 RTL 注释中定义 |

### UI_TM_GROUP_CFG_C_ENCODE_ERROR_INJECT

- 原始字段：`encode_error_inject`
- UI名称：编码故障注入控制
- 显示类型：枚举状态
- 截取位置：`word[3:0]`
- 数据宽度：`4 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `0` | 不注入 | 故障注入关闭 |
| `1~15` | 注入编码值 | 具体错误模式未在当前 RTL 注释中定义 |

### UI_TM_GROUP_CFG_C_DATA_LINK_BREAK_INJECT

- 原始字段：`data_link_break_inject`
- UI名称：数据断链异常注入控制
- 显示类型：二值状态
- 截取位置：`word[0]`
- 数据宽度：`1 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `0` | 正常 | 未注入断链异常 |
| `1` | 注入断链 | 注入数据断链异常 |
