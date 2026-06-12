# comm_rx_block 遥测状态具体执行

说明：以下遥测帧示例统一按“所有上报数据字为 0”计算，不使用模块 `default_cfg()` 的默认配置值。

## TM_GROUP_RUNTIME_C

| 字段 | 内容 |
| --- | --- |
| module_id | `MODULE_ID_COMM_RX_C = 4'h8` |
| group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字数常量 | `TM_RUNTIME_WORDS_C` |
| 上报字数 | `22` |
| 应用层头字 | `12880160` |
| 校验字 | `2D57FDD9` |
| 完整字节流 | `1A CF FC 1D 00 00 00 5C 12 88 01 60 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 2D 57 FD D9` |

| 上报字索引 | 来源表达式 | 关联字段 | 字段真实位宽 | 默认值 |
| --- | --- | --- | --- | --- |
| `0` | `{16'h0000, stat_i.signal_power}` | `signal_power` | `16 bit` | `00000000` |
| `1` | `stat_i.carrier_freq_offset_est` | `carrier_freq_offset_est` | `32 bit` | `00000000` |
| `2` | `bool_to_u32(stat_i.carrier_lock_state)` | `carrier_lock_state` | `1 bit` | `00000000` |
| `3` | `bool_to_u32(stat_i.symbol_lock_state)` | `symbol_lock_state` | `1 bit` | `00000000` |
| `4` | `bool_to_u32(stat_i.frame_lock_state)` | `frame_lock_state` | `1 bit` | `00000000` |
| `5` | `stat_i.frame_count_sec` | `frame_count_sec` | `32 bit` | `00000000` |
| `6` | `stat_i.error_frame_count_sec` | `error_frame_count_sec` | `32 bit` | `00000000` |
| `7` | `stat_i.air_frame_count_sec` | `air_frame_count_sec` | `32 bit` | `00000000` |
| `8` | `stat_i.biz_frame_count_sec` | `biz_frame_count_sec` | `32 bit` | `00000000` |
| `9` | `stat_i.pre_total_bit_count_sec[63:32]` | `pre_total_bit_count_sec` | `64 bit` | `00000000` |
| `10` | `stat_i.pre_total_bit_count_sec[31:0]` | `pre_total_bit_count_sec` | `64 bit` | `00000000` |
| `11` | `stat_i.pre_dec_err_bits_sec[63:32]` | `pre_dec_err_bits_sec` | `64 bit` | `00000000` |
| `12` | `stat_i.pre_dec_err_bits_sec[31:0]` | `pre_dec_err_bits_sec` | `64 bit` | `00000000` |
| `13` | `stat_i.post_total_bit_count_sec[63:32]` | `post_total_bit_count_sec` | `64 bit` | `00000000` |
| `14` | `stat_i.post_total_bit_count_sec[31:0]` | `post_total_bit_count_sec` | `64 bit` | `00000000` |
| `15` | `stat_i.post_dec_err_bits_sec[63:32]` | `post_dec_err_bits_sec` | `64 bit` | `00000000` |
| `16` | `stat_i.post_dec_err_bits_sec[31:0]` | `post_dec_err_bits_sec` | `64 bit` | `00000000` |
| `17` | `stat_i.coarse_range_value` | `coarse_range_value` | `32 bit` | `00000000` |
| `18` | `stat_i.fine_range_value` | `fine_range_value` | `32 bit` | `00000000` |
| `19` | `bool_to_u32(stat_i.ranging_reset_status)` | `ranging_reset_status` | `1 bit` | `00000000` |
| `20` | `bool_to_u32(stat_i.manual_reset_status)` | `manual_reset_status` | `1 bit` | `00000000` |
| `21` | `bool_to_u32(stat_i.ook_lock_state)` | `ook_lock_state` | `1 bit` | `00000000` |

| 帧字序号 | 含义 | 32bit 值 |
| --- | --- | --- |
| 0 | RS422 帧头 | `1ACFFC1D` |
| 1 | payload_length_bytes | `0000005C` |
| 2 | 应用层头 | `12880160` |
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
| 13 | 遥测数据字 10 | `00000000` |
| 14 | 遥测数据字 11 | `00000000` |
| 15 | 遥测数据字 12 | `00000000` |
| 16 | 遥测数据字 13 | `00000000` |
| 17 | 遥测数据字 14 | `00000000` |
| 18 | 遥测数据字 15 | `00000000` |
| 19 | 遥测数据字 16 | `00000000` |
| 20 | 遥测数据字 17 | `00000000` |
| 21 | 遥测数据字 18 | `00000000` |
| 22 | 遥测数据字 19 | `00000000` |
| 23 | 遥测数据字 20 | `00000000` |
| 24 | 遥测数据字 21 | `00000000` |
| 25 | checksum | `2D57FDD9` |

## TM_GROUP_CFG_C

| 字段 | 内容 |
| --- | --- |
| module_id | `MODULE_ID_COMM_RX_C = 4'h8` |
| group | `TM_GROUP_CFG_C` |
| group_id | `8'h81` |
| 上报字数常量 | `TM_CFG_WORDS_C` |
| 上报字数 | `11` |
| 应用层头字 | `128810B0` |
| 校验字 | `2D580CFD` |
| 完整字节流 | `1A CF FC 1D 00 00 00 30 12 88 10 B0 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 2D 58 0C FD` |

