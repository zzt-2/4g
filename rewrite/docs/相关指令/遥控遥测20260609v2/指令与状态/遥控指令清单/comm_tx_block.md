# comm_tx_block 遥控指令清单

## 来源

- 模块目录：`import/rtl_source/comm_tx_block/`
- 遥控包：`D:/vivado_project/CZW/CZW_V7_runner_201803/repo_main/import/rtl_source/comm_tx_block/vars/comm_tx_ctrl_pkg.sv`
- module_id：`MODULE_ID_COMM_TX_C = 4'h7`

## Group 总表

### COMM_TX_CMD_GROUP_MAP_C

| 参数名字 | 参数中文名 | 参数id | 参数类型 | 应用层字数 | 应用层位宽 | 默认值 | 实现层参数名 | 实现层参数id | 实现层字数 | 实现层位宽 | 模块最终落地位宽 | 可选项数量 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [COMM_TX_PARAM_RATE_C](#comm_tx_param_rate_c) | 发送速率选择 | `8'd0` | `PARAM_KIND_VALUE_C` | `WORD_COUNT_SINGLE_C` | `32 bit` | `RATE_SEL_2P5G_C` (`8'd3`，2.5G) | `COMM_TX_IMPL_RATE_C` | `8'd0` | `8'd1` | `32 bit` | `8 bit` | `0` |
| [COMM_TX_PARAM_SCRAMBLE_C](#comm_tx_param_scramble_c) | 扰码使能 | `8'd1` | `PARAM_KIND_VALUE_C` | `WORD_COUNT_SINGLE_C` | `32 bit` | `1'b1` | `COMM_TX_IMPL_SCRAMBLE_C` | `8'd1` | `8'd1` | `32 bit` | `1 bit` | `0` |
| [COMM_TX_PARAM_ENCODE_C](#comm_tx_param_encode_c) | 编码类型选择 | `8'd2` | `PARAM_KIND_VALUE_C` | `WORD_COUNT_SINGLE_C` | `32 bit` | `COMM_TX_ENCODE_RS_C` (`1'b0`) | `COMM_TX_IMPL_ENCODE_C` | `8'd2` | `8'd1` | `32 bit` | `1 bit` | `2` |
| [COMM_TX_PARAM_BER_INJECT_C](#comm_tx_param_ber_inject_c) | 误码注入模式 | `8'd3` | `PARAM_KIND_VALUE_C` | `WORD_COUNT_SINGLE_C` | `32 bit` | `COMM_TX_BER_INJECT_NONE_C` (`4'd0`) | `COMM_TX_IMPL_BER_INJECT_C` | `8'd3` | `8'd1` | `32 bit` | `4 bit` | `0` |
| [COMM_TX_PARAM_CRC_ERROR_C](#comm_tx_param_crc_error_c) | CRC 故障注入控制 | `8'd4` | `PARAM_KIND_VALUE_C` | `WORD_COUNT_SINGLE_C` | `32 bit` | `4'd0` | `COMM_TX_IMPL_CRC_ERROR_C` | `8'd4` | `8'd1` | `32 bit` | `4 bit` | `0` |
| [COMM_TX_PARAM_HEADER_ERROR_C](#comm_tx_param_header_error_c) | 帧头故障注入控制 | `8'd5` | `PARAM_KIND_VALUE_C` | `WORD_COUNT_SINGLE_C` | `32 bit` | `4'd0` | `COMM_TX_IMPL_HEADER_ERROR_C` | `8'd5` | `8'd1` | `32 bit` | `4 bit` | `0` |
| [COMM_TX_PARAM_DATA_TYPE_ERROR_C](#comm_tx_param_data_type_error_c) | 数据类型故障注入控制 | `8'd6` | `PARAM_KIND_VALUE_C` | `WORD_COUNT_SINGLE_C` | `32 bit` | `4'd0` | `COMM_TX_IMPL_DATA_TYPE_ERROR_C` | `8'd6` | `8'd1` | `32 bit` | `4 bit` | `0` |
| [COMM_TX_PARAM_FIELD_POS_ERROR_C](#comm_tx_param_field_pos_error_c) | 字段位置故障注入控制 | `8'd7` | `PARAM_KIND_VALUE_C` | `WORD_COUNT_SINGLE_C` | `32 bit` | `4'd0` | `COMM_TX_IMPL_FIELD_POS_ERROR_C` | `8'd7` | `8'd1` | `32 bit` | `4 bit` | `0` |
| [COMM_TX_PARAM_ENCODE_ERROR_C](#comm_tx_param_encode_error_c) | 编码故障注入控制 | `8'd8` | `PARAM_KIND_VALUE_C` | `WORD_COUNT_SINGLE_C` | `32 bit` | `4'd0` | `COMM_TX_IMPL_ENCODE_ERROR_C` | `8'd8` | `8'd1` | `32 bit` | `4 bit` | `0` |
| [COMM_TX_PARAM_DATA_LINK_BREAK_C](#comm_tx_param_data_link_break_c) | 数据断链异常注入控制 | `8'd11` | `PARAM_KIND_VALUE_C` | `WORD_COUNT_SINGLE_C` | `32 bit` | `1'b0` | `COMM_TX_IMPL_DATA_LINK_BREAK_C` | `8'd11` | `8'd1` | `32 bit` | `1 bit` | `0` |

### COMM_TX_CMD_GROUP_PULSE_RESET_C

| 参数名字 | 参数中文名 | 参数id | 参数类型 | 应用层字数 | 应用层位宽 | 默认值 | 实现层参数名 | 实现层参数id | 实现层字数 | 实现层位宽 | 模块最终落地位宽 | 可选项数量 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [COMM_TX_PARAM_RESET_C](#comm_tx_param_reset_c) | 未标注中文名 | `8'd9` | `PARAM_KIND_PULSE_C` | `WORD_COUNT_ZERO_C` | `0 bit` | 上电默认不触发 | `COMM_TX_IMPL_RESET_C` | `8'd9` | `8'd1` | `32 bit` | 未找到最终落地位宽 | `0` |

### COMM_TX_CMD_GROUP_PULSE_CLEAR_C

| 参数名字 | 参数中文名 | 参数id | 参数类型 | 应用层字数 | 应用层位宽 | 默认值 | 实现层参数名 | 实现层参数id | 实现层字数 | 实现层位宽 | 模块最终落地位宽 | 可选项数量 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [COMM_TX_PARAM_COUNT_CLEAR_C](#comm_tx_param_count_clear_c) | 未标注中文名 | `8'd10` | `PARAM_KIND_PULSE_C` | `WORD_COUNT_ZERO_C` | `0 bit` | 上电默认不触发 | `COMM_TX_IMPL_COUNT_CLEAR_C` | `8'd10` | `8'd1` | `32 bit` | 未找到最终落地位宽 | `0` |

## 参数说明表

### COMM_TX_PARAM_RATE_C

| 字段 | 内容 |
| --- | --- |
| 应用层参数名 | `COMM_TX_PARAM_RATE_C` |
| 应用层参数中文名 | 发送速率选择 |
| 应用层参数 id | `8'd0` |
| 所属 group | `COMM_TX_CMD_GROUP_MAP_C` |
| 参数类型 | `PARAM_KIND_VALUE_C` |
| 应用层字数 | `WORD_COUNT_SINGLE_C` |
| 应用层位宽 | `32 bit` |
| 应用层默认值 | `RATE_SEL_2P5G_C` (`8'd3`，2.5G) |
| 动作类型 | `ACTION_KIND_CFG_WRITE_C` |
| 实现层参数名 | `COMM_TX_IMPL_RATE_C` |
| 实现层参数 id | `8'd0` |
| 实现层字数 | `8'd1` |
| 实现层位宽 | `32 bit` |
| 模块最终落地目标 | `cfg_r.rate_sel` |
| 模块最终落地位宽 | `8 bit` |
| 模块上电默认生效值 | `RATE_SEL_2P5G_C` (`8'd3`，2.5G) |
| 可选项数量 | `0` |
| 映射表 | 无 |
| 来源 pkg 常量 | `COMM_TX_CMD_GROUP_MAP_C`<br>`COMM_TX_PARAM_RATE_C`<br>`COMM_TX_IMPL_RATE_C` |
| 说明 | 应用层参数 `COMM_TX_PARAM_RATE_C` 在组 `COMM_TX_CMD_GROUP_MAP_C` 内通过 `ACTION_KIND_CFG_WRITE_C` 转换到实现层参数 `COMM_TX_IMPL_RATE_C`。 |

| 速率选项 | 写入值 | 说明 |
| --- | --- | --- |
| `RATE_SEL_PSK_312M_C` | `8'h00` | PSK 312M |
| `RATE_SEL_PSK_625M_C` | `8'h01` | PSK 625M |
| `RATE_SEL_PSK_1P25G_C` | `8'h02` | PSK 1.25G |
| `RATE_SEL_PSK_2P5G_C` | `8'h03` | PSK 2.5G，上电默认 |
| `RATE_SEL_PSK_5G_C` | `8'h04` | PSK 5G |
| `RATE_SEL_OOK_20M_C` | `8'h80` | OOK 20M，`rate_sel[7:5]=3'b100` |
| `RATE_SEL_OOK_10M_C` | `8'hA0` | OOK 10M，`rate_sel[7:5]=3'b101` |
| `RATE_SEL_OOK_1M_C` | `8'hC0` | OOK 1M，`rate_sel[7:5]=3'b110` |

### COMM_TX_PARAM_SCRAMBLE_C

| 字段 | 内容 |
| --- | --- |
| 应用层参数名 | `COMM_TX_PARAM_SCRAMBLE_C` |
| 应用层参数中文名 | 扰码使能 |
| 应用层参数 id | `8'd1` |
| 所属 group | `COMM_TX_CMD_GROUP_MAP_C` |
| 参数类型 | `PARAM_KIND_VALUE_C` |
| 应用层字数 | `WORD_COUNT_SINGLE_C` |
| 应用层位宽 | `32 bit` |
| 应用层默认值 | `1'b1` |
| 动作类型 | `ACTION_KIND_CFG_WRITE_C` |
| 实现层参数名 | `COMM_TX_IMPL_SCRAMBLE_C` |
| 实现层参数 id | `8'd1` |
| 实现层字数 | `8'd1` |
| 实现层位宽 | `32 bit` |
| 模块最终落地目标 | `cfg_r.scramble_enable` |
| 模块最终落地位宽 | `1 bit` |
| 模块上电默认生效值 | `1'b1` |
| 可选项数量 | `0` |
| 映射表 | 无 |
| 来源 pkg 常量 | `COMM_TX_CMD_GROUP_MAP_C`<br>`COMM_TX_PARAM_SCRAMBLE_C`<br>`COMM_TX_IMPL_SCRAMBLE_C` |
| 说明 | 应用层参数 `COMM_TX_PARAM_SCRAMBLE_C` 在组 `COMM_TX_CMD_GROUP_MAP_C` 内通过 `ACTION_KIND_CFG_WRITE_C` 转换到实现层参数 `COMM_TX_IMPL_SCRAMBLE_C`。 |

### COMM_TX_PARAM_ENCODE_C

| 字段 | 内容 |
| --- | --- |
| 应用层参数名 | `COMM_TX_PARAM_ENCODE_C` |
| 应用层参数中文名 | 编码类型选择 |
| 应用层参数 id | `8'd2` |
| 所属 group | `COMM_TX_CMD_GROUP_MAP_C` |
| 参数类型 | `PARAM_KIND_VALUE_C` |
| 应用层字数 | `WORD_COUNT_SINGLE_C` |
| 应用层位宽 | `32 bit` |
| 应用层默认值 | `COMM_TX_ENCODE_RS_C` (`1'b0`) |
| 动作类型 | `ACTION_KIND_CFG_WRITE_C` |
| 实现层参数名 | `COMM_TX_IMPL_ENCODE_C` |
| 实现层参数 id | `8'd2` |
| 实现层字数 | `8'd1` |
| 实现层位宽 | `32 bit` |
| 模块最终落地目标 | `cfg_r.encode_sel` |
| 模块最终落地位宽 | `1 bit` |
| 模块上电默认生效值 | `COMM_TX_ENCODE_RS_C` (`1'b0`) |
| 可选项数量 | `2` |
| 映射表 | `0=RS`，`1=LDPC` |
| 来源 pkg 常量 | `COMM_TX_CMD_GROUP_MAP_C`<br>`COMM_TX_PARAM_ENCODE_C`<br>`COMM_TX_IMPL_ENCODE_C` |
| 说明 | 应用层参数 `COMM_TX_PARAM_ENCODE_C` 在组 `COMM_TX_CMD_GROUP_MAP_C` 内通过 `ACTION_KIND_CFG_WRITE_C` 转换到实现层参数 `COMM_TX_IMPL_ENCODE_C`。 |

| 编码选项 | 写入值 | 说明 |
| --- | --- | --- |
| RS | `1'b0` | 选择 RS 编码链路，上电默认 |
| LDPC | `1'b1` | 选择 LDPC 编码链路；当前工程需确认 LDPC DCP/source 绑定和 `LDPC_ENCODE_EN` 参数后才能实际生效 |

### COMM_TX_PARAM_BER_INJECT_C

| 字段 | 内容 |
| --- | --- |
| 应用层参数名 | `COMM_TX_PARAM_BER_INJECT_C` |
| 应用层参数中文名 | 误码注入模式 |
| 应用层参数 id | `8'd3` |
| 所属 group | `COMM_TX_CMD_GROUP_MAP_C` |
| 参数类型 | `PARAM_KIND_VALUE_C` |
| 应用层字数 | `WORD_COUNT_SINGLE_C` |
| 应用层位宽 | `32 bit` |
| 应用层默认值 | `COMM_TX_BER_INJECT_NONE_C` (`4'd0`) |
| 动作类型 | `ACTION_KIND_CFG_WRITE_C` |
| 实现层参数名 | `COMM_TX_IMPL_BER_INJECT_C` |
| 实现层参数 id | `8'd3` |
| 实现层字数 | `8'd1` |
| 实现层位宽 | `32 bit` |
| 模块最终落地目标 | `cfg_r.ber_inject_mode` |
| 模块最终落地位宽 | `4 bit` |
| 模块上电默认生效值 | `COMM_TX_BER_INJECT_NONE_C` (`4'd0`) |
| 可选项数量 | `0` |
| 映射表 | 无 |
| 来源 pkg 常量 | `COMM_TX_CMD_GROUP_MAP_C`<br>`COMM_TX_PARAM_BER_INJECT_C`<br>`COMM_TX_IMPL_BER_INJECT_C` |
| 说明 | 应用层参数 `COMM_TX_PARAM_BER_INJECT_C` 在组 `COMM_TX_CMD_GROUP_MAP_C` 内通过 `ACTION_KIND_CFG_WRITE_C` 转换到实现层参数 `COMM_TX_IMPL_BER_INJECT_C`。 |

### COMM_TX_PARAM_CRC_ERROR_C

| 字段 | 内容 |
| --- | --- |
| 应用层参数名 | `COMM_TX_PARAM_CRC_ERROR_C` |
| 应用层参数中文名 | CRC 故障注入控制 |
| 应用层参数 id | `8'd4` |
| 所属 group | `COMM_TX_CMD_GROUP_MAP_C` |
| 参数类型 | `PARAM_KIND_VALUE_C` |
| 应用层字数 | `WORD_COUNT_SINGLE_C` |
| 应用层位宽 | `32 bit` |
| 应用层默认值 | `4'd0` |
| 动作类型 | `ACTION_KIND_CFG_WRITE_C` |
| 实现层参数名 | `COMM_TX_IMPL_CRC_ERROR_C` |
| 实现层参数 id | `8'd4` |
| 实现层字数 | `8'd1` |
| 实现层位宽 | `32 bit` |
| 模块最终落地目标 | `cfg_r.crc_error_inject` |
| 模块最终落地位宽 | `4 bit` |
| 模块上电默认生效值 | `4'd0` |
| 可选项数量 | `0` |
| 映射表 | 无 |
| 来源 pkg 常量 | `COMM_TX_CMD_GROUP_MAP_C`<br>`COMM_TX_PARAM_CRC_ERROR_C`<br>`COMM_TX_IMPL_CRC_ERROR_C` |
| 说明 | 应用层参数 `COMM_TX_PARAM_CRC_ERROR_C` 在组 `COMM_TX_CMD_GROUP_MAP_C` 内通过 `ACTION_KIND_CFG_WRITE_C` 转换到实现层参数 `COMM_TX_IMPL_CRC_ERROR_C`。 |

### COMM_TX_PARAM_HEADER_ERROR_C

| 字段 | 内容 |
| --- | --- |
| 应用层参数名 | `COMM_TX_PARAM_HEADER_ERROR_C` |
| 应用层参数中文名 | 帧头故障注入控制 |
| 应用层参数 id | `8'd5` |
| 所属 group | `COMM_TX_CMD_GROUP_MAP_C` |
| 参数类型 | `PARAM_KIND_VALUE_C` |
| 应用层字数 | `WORD_COUNT_SINGLE_C` |
| 应用层位宽 | `32 bit` |
| 应用层默认值 | `4'd0` |
| 动作类型 | `ACTION_KIND_CFG_WRITE_C` |
| 实现层参数名 | `COMM_TX_IMPL_HEADER_ERROR_C` |
| 实现层参数 id | `8'd5` |
| 实现层字数 | `8'd1` |
| 实现层位宽 | `32 bit` |
| 模块最终落地目标 | `cfg_r.header_error_inject` |
| 模块最终落地位宽 | `4 bit` |
| 模块上电默认生效值 | `4'd0` |
| 可选项数量 | `0` |
| 映射表 | 无 |
| 来源 pkg 常量 | `COMM_TX_CMD_GROUP_MAP_C`<br>`COMM_TX_PARAM_HEADER_ERROR_C`<br>`COMM_TX_IMPL_HEADER_ERROR_C` |
| 说明 | 应用层参数 `COMM_TX_PARAM_HEADER_ERROR_C` 在组 `COMM_TX_CMD_GROUP_MAP_C` 内通过 `ACTION_KIND_CFG_WRITE_C` 转换到实现层参数 `COMM_TX_IMPL_HEADER_ERROR_C`。 |

### COMM_TX_PARAM_DATA_TYPE_ERROR_C

| 字段 | 内容 |
| --- | --- |
| 应用层参数名 | `COMM_TX_PARAM_DATA_TYPE_ERROR_C` |
| 应用层参数中文名 | 数据类型故障注入控制 |
| 应用层参数 id | `8'd6` |
| 所属 group | `COMM_TX_CMD_GROUP_MAP_C` |
| 参数类型 | `PARAM_KIND_VALUE_C` |
| 应用层字数 | `WORD_COUNT_SINGLE_C` |
| 应用层位宽 | `32 bit` |
| 应用层默认值 | `4'd0` |
| 动作类型 | `ACTION_KIND_CFG_WRITE_C` |
| 实现层参数名 | `COMM_TX_IMPL_DATA_TYPE_ERROR_C` |
| 实现层参数 id | `8'd6` |
| 实现层字数 | `8'd1` |
| 实现层位宽 | `32 bit` |
| 模块最终落地目标 | `cfg_r.data_type_error_inject` |
| 模块最终落地位宽 | `4 bit` |
| 模块上电默认生效值 | `4'd0` |
| 可选项数量 | `0` |
| 映射表 | 无 |
| 来源 pkg 常量 | `COMM_TX_CMD_GROUP_MAP_C`<br>`COMM_TX_PARAM_DATA_TYPE_ERROR_C`<br>`COMM_TX_IMPL_DATA_TYPE_ERROR_C` |
| 说明 | 应用层参数 `COMM_TX_PARAM_DATA_TYPE_ERROR_C` 在组 `COMM_TX_CMD_GROUP_MAP_C` 内通过 `ACTION_KIND_CFG_WRITE_C` 转换到实现层参数 `COMM_TX_IMPL_DATA_TYPE_ERROR_C`。 |

### COMM_TX_PARAM_FIELD_POS_ERROR_C

| 字段 | 内容 |
| --- | --- |
| 应用层参数名 | `COMM_TX_PARAM_FIELD_POS_ERROR_C` |
| 应用层参数中文名 | 字段位置故障注入控制 |
| 应用层参数 id | `8'd7` |
| 所属 group | `COMM_TX_CMD_GROUP_MAP_C` |
| 参数类型 | `PARAM_KIND_VALUE_C` |
| 应用层字数 | `WORD_COUNT_SINGLE_C` |
| 应用层位宽 | `32 bit` |
| 应用层默认值 | `4'd0` |
| 动作类型 | `ACTION_KIND_CFG_WRITE_C` |
| 实现层参数名 | `COMM_TX_IMPL_FIELD_POS_ERROR_C` |
| 实现层参数 id | `8'd7` |
| 实现层字数 | `8'd1` |
| 实现层位宽 | `32 bit` |
| 模块最终落地目标 | `cfg_r.field_pos_error_inject` |
| 模块最终落地位宽 | `4 bit` |
| 模块上电默认生效值 | `4'd0` |
| 可选项数量 | `0` |
| 映射表 | 无 |
| 来源 pkg 常量 | `COMM_TX_CMD_GROUP_MAP_C`<br>`COMM_TX_PARAM_FIELD_POS_ERROR_C`<br>`COMM_TX_IMPL_FIELD_POS_ERROR_C` |
| 说明 | 应用层参数 `COMM_TX_PARAM_FIELD_POS_ERROR_C` 在组 `COMM_TX_CMD_GROUP_MAP_C` 内通过 `ACTION_KIND_CFG_WRITE_C` 转换到实现层参数 `COMM_TX_IMPL_FIELD_POS_ERROR_C`。 |

### COMM_TX_PARAM_ENCODE_ERROR_C

| 字段 | 内容 |
| --- | --- |
| 应用层参数名 | `COMM_TX_PARAM_ENCODE_ERROR_C` |
| 应用层参数中文名 | 编码故障注入控制 |
| 应用层参数 id | `8'd8` |
| 所属 group | `COMM_TX_CMD_GROUP_MAP_C` |
| 参数类型 | `PARAM_KIND_VALUE_C` |
| 应用层字数 | `WORD_COUNT_SINGLE_C` |
| 应用层位宽 | `32 bit` |
| 应用层默认值 | `4'd0` |
| 动作类型 | `ACTION_KIND_CFG_WRITE_C` |
| 实现层参数名 | `COMM_TX_IMPL_ENCODE_ERROR_C` |
| 实现层参数 id | `8'd8` |
| 实现层字数 | `8'd1` |
| 实现层位宽 | `32 bit` |
| 模块最终落地目标 | `cfg_r.encode_error_inject` |
| 模块最终落地位宽 | `4 bit` |
| 模块上电默认生效值 | `4'd0` |
| 可选项数量 | `0` |
| 映射表 | 无 |
| 来源 pkg 常量 | `COMM_TX_CMD_GROUP_MAP_C`<br>`COMM_TX_PARAM_ENCODE_ERROR_C`<br>`COMM_TX_IMPL_ENCODE_ERROR_C` |
| 说明 | 应用层参数 `COMM_TX_PARAM_ENCODE_ERROR_C` 在组 `COMM_TX_CMD_GROUP_MAP_C` 内通过 `ACTION_KIND_CFG_WRITE_C` 转换到实现层参数 `COMM_TX_IMPL_ENCODE_ERROR_C`。 |

### COMM_TX_PARAM_DATA_LINK_BREAK_C

| 字段 | 内容 |
| --- | --- |
| 应用层参数名 | `COMM_TX_PARAM_DATA_LINK_BREAK_C` |
| 应用层参数中文名 | 数据断链异常注入控制 |
| 应用层参数 id | `8'd11` |
| 所属 group | `COMM_TX_CMD_GROUP_MAP_C` |
| 参数类型 | `PARAM_KIND_VALUE_C` |
| 应用层字数 | `WORD_COUNT_SINGLE_C` |
| 应用层位宽 | `32 bit` |
| 应用层默认值 | `1'b0` |
| 动作类型 | `ACTION_KIND_CFG_WRITE_C` |
| 实现层参数名 | `COMM_TX_IMPL_DATA_LINK_BREAK_C` |
| 实现层参数 id | `8'd11` |
| 实现层字数 | `8'd1` |
| 实现层位宽 | `32 bit` |
| 模块最终落地目标 | `cfg_r.data_link_break_inject` |
| 模块最终落地位宽 | `1 bit` |
| 模块上电默认生效值 | `1'b0` |
| 可选项数量 | `0` |
| 映射表 | 无 |
| 来源 pkg 常量 | `COMM_TX_CMD_GROUP_MAP_C`<br>`COMM_TX_PARAM_DATA_LINK_BREAK_C`<br>`COMM_TX_IMPL_DATA_LINK_BREAK_C` |
| 说明 | 应用层参数 `COMM_TX_PARAM_DATA_LINK_BREAK_C` 在组 `COMM_TX_CMD_GROUP_MAP_C` 内通过 `ACTION_KIND_CFG_WRITE_C` 转换到实现层参数 `COMM_TX_IMPL_DATA_LINK_BREAK_C`。 |

### COMM_TX_PARAM_RESET_C

| 字段 | 内容 |
| --- | --- |
| 应用层参数名 | `COMM_TX_PARAM_RESET_C` |
| 应用层参数中文名 | 未标注中文名 |
| 应用层参数 id | `8'd9` |
| 所属 group | `COMM_TX_CMD_GROUP_PULSE_RESET_C` |
| 参数类型 | `PARAM_KIND_PULSE_C` |
| 应用层字数 | `WORD_COUNT_ZERO_C` |
| 应用层位宽 | `0 bit` |
| 应用层默认值 | 上电默认不触发 |
| 动作类型 | `ACTION_KIND_PULSE_C` |
| 实现层参数名 | `COMM_TX_IMPL_RESET_C` |
| 实现层参数 id | `8'd9` |
| 实现层字数 | `8'd1` |
| 实现层位宽 | `32 bit` |
| 模块最终落地目标 | 未找到最终落地目标 |
| 模块最终落地位宽 | 未找到最终落地位宽 |
| 模块上电默认生效值 | `0`（脉冲不触发） |
| 可选项数量 | `0` |
| 映射表 | 无 |
| 来源 pkg 常量 | `COMM_TX_CMD_GROUP_PULSE_RESET_C`<br>`COMM_TX_PARAM_RESET_C`<br>`COMM_TX_IMPL_RESET_C` |
| 说明 | 应用层参数 `COMM_TX_PARAM_RESET_C` 在组 `COMM_TX_CMD_GROUP_PULSE_RESET_C` 内通过 `ACTION_KIND_PULSE_C` 转换到实现层参数 `COMM_TX_IMPL_RESET_C`。 |

### COMM_TX_PARAM_COUNT_CLEAR_C

| 字段 | 内容 |
| --- | --- |
| 应用层参数名 | `COMM_TX_PARAM_COUNT_CLEAR_C` |
| 应用层参数中文名 | 未标注中文名 |
| 应用层参数 id | `8'd10` |
| 所属 group | `COMM_TX_CMD_GROUP_PULSE_CLEAR_C` |
| 参数类型 | `PARAM_KIND_PULSE_C` |
| 应用层字数 | `WORD_COUNT_ZERO_C` |
| 应用层位宽 | `0 bit` |
| 应用层默认值 | 上电默认不触发 |
| 动作类型 | `ACTION_KIND_PULSE_C` |
| 实现层参数名 | `COMM_TX_IMPL_COUNT_CLEAR_C` |
| 实现层参数 id | `8'd10` |
| 实现层字数 | `8'd1` |
| 实现层位宽 | `32 bit` |
| 模块最终落地目标 | 未找到最终落地目标 |
| 模块最终落地位宽 | 未找到最终落地位宽 |
| 模块上电默认生效值 | `0`（脉冲不触发） |
| 可选项数量 | `0` |
| 映射表 | 无 |
| 来源 pkg 常量 | `COMM_TX_CMD_GROUP_PULSE_CLEAR_C`<br>`COMM_TX_PARAM_COUNT_CLEAR_C`<br>`COMM_TX_IMPL_COUNT_CLEAR_C` |
| 说明 | 应用层参数 `COMM_TX_PARAM_COUNT_CLEAR_C` 在组 `COMM_TX_CMD_GROUP_PULSE_CLEAR_C` 内通过 `ACTION_KIND_PULSE_C` 转换到实现层参数 `COMM_TX_IMPL_COUNT_CLEAR_C`。 |
