# comm_tx_block 遥测状态具体执行

说明：以下遥测帧示例统一按“所有上报数据字为 0”计算，不使用模块 `default_cfg()` 的默认配置值。

## TM_GROUP_RUNTIME_C

| 字段 | 内容 |
| --- | --- |
| module_id | `MODULE_ID_COMM_TX_C = 4'h7` |
| group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字数常量 | `TM_RUNTIME_WORDS_C` |
| 上报字数 | `8` |
| 应用层头字 | `12780080` |
| 校验字 | `2D47FCC1` |
| 完整字节流 | `1A CF FC 1D 00 00 00 24 12 78 00 80 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 2D 47 FC C1` |

| 上报字索引 | 来源表达式 | 关联字段 | 字段真实位宽 | 默认值 |
| --- | --- | --- | --- | --- |
| `0` | `stat_i.idle_frame_count_sec` | `idle_frame_count_sec` | `32 bit` | `00000000` |
| `1` | `stat_i.biz_frame_count_sec` | `biz_frame_count_sec` | `32 bit` | `00000000` |
| `2` | `stat_i.biz_frame_count_total` | `biz_frame_count_total` | `32 bit` | `00000000` |
| `3` | `bool_to_u32(stat_i.reset_status)` | `reset_status` | `1 bit` | `00000000` |
| `4` | `{28'h0000_000, stat_i.ber_inject_mode_status}` | `ber_inject_mode_status` | `4 bit` | `00000000` |
| `5` | `{16'h0000, stat_i.crc_error_inject_status, stat_i.header_error_inject_status, stat_i.data_type_error_inject_status, stat_i.field_pos_error_inject_status}` | `crc_error_inject_status`<br>`header_error_inject_status`<br>`data_type_error_inject_status`<br>`field_pos_error_inject_status` | `4 bit`<br>`4 bit`<br>`4 bit`<br>`4 bit` | `00000000` |
| `6` | `{24'h000000, stat_i.encode_error_inject_status, stat_i.encode_sel_status}` | `encode_error_inject_status`<br>`encode_sel_status` | `4 bit`<br>`4 bit` | `00000000` |
| `7` | `{28'h0000_000, stat_i.actual_encode_sel_status}` | `actual_encode_sel_status` | `4 bit` | `00000000` |

| 帧字序号 | 含义 | 32bit 值 |
| --- | --- | --- |
| 0 | RS422 帧头 | `1ACFFC1D` |
| 1 | payload_length_bytes | `00000024` |
| 2 | 应用层头 | `12780080` |
| 3 | 遥测数据字 0 | `00000000` |
| 4 | 遥测数据字 1 | `00000000` |
| 5 | 遥测数据字 2 | `00000000` |
| 6 | 遥测数据字 3 | `00000000` |
| 7 | 遥测数据字 4 | `00000000` |
| 8 | 遥测数据字 5 | `00000000` |
| 9 | 遥测数据字 6 | `00000000` |
| 10 | 遥测数据字 7 | `00000000` |
| 11 | checksum | `2D47FCC1` |

## TM_GROUP_CFG_C

| 字段 | 内容 |
| --- | --- |
| module_id | `MODULE_ID_COMM_TX_C = 4'h7` |
| group | `TM_GROUP_CFG_C` |
| group_id | `8'h81` |
| 上报字数常量 | `TM_CFG_WORDS_C` |
| 上报字数 | `10` |
| 应用层头字 | `127810A0` |
| 校验字 | `2D480CE9` |
| 完整字节流 | `1A CF FC 1D 00 00 00 2C 12 78 10 A0 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 2D 48 0C E9` |

| 上报字索引 | 来源表达式 | 关联字段 | 字段真实位宽 | 默认值 |
| --- | --- | --- | --- | --- |
| `0` | `{24'h000000, cfg_i.rate_sel}` | `rate_sel` | `8 bit` | `00000000` |
| `1` | `bool_to_u32(cfg_i.scramble_enable)` | `scramble_enable` | `1 bit` | `00000000` |
| `2` | `bool_to_u32(cfg_i.encode_sel)` | `encode_sel` | `1 bit` | `00000000` |
| `3` | `{28'h0000_000, cfg_i.ber_inject_mode}` | `ber_inject_mode` | `4 bit` | `00000000` |
| `4` | `{28'h0000_000, cfg_i.crc_error_inject}` | `crc_error_inject` | `4 bit` | `00000000` |
| `5` | `{28'h0000_000, cfg_i.header_error_inject}` | `header_error_inject` | `4 bit` | `00000000` |
| `6` | `{28'h0000_000, cfg_i.data_type_error_inject}` | `data_type_error_inject` | `4 bit` | `00000000` |
| `7` | `{28'h0000_000, cfg_i.field_pos_error_inject}` | `field_pos_error_inject` | `4 bit` | `00000000` |
| `8` | `{28'h0000_000, cfg_i.encode_error_inject}` | `encode_error_inject` | `4 bit` | `00000000` |
| `9` | `bool_to_u32(cfg_i.data_link_break_inject)` | `data_link_break_inject` | `1 bit` | `00000000` |

`rate_sel` 回读显示：`8'h00/01/02/03/04` 分别为 PSK 312M/625M/1.25G/2.5G/5G；`8'h80` 为 OOK 20M，`8'hA0` 为 OOK 10M，`8'hC0` 为 OOK 1M。

`encode_sel` 回读显示：`1'b0` 为 RS，`1'b1` 为 LDPC；LDPC 编码需要确认 LDPC DCP/source 绑定和 `LDPC_ENCODE_EN` 参数后才能实际生效。

| 帧字序号 | 含义 | 32bit 值 |
| --- | --- | --- |
| 0 | RS422 帧头 | `1ACFFC1D` |
| 1 | payload_length_bytes | `0000002C` |
| 2 | 应用层头 | `127810A0` |
| 3 | 遥测数据字 0 | `00000000` |
| 4 | 遥测数据字 1 | `00000000` |
| 5 | 遥测数据字 2 | `00000000` |
| 6 | 遥测数据字 3 | `00000000` |
| 7 | 遥测数据字 4 | `00000000` |
| 8 | 遥测数据字 5 | `00000000` |
| 9 | 遥测数据字 6 | `00000000` |
| 10 | 遥测数据字 7 | `00000000` |
| 11 | 遥测数据字 8 | `00000000` |
| 12 | 遥测数据字 9 | `00000000` |
| 13 | checksum | `2D480CE9` |
