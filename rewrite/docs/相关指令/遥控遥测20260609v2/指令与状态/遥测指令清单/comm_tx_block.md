# comm_tx_block 遥测指令清单

## 来源

- 遥测 agent：`D:/vivado_project/CZW/CZW_V7_runner_201803/repo_main/import/rtl_source/comm_tx_block/ctrl_tm/comm_tx_tm_agent.sv`
- module_id：`MODULE_ID_COMM_TX_C = 4'h7`

## Group 总表

### TM_GROUP_RUNTIME_C

| 上报字索引 | 关联字段 | 字段中文名 | 来源表达式 | 字段真实位宽 |
| --- | --- | --- | --- | --- |
| [TM_GROUP_RUNTIME_C_WORD_0](#tm_group_runtime_c_word_0) | `idle_frame_count_sec` | 空闲帧每秒计数 | `stat_i.idle_frame_count_sec` | `32 bit` |
| [TM_GROUP_RUNTIME_C_WORD_1](#tm_group_runtime_c_word_1) | `biz_frame_count_sec` | 业务帧每秒计数 | `stat_i.biz_frame_count_sec` | `32 bit` |
| [TM_GROUP_RUNTIME_C_WORD_2](#tm_group_runtime_c_word_2) | `biz_frame_count_total` | 业务帧累计计数 | `stat_i.biz_frame_count_total` | `32 bit` |
| [TM_GROUP_RUNTIME_C_WORD_3](#tm_group_runtime_c_word_3) | `reset_status` | 复位状态 | `bool_to_u32(stat_i.reset_status)` | `1 bit` |
| [TM_GROUP_RUNTIME_C_WORD_4](#tm_group_runtime_c_word_4) | `ber_inject_mode_status` | 当前误码注入模式状态 | `{28'h0000_000, stat_i.ber_inject_mode_status}` | `4 bit` |
| [TM_GROUP_RUNTIME_C_WORD_5](#tm_group_runtime_c_word_5) | `crc_error_inject_status`<br>`header_error_inject_status`<br>`data_type_error_inject_status`<br>`field_pos_error_inject_status` | 当前 CRC 故障注入状态<br>当前帧头故障注入状态<br>当前数据类型故障注入状态<br>当前字段位置故障注入状态 | `{16'h0000, stat_i.crc_error_inject_status, stat_i.header_error_inject_status, stat_i.data_type_error_inject_status, stat_i.field_pos_error_inject_status}` | `4 bit`<br>`4 bit`<br>`4 bit`<br>`4 bit` |
| [TM_GROUP_RUNTIME_C_WORD_6](#tm_group_runtime_c_word_6) | `encode_error_inject_status`<br>`encode_sel_status` | 当前编码故障注入状态<br>配置编码类型状态 | `{24'h000000, stat_i.encode_error_inject_status, stat_i.encode_sel_status}` | `4 bit`<br>`4 bit` |
| [TM_GROUP_RUNTIME_C_WORD_7](#tm_group_runtime_c_word_7) | `actual_encode_sel_status` | 实际编码类型状态 | `{28'h0000_000, stat_i.actual_encode_sel_status}` | `4 bit` |

### TM_GROUP_CFG_C

| 上报字索引 | 关联字段 | 字段中文名 | 来源表达式 | 字段真实位宽 |
| --- | --- | --- | --- | --- |
| [TM_GROUP_CFG_C_WORD_0](#tm_group_cfg_c_word_0) | `rate_sel` | 发送速率选择 | `{24'h000000, cfg_i.rate_sel}` | `8 bit` |
| [TM_GROUP_CFG_C_WORD_1](#tm_group_cfg_c_word_1) | `scramble_enable` | 扰码使能 | `bool_to_u32(cfg_i.scramble_enable)` | `1 bit` |
| [TM_GROUP_CFG_C_WORD_2](#tm_group_cfg_c_word_2) | `encode_sel` | 编码类型选择 | `bool_to_u32(cfg_i.encode_sel)` | `1 bit` |
| [TM_GROUP_CFG_C_WORD_3](#tm_group_cfg_c_word_3) | `ber_inject_mode` | 误码注入模式 | `{28'h0000_000, cfg_i.ber_inject_mode}` | `4 bit` |
| [TM_GROUP_CFG_C_WORD_4](#tm_group_cfg_c_word_4) | `crc_error_inject` | CRC 故障注入控制 | `{28'h0000_000, cfg_i.crc_error_inject}` | `4 bit` |
| [TM_GROUP_CFG_C_WORD_5](#tm_group_cfg_c_word_5) | `header_error_inject` | 帧头故障注入控制 | `{28'h0000_000, cfg_i.header_error_inject}` | `4 bit` |
| [TM_GROUP_CFG_C_WORD_6](#tm_group_cfg_c_word_6) | `data_type_error_inject` | 数据类型故障注入控制 | `{28'h0000_000, cfg_i.data_type_error_inject}` | `4 bit` |
| [TM_GROUP_CFG_C_WORD_7](#tm_group_cfg_c_word_7) | `field_pos_error_inject` | 字段位置故障注入控制 | `{28'h0000_000, cfg_i.field_pos_error_inject}` | `4 bit` |
| [TM_GROUP_CFG_C_WORD_8](#tm_group_cfg_c_word_8) | `encode_error_inject` | 编码故障注入控制 | `{28'h0000_000, cfg_i.encode_error_inject}` | `4 bit` |
| [TM_GROUP_CFG_C_WORD_9](#tm_group_cfg_c_word_9) | `data_link_break_inject` | 数据断链异常注入控制 | `bool_to_u32(cfg_i.data_link_break_inject)` | `1 bit` |

## 上报字说明表

### TM_GROUP_RUNTIME_C_WORD_0

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字索引 | `0` |
| 来源表达式 | `stat_i.idle_frame_count_sec` |
| 关联字段 | `idle_frame_count_sec` |
| 字段中文名 | 空闲帧每秒计数 |
| 字段真实位宽 | `32 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_RUNTIME_C_WORD_1

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字索引 | `1` |
| 来源表达式 | `stat_i.biz_frame_count_sec` |
| 关联字段 | `biz_frame_count_sec` |
| 字段中文名 | 业务帧每秒计数 |
| 字段真实位宽 | `32 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_RUNTIME_C_WORD_2

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字索引 | `2` |
| 来源表达式 | `stat_i.biz_frame_count_total` |
| 关联字段 | `biz_frame_count_total` |
| 字段中文名 | 业务帧累计计数 |
| 字段真实位宽 | `32 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_RUNTIME_C_WORD_3

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字索引 | `3` |
| 来源表达式 | `bool_to_u32(stat_i.reset_status)` |
| 关联字段 | `reset_status` |
| 字段中文名 | 复位状态 |
| 字段真实位宽 | `1 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_RUNTIME_C_WORD_4

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字索引 | `4` |
| 来源表达式 | `{28'h0000_000, stat_i.ber_inject_mode_status}` |
| 关联字段 | `ber_inject_mode_status` |
| 字段中文名 | 当前误码注入模式状态 |
| 字段真实位宽 | `4 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_RUNTIME_C_WORD_5

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字索引 | `5` |
| 来源表达式 | `{16'h0000, stat_i.crc_error_inject_status, stat_i.header_error_inject_status, stat_i.data_type_error_inject_status, stat_i.field_pos_error_inject_status}` |
| 关联字段 | `crc_error_inject_status`<br>`header_error_inject_status`<br>`data_type_error_inject_status`<br>`field_pos_error_inject_status` |
| 字段中文名 | 当前 CRC 故障注入状态<br>当前帧头故障注入状态<br>当前数据类型故障注入状态<br>当前字段位置故障注入状态 |
| 字段真实位宽 | `4 bit`<br>`4 bit`<br>`4 bit`<br>`4 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_RUNTIME_C_WORD_6

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字索引 | `6` |
| 来源表达式 | `{24'h000000, stat_i.encode_error_inject_status, stat_i.encode_sel_status}` |
| 关联字段 | `encode_error_inject_status`<br>`encode_sel_status` |
| 字段中文名 | 当前编码故障注入状态<br>配置编码类型状态 |
| 字段真实位宽 | `4 bit`<br>`4 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_RUNTIME_C_WORD_7

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字索引 | `7` |
| 来源表达式 | `{28'h0000_000, stat_i.actual_encode_sel_status}` |
| 关联字段 | `actual_encode_sel_status` |
| 字段中文名 | 实际编码类型状态 |
| 字段真实位宽 | `4 bit` |
| 应用层上报字位宽 | `32 bit` |

编码状态回读说明：

| 回读值 | UI显示 | 说明 |
| --- | --- | --- |
| `4'h0` | RS | RS 编码链路 |
| `4'h1` | LDPC | LDPC 编码链路；需确认 LDPC DCP/source 绑定和 `LDPC_ENCODE_EN` 参数后实际生效 |

### TM_GROUP_CFG_C_WORD_0

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_CFG_C` |
| group_id | `8'h81` |
| 上报字索引 | `0` |
| 来源表达式 | `{24'h000000, cfg_i.rate_sel}` |
| 关联字段 | `rate_sel` |
| 字段中文名 | 发送速率选择 |
| 字段真实位宽 | `8 bit` |
| 应用层上报字位宽 | `32 bit` |

| 回读值 | UI显示 | 说明 |
| --- | --- | --- |
| `8'h00` | PSK 312M | 兼容旧编码 |
| `8'h01` | PSK 625M | 兼容旧编码 |
| `8'h02` | PSK 1.25G | 兼容旧编码 |
| `8'h03` | PSK 2.5G | 上电默认 |
| `8'h04` | PSK 5G | 兼容旧编码 |
| `8'h80` | OOK 20M | `rate_sel[7:5]=3'b100` |
| `8'hA0` | OOK 10M | `rate_sel[7:5]=3'b101` |
| `8'hC0` | OOK 1M | `rate_sel[7:5]=3'b110` |

### TM_GROUP_CFG_C_WORD_1

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_CFG_C` |
| group_id | `8'h81` |
| 上报字索引 | `1` |
| 来源表达式 | `bool_to_u32(cfg_i.scramble_enable)` |
| 关联字段 | `scramble_enable` |
| 字段中文名 | 扰码使能 |
| 字段真实位宽 | `1 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_CFG_C_WORD_2

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_CFG_C` |
| group_id | `8'h81` |
| 上报字索引 | `2` |
| 来源表达式 | `bool_to_u32(cfg_i.encode_sel)` |
| 关联字段 | `encode_sel` |
| 字段中文名 | 编码类型选择 |
| 字段真实位宽 | `1 bit` |
| 应用层上报字位宽 | `32 bit` |

| 回读值 | UI显示 | 说明 |
| --- | --- | --- |
| `1'b0` | RS | RS 编码链路，上电默认 |
| `1'b1` | LDPC | LDPC 编码链路；需确认 LDPC DCP/source 绑定和 `LDPC_ENCODE_EN` 参数后实际生效 |

### TM_GROUP_CFG_C_WORD_3

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_CFG_C` |
| group_id | `8'h81` |
| 上报字索引 | `3` |
| 来源表达式 | `{28'h0000_000, cfg_i.ber_inject_mode}` |
| 关联字段 | `ber_inject_mode` |
| 字段中文名 | 误码注入模式 |
| 字段真实位宽 | `4 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_CFG_C_WORD_4

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_CFG_C` |
| group_id | `8'h81` |
| 上报字索引 | `4` |
| 来源表达式 | `{28'h0000_000, cfg_i.crc_error_inject}` |
| 关联字段 | `crc_error_inject` |
| 字段中文名 | CRC 故障注入控制 |
| 字段真实位宽 | `4 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_CFG_C_WORD_5

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_CFG_C` |
| group_id | `8'h81` |
| 上报字索引 | `5` |
| 来源表达式 | `{28'h0000_000, cfg_i.header_error_inject}` |
| 关联字段 | `header_error_inject` |
| 字段中文名 | 帧头故障注入控制 |
| 字段真实位宽 | `4 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_CFG_C_WORD_6

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_CFG_C` |
| group_id | `8'h81` |
| 上报字索引 | `6` |
| 来源表达式 | `{28'h0000_000, cfg_i.data_type_error_inject}` |
| 关联字段 | `data_type_error_inject` |
| 字段中文名 | 数据类型故障注入控制 |
| 字段真实位宽 | `4 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_CFG_C_WORD_7

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_CFG_C` |
| group_id | `8'h81` |
| 上报字索引 | `7` |
| 来源表达式 | `{28'h0000_000, cfg_i.field_pos_error_inject}` |
| 关联字段 | `field_pos_error_inject` |
| 字段中文名 | 字段位置故障注入控制 |
| 字段真实位宽 | `4 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_CFG_C_WORD_8

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_CFG_C` |
| group_id | `8'h81` |
| 上报字索引 | `8` |
| 来源表达式 | `{28'h0000_000, cfg_i.encode_error_inject}` |
| 关联字段 | `encode_error_inject` |
| 字段中文名 | 编码故障注入控制 |
| 字段真实位宽 | `4 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_CFG_C_WORD_9

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_CFG_C` |
| group_id | `8'h81` |
| 上报字索引 | `9` |
| 来源表达式 | `bool_to_u32(cfg_i.data_link_break_inject)` |
| 关联字段 | `data_link_break_inject` |
| 字段中文名 | 数据断链异常注入控制 |
| 字段真实位宽 | `1 bit` |
| 应用层上报字位宽 | `32 bit` |