| 上报字索引 | 来源表达式 | 关联字段 | 字段真实位宽 | 默认值 |
| --- | --- | --- | --- | --- |
| `0` | `{24'h000000, cfg_i.rate_sel}` | `rate_sel` | `8 bit` | `00000000` |
| `1` | `bool_to_u32(cfg_i.decode_sel)` | `decode_sel` | `1 bit` | `00000000` |
| `2` | `bool_to_u32(cfg_i.descramble_enable)` | `descramble_enable` | `1 bit` | `00000000` |
| `3` | `bool_to_u32(cfg_i.carrier_filter_enable)` | `carrier_filter_enable` | `1 bit` | `00000000` |
| `4` | `{29'd0, cfg_i.timing_loop_bw_sel}` | `timing_loop_bw_sel` | `3 bit` | `00000000` |
| `5` | `bool_to_u32(cfg_i.timing_filter_enable)` | `timing_filter_enable` | `1 bit` | `00000000` |
| `6` | `{25'd0, cfg_i.frame_sync_corr_peak_th}` | `frame_sync_corr_peak_th` | `7 bit` | `00000000` |
| `7` | `{16'h0000, cfg_i.frame_lock_threshold}` | `frame_lock_threshold` | `16 bit` | `00000000` |
| `8` | `{16'h0000, cfg_i.frame_unlock_threshold}` | `frame_unlock_threshold` | `16 bit` | `00000000` |
| `9` | `bool_to_u32(cfg_i.auto_reset_enable)` | `auto_reset_enable` | `1 bit` | `00000000` |
| `10` | `bool_to_u32(cfg_i.loop_enable)` | `loop_enable` | `1 bit` | `00000000` |

`rate_sel` 回读显示：`8'h00/01/02/03/04` 分别为 PSK 312M/625M/1.25G/2.5G/5G；`8'h80` 为 OOK 20M，`8'hA0` 为 OOK 10M，`8'hC0` 为 OOK 1M。接收端 OOK 20M/10M 当前已接入判决链路和 `ook_lock_state` 遥测；OOK 1M 仅保留速率编码，当前 RTL 未单独实现 1M 判决阈值。

`decode_sel` 回读显示：`1'b0` 为 RS，`1'b1` 为 LDPC；LDPC 译码需要确认 LDPC DCP/source 绑定和 `LDPC_DeCode_EN` 参数后才能实际生效。

| 帧字序号 | 含义 | 32bit 值 |
| --- | --- | --- |
| 0 | RS422 帧头 | `1ACFFC1D` |
| 1 | payload_length_bytes | `00000030` |
| 2 | 应用层头 | `128810B0` |
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
| 13 | 遥测数据字 10 | `00000000` |
| 14 | checksum | `2D580CFD` |

## TM_GROUP_COMM_RX_IQ_C

| 字段 | 内容 |
| --- | --- |
| module_id | `MODULE_ID_COMM_RX_C = 4'h8` |
| group | `TM_GROUP_COMM_RX_IQ_C` |
| group_id | `8'h82` |
| 上报字数常量 | `TM_IQ_WORDS_C` |
| 上报字数 | `12` |
| 应用层头字 | `128820C0` |
| 校验字 | `2D581D11` |
| 完整字节流 | `1A CF FC 1D 00 00 00 34 12 88 20 C0 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 2D 58 1D 11` |

| 上报字索引 | 来源表达式 | 关联字段 | 字段真实位宽 | 默认值 |
| --- | --- | --- | --- | --- |
| `0` | `stat_i.rx_iq_i_data[191:160]` | `rx_iq_i_data` | `192 bit` | `00000000` |
| `1` | `stat_i.rx_iq_i_data[159:128]` | `rx_iq_i_data` | `192 bit` | `00000000` |
| `2` | `stat_i.rx_iq_i_data[127:96]` | `rx_iq_i_data` | `192 bit` | `00000000` |
| `3` | `stat_i.rx_iq_i_data[95:64]` | `rx_iq_i_data` | `192 bit` | `00000000` |
| `4` | `stat_i.rx_iq_i_data[63:32]` | `rx_iq_i_data` | `192 bit` | `00000000` |
| `5` | `stat_i.rx_iq_i_data[31:0]` | `rx_iq_i_data` | `192 bit` | `00000000` |
| `6` | `stat_i.rx_iq_q_data[191:160]` | `rx_iq_q_data` | `192 bit` | `00000000` |
| `7` | `stat_i.rx_iq_q_data[159:128]` | `rx_iq_q_data` | `192 bit` | `00000000` |
| `8` | `stat_i.rx_iq_q_data[127:96]` | `rx_iq_q_data` | `192 bit` | `00000000` |
| `9` | `stat_i.rx_iq_q_data[95:64]` | `rx_iq_q_data` | `192 bit` | `00000000` |
| `10` | `stat_i.rx_iq_q_data[63:32]` | `rx_iq_q_data` | `192 bit` | `00000000` |
| `11` | `stat_i.rx_iq_q_data[31:0]` | `rx_iq_q_data` | `192 bit` | `00000000` |

| 帧字序号 | 含义 | 32bit 值 |
| --- | --- | --- |
| 0 | RS422 帧头 | `1ACFFC1D` |
| 1 | payload_length_bytes | `00000034` |
| 2 | 应用层头 | `128820C0` |
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
| 13 | 遥测数据字 10 | `00000000` |
| 14 | 遥测数据字 11 | `00000000` |
| 15 | checksum | `2D581D11` |
