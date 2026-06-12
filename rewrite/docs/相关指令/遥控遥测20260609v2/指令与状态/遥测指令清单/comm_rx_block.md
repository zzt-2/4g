# comm_rx_block 遥测指令清单

## 来源

- 遥测 agent：`D:/vivado_project/CZW/CZW_V7_runner_201803/repo_main/import/rtl_source/comm_rx_block/ctrl_tm/comm_rx_tm_agent.sv`
- module_id：`MODULE_ID_COMM_RX_C = 4'h8`

## Group 总表

### TM_GROUP_RUNTIME_C

| 上报字索引 | 关联字段 | 字段中文名 | 来源表达式 | 字段真实位宽 |
| --- | --- | --- | --- | --- |
| [TM_GROUP_RUNTIME_C_WORD_0](#tm_group_runtime_c_word_0) | `signal_power` | 接收信号功率测量值 | `{16'h0000, stat_i.signal_power}` | `16 bit` |
| [TM_GROUP_RUNTIME_C_WORD_1](#tm_group_runtime_c_word_1) | `carrier_freq_offset_est` | 载波频偏粗估计值 | `stat_i.carrier_freq_offset_est` | `32 bit` |
| [TM_GROUP_RUNTIME_C_WORD_2](#tm_group_runtime_c_word_2) | `carrier_lock_state` | 载波锁定状态 | `bool_to_u32(stat_i.carrier_lock_state)` | `1 bit` |
| [TM_GROUP_RUNTIME_C_WORD_3](#tm_group_runtime_c_word_3) | `symbol_lock_state` | 符号锁定状态 | `bool_to_u32(stat_i.symbol_lock_state)` | `1 bit` |
| [TM_GROUP_RUNTIME_C_WORD_4](#tm_group_runtime_c_word_4) | `frame_lock_state` | 帧锁定状态 | `bool_to_u32(stat_i.frame_lock_state)` | `1 bit` |
| [TM_GROUP_RUNTIME_C_WORD_5](#tm_group_runtime_c_word_5) | `frame_count_sec` | 每秒帧总计数 | `stat_i.frame_count_sec` | `32 bit` |
| [TM_GROUP_RUNTIME_C_WORD_6](#tm_group_runtime_c_word_6) | `error_frame_count_sec` | 每秒错误帧计数 | `stat_i.error_frame_count_sec` | `32 bit` |
| [TM_GROUP_RUNTIME_C_WORD_7](#tm_group_runtime_c_word_7) | `air_frame_count_sec` | 每秒空口帧计数 | `stat_i.air_frame_count_sec` | `32 bit` |
| [TM_GROUP_RUNTIME_C_WORD_8](#tm_group_runtime_c_word_8) | `biz_frame_count_sec` | 每秒业务帧计数 | `stat_i.biz_frame_count_sec` | `32 bit` |
| [TM_GROUP_RUNTIME_C_WORD_9](#tm_group_runtime_c_word_9) | `pre_total_bit_count_sec` | 译码前总比特计数 | `stat_i.pre_total_bit_count_sec[63:32]` | `64 bit` |
| [TM_GROUP_RUNTIME_C_WORD_10](#tm_group_runtime_c_word_10) | `pre_total_bit_count_sec` | 译码前总比特计数 | `stat_i.pre_total_bit_count_sec[31:0]` | `64 bit` |
| [TM_GROUP_RUNTIME_C_WORD_11](#tm_group_runtime_c_word_11) | `pre_dec_err_bits_sec` | 译码前误码计数 | `stat_i.pre_dec_err_bits_sec[63:32]` | `64 bit` |
| [TM_GROUP_RUNTIME_C_WORD_12](#tm_group_runtime_c_word_12) | `pre_dec_err_bits_sec` | 译码前误码计数 | `stat_i.pre_dec_err_bits_sec[31:0]` | `64 bit` |
| [TM_GROUP_RUNTIME_C_WORD_13](#tm_group_runtime_c_word_13) | `post_total_bit_count_sec` | 译码后总比特计数 | `stat_i.post_total_bit_count_sec[63:32]` | `64 bit` |
| [TM_GROUP_RUNTIME_C_WORD_14](#tm_group_runtime_c_word_14) | `post_total_bit_count_sec` | 译码后总比特计数 | `stat_i.post_total_bit_count_sec[31:0]` | `64 bit` |
| [TM_GROUP_RUNTIME_C_WORD_15](#tm_group_runtime_c_word_15) | `post_dec_err_bits_sec` | 译码后误码计数 | `stat_i.post_dec_err_bits_sec[63:32]` | `64 bit` |
| [TM_GROUP_RUNTIME_C_WORD_16](#tm_group_runtime_c_word_16) | `post_dec_err_bits_sec` | 译码后误码计数 | `stat_i.post_dec_err_bits_sec[31:0]` | `64 bit` |
| [TM_GROUP_RUNTIME_C_WORD_17](#tm_group_runtime_c_word_17) | `coarse_range_value` | 粗测距值 | `stat_i.coarse_range_value` | `32 bit` |
| [TM_GROUP_RUNTIME_C_WORD_18](#tm_group_runtime_c_word_18) | `fine_range_value` | 细测距值 | `stat_i.fine_range_value` | `32 bit` |
| [TM_GROUP_RUNTIME_C_WORD_19](#tm_group_runtime_c_word_19) | `ranging_reset_status` | 测距复位接受/忙状态 | `bool_to_u32(stat_i.ranging_reset_status)` | `1 bit` |
| [TM_GROUP_RUNTIME_C_WORD_20](#tm_group_runtime_c_word_20) | `manual_reset_status` | 手动接收复位接受/忙状态 | `bool_to_u32(stat_i.manual_reset_status)` | `1 bit` |
| [TM_GROUP_RUNTIME_C_WORD_21](#tm_group_runtime_c_word_21) | `ook_lock_state` | OOK 判决锁定状态 | `bool_to_u32(stat_i.ook_lock_state)` | `1 bit` |

### TM_GROUP_CFG_C

| 上报字索引 | 关联字段 | 字段中文名 | 来源表达式 | 字段真实位宽 |
| --- | --- | --- | --- | --- |
| [TM_GROUP_CFG_C_WORD_0](#tm_group_cfg_c_word_0) | `rate_sel` | 接收链路速率选择寄存值 | `{24'h000000, cfg_i.rate_sel}` | `8 bit` |
| [TM_GROUP_CFG_C_WORD_1](#tm_group_cfg_c_word_1) | `decode_sel` | 解码选择，0=RS，1=LDPC | `bool_to_u32(cfg_i.decode_sel)` | `1 bit` |
| [TM_GROUP_CFG_C_WORD_2](#tm_group_cfg_c_word_2) | `descramble_enable` | 接收解扰使能位 | `bool_to_u32(cfg_i.descramble_enable)` | `1 bit` |
| [TM_GROUP_CFG_C_WORD_3](#tm_group_cfg_c_word_3) | `carrier_filter_enable` | 载波滤波使能位 | `bool_to_u32(cfg_i.carrier_filter_enable)` | `1 bit` |
| [TM_GROUP_CFG_C_WORD_4](#tm_group_cfg_c_word_4) | `timing_loop_bw_sel` | 定时环路带宽选择编码 | `{29'd0, cfg_i.timing_loop_bw_sel}` | `3 bit` |
| [TM_GROUP_CFG_C_WORD_5](#tm_group_cfg_c_word_5) | `timing_filter_enable` | 定时滤波使能位 | `bool_to_u32(cfg_i.timing_filter_enable)` | `1 bit` |
| [TM_GROUP_CFG_C_WORD_6](#tm_group_cfg_c_word_6) | `frame_sync_corr_peak_th` | 帧同步相关峰阈值 | `{25'd0, cfg_i.frame_sync_corr_peak_th}` | `7 bit` |
| [TM_GROUP_CFG_C_WORD_7](#tm_group_cfg_c_word_7) | `frame_lock_threshold` | 帧锁定门限值 | `{16'h0000, cfg_i.frame_lock_threshold}` | `16 bit` |
| [TM_GROUP_CFG_C_WORD_8](#tm_group_cfg_c_word_8) | `frame_unlock_threshold` | 帧失锁门限值 | `{16'h0000, cfg_i.frame_unlock_threshold}` | `16 bit` |
| [TM_GROUP_CFG_C_WORD_9](#tm_group_cfg_c_word_9) | `auto_reset_enable` | 自动复位使能位 | `bool_to_u32(cfg_i.auto_reset_enable)` | `1 bit` |
| [TM_GROUP_CFG_C_WORD_10](#tm_group_cfg_c_word_10) | `loop_enable` | 接收链路环回使能位 | `bool_to_u32(cfg_i.loop_enable)` | `1 bit` |

### TM_GROUP_COMM_RX_IQ_C

| 上报字索引 | 关联字段 | 字段中文名 | 来源表达式 | 字段真实位宽 |
| --- | --- | --- | --- | --- |
| [TM_GROUP_COMM_RX_IQ_C_WORD_0](#tm_group_comm_rx_iq_c_word_0) | `rx_iq_i_data` | I 路遥测采样组 | `stat_i.rx_iq_i_data[191:160]` | `192 bit` |
| [TM_GROUP_COMM_RX_IQ_C_WORD_1](#tm_group_comm_rx_iq_c_word_1) | `rx_iq_i_data` | I 路遥测采样组 | `stat_i.rx_iq_i_data[159:128]` | `192 bit` |
| [TM_GROUP_COMM_RX_IQ_C_WORD_2](#tm_group_comm_rx_iq_c_word_2) | `rx_iq_i_data` | I 路遥测采样组 | `stat_i.rx_iq_i_data[127:96]` | `192 bit` |
| [TM_GROUP_COMM_RX_IQ_C_WORD_3](#tm_group_comm_rx_iq_c_word_3) | `rx_iq_i_data` | I 路遥测采样组 | `stat_i.rx_iq_i_data[95:64]` | `192 bit` |
| [TM_GROUP_COMM_RX_IQ_C_WORD_4](#tm_group_comm_rx_iq_c_word_4) | `rx_iq_i_data` | I 路遥测采样组 | `stat_i.rx_iq_i_data[63:32]` | `192 bit` |
| [TM_GROUP_COMM_RX_IQ_C_WORD_5](#tm_group_comm_rx_iq_c_word_5) | `rx_iq_i_data` | I 路遥测采样组 | `stat_i.rx_iq_i_data[31:0]` | `192 bit` |
| [TM_GROUP_COMM_RX_IQ_C_WORD_6](#tm_group_comm_rx_iq_c_word_6) | `rx_iq_q_data` | Q 路遥测采样组 | `stat_i.rx_iq_q_data[191:160]` | `192 bit` |
| [TM_GROUP_COMM_RX_IQ_C_WORD_7](#tm_group_comm_rx_iq_c_word_7) | `rx_iq_q_data` | Q 路遥测采样组 | `stat_i.rx_iq_q_data[159:128]` | `192 bit` |
| [TM_GROUP_COMM_RX_IQ_C_WORD_8](#tm_group_comm_rx_iq_c_word_8) | `rx_iq_q_data` | Q 路遥测采样组 | `stat_i.rx_iq_q_data[127:96]` | `192 bit` |
| [TM_GROUP_COMM_RX_IQ_C_WORD_9](#tm_group_comm_rx_iq_c_word_9) | `rx_iq_q_data` | Q 路遥测采样组 | `stat_i.rx_iq_q_data[95:64]` | `192 bit` |
| [TM_GROUP_COMM_RX_IQ_C_WORD_10](#tm_group_comm_rx_iq_c_word_10) | `rx_iq_q_data` | Q 路遥测采样组 | `stat_i.rx_iq_q_data[63:32]` | `192 bit` |
| [TM_GROUP_COMM_RX_IQ_C_WORD_11](#tm_group_comm_rx_iq_c_word_11) | `rx_iq_q_data` | Q 路遥测采样组 | `stat_i.rx_iq_q_data[31:0]` | `192 bit` |

## 上报字说明表

### TM_GROUP_RUNTIME_C_WORD_0

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字索引 | `0` |
| 来源表达式 | `{16'h0000, stat_i.signal_power}` |
| 关联字段 | `signal_power` |
| 字段中文名 | 接收信号功率测量值 |
| 字段真实位宽 | `16 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_RUNTIME_C_WORD_1

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字索引 | `1` |
| 来源表达式 | `stat_i.carrier_freq_offset_est` |
| 关联字段 | `carrier_freq_offset_est` |
| 字段中文名 | 载波频偏粗估计值 |
| 字段真实位宽 | `32 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_RUNTIME_C_WORD_2

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字索引 | `2` |
| 来源表达式 | `bool_to_u32(stat_i.carrier_lock_state)` |
| 关联字段 | `carrier_lock_state` |
| 字段中文名 | 载波锁定状态 |
| 字段真实位宽 | `1 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_RUNTIME_C_WORD_3

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字索引 | `3` |
| 来源表达式 | `bool_to_u32(stat_i.symbol_lock_state)` |
| 关联字段 | `symbol_lock_state` |
| 字段中文名 | 符号锁定状态 |
| 字段真实位宽 | `1 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_RUNTIME_C_WORD_4

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字索引 | `4` |
| 来源表达式 | `bool_to_u32(stat_i.frame_lock_state)` |
| 关联字段 | `frame_lock_state` |
| 字段中文名 | 帧锁定状态 |
| 字段真实位宽 | `1 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_RUNTIME_C_WORD_5

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字索引 | `5` |
| 来源表达式 | `stat_i.frame_count_sec` |
| 关联字段 | `frame_count_sec` |
| 字段中文名 | 每秒帧总计数 |
| 字段真实位宽 | `32 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_RUNTIME_C_WORD_6

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字索引 | `6` |
| 来源表达式 | `stat_i.error_frame_count_sec` |
| 关联字段 | `error_frame_count_sec` |
| 字段中文名 | 每秒错误帧计数 |
| 字段真实位宽 | `32 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_RUNTIME_C_WORD_7

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字索引 | `7` |
| 来源表达式 | `stat_i.air_frame_count_sec` |
| 关联字段 | `air_frame_count_sec` |
| 字段中文名 | 每秒空口帧计数 |
| 字段真实位宽 | `32 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_RUNTIME_C_WORD_8

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字索引 | `8` |
| 来源表达式 | `stat_i.biz_frame_count_sec` |
| 关联字段 | `biz_frame_count_sec` |
| 字段中文名 | 每秒业务帧计数 |
| 字段真实位宽 | `32 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_RUNTIME_C_WORD_9

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字索引 | `9` |
| 来源表达式 | `stat_i.pre_total_bit_count_sec[63:32]` |
| 关联字段 | `pre_total_bit_count_sec` |
| 字段中文名 | 译码前总比特计数 |
| 字段真实位宽 | `64 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_RUNTIME_C_WORD_10

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字索引 | `10` |
| 来源表达式 | `stat_i.pre_total_bit_count_sec[31:0]` |
| 关联字段 | `pre_total_bit_count_sec` |
| 字段中文名 | 译码前总比特计数 |
| 字段真实位宽 | `64 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_RUNTIME_C_WORD_11

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字索引 | `11` |
| 来源表达式 | `stat_i.pre_dec_err_bits_sec[63:32]` |
| 关联字段 | `pre_dec_err_bits_sec` |
| 字段中文名 | 译码前误码计数 |
| 字段真实位宽 | `64 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_RUNTIME_C_WORD_12

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字索引 | `12` |
| 来源表达式 | `stat_i.pre_dec_err_bits_sec[31:0]` |
| 关联字段 | `pre_dec_err_bits_sec` |
| 字段中文名 | 译码前误码计数 |
| 字段真实位宽 | `64 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_RUNTIME_C_WORD_13

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字索引 | `13` |
| 来源表达式 | `stat_i.post_total_bit_count_sec[63:32]` |
| 关联字段 | `post_total_bit_count_sec` |
| 字段中文名 | 译码后总比特计数 |
| 字段真实位宽 | `64 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_RUNTIME_C_WORD_14

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字索引 | `14` |
| 来源表达式 | `stat_i.post_total_bit_count_sec[31:0]` |
| 关联字段 | `post_total_bit_count_sec` |
| 字段中文名 | 译码后总比特计数 |
| 字段真实位宽 | `64 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_RUNTIME_C_WORD_15

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字索引 | `15` |
| 来源表达式 | `stat_i.post_dec_err_bits_sec[63:32]` |
| 关联字段 | `post_dec_err_bits_sec` |
| 字段中文名 | 译码后误码计数 |
| 字段真实位宽 | `64 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_RUNTIME_C_WORD_16

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字索引 | `16` |
| 来源表达式 | `stat_i.post_dec_err_bits_sec[31:0]` |
| 关联字段 | `post_dec_err_bits_sec` |
| 字段中文名 | 译码后误码计数 |
| 字段真实位宽 | `64 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_RUNTIME_C_WORD_17

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字索引 | `17` |
| 来源表达式 | `stat_i.coarse_range_value` |
| 关联字段 | `coarse_range_value` |
| 字段中文名 | 粗测距值 |
| 字段真实位宽 | `32 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_RUNTIME_C_WORD_18

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字索引 | `18` |
| 来源表达式 | `stat_i.fine_range_value` |
| 关联字段 | `fine_range_value` |
| 字段中文名 | 细测距值 |
| 字段真实位宽 | `32 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_RUNTIME_C_WORD_19

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字索引 | `19` |
| 来源表达式 | `bool_to_u32(stat_i.ranging_reset_status)` |
| 关联字段 | `ranging_reset_status` |
| 字段中文名 | 测距复位接受/忙状态 |
| 字段真实位宽 | `1 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_RUNTIME_C_WORD_20

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字索引 | `20` |
| 来源表达式 | `bool_to_u32(stat_i.manual_reset_status)` |
| 关联字段 | `manual_reset_status` |
| 字段中文名 | 手动接收复位接受/忙状态 |
| 字段真实位宽 | `1 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_RUNTIME_C_WORD_21

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字索引 | `21` |
| 来源表达式 | `bool_to_u32(stat_i.ook_lock_state)` |
| 关联字段 | `ook_lock_state` |
| 字段中文名 | OOK 判决锁定状态 |
| 字段真实位宽 | `1 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_CFG_C_WORD_0

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_CFG_C` |
| group_id | `8'h81` |
| 上报字索引 | `0` |
| 来源表达式 | `{24'h000000, cfg_i.rate_sel}` |
| 关联字段 | `rate_sel` |
| 字段中文名 | 接收链路速率选择寄存值 |
| 字段真实位宽 | `8 bit` |
| 应用层上报字位宽 | `32 bit` |

| 回读值 | UI显示 | 说明 |
| --- | --- | --- |
| `8'h00` | PSK 312M | 兼容旧编码 |
| `8'h01` | PSK 625M | 兼容旧编码 |
| `8'h02` | PSK 1.25G | 兼容旧编码 |
| `8'h03` | PSK 2.5G | 上电默认 |
| `8'h04` | PSK 5G | 兼容旧编码 |
| `8'h80` | OOK 20M | OOK 接收已接入 20M 判决链路 |
| `8'hA0` | OOK 10M | OOK 接收已接入 10M 判决链路 |
| `8'hC0` | OOK 1M | OOK 1M 速率编码已预留，当前 RTL 未单独实现 1M 判决阈值 |

### TM_GROUP_CFG_C_WORD_1

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_CFG_C` |
| group_id | `8'h81` |
| 上报字索引 | `1` |
| 来源表达式 | `bool_to_u32(cfg_i.decode_sel)` |
| 关联字段 | `decode_sel` |
| 字段中文名 | 解码选择，0=RS，1=LDPC |
| 字段真实位宽 | `1 bit` |
| 应用层上报字位宽 | `32 bit` |

| 回读值 | UI显示 | 说明 |
| --- | --- | --- |
| `1'b0` | RS | RS 译码链路，上电默认 |
| `1'b1` | LDPC | LDPC 译码链路；需确认 LDPC DCP/source 绑定和 `LDPC_DeCode_EN` 参数后实际生效 |

### TM_GROUP_CFG_C_WORD_2

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_CFG_C` |
| group_id | `8'h81` |
| 上报字索引 | `2` |
| 来源表达式 | `bool_to_u32(cfg_i.descramble_enable)` |
| 关联字段 | `descramble_enable` |
| 字段中文名 | 接收解扰使能位 |
| 字段真实位宽 | `1 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_CFG_C_WORD_3

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_CFG_C` |
| group_id | `8'h81` |
| 上报字索引 | `3` |
| 来源表达式 | `bool_to_u32(cfg_i.carrier_filter_enable)` |
| 关联字段 | `carrier_filter_enable` |
| 字段中文名 | 载波滤波使能位 |
| 字段真实位宽 | `1 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_CFG_C_WORD_4

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_CFG_C` |
| group_id | `8'h81` |
| 上报字索引 | `4` |
| 来源表达式 | `{29'd0, cfg_i.timing_loop_bw_sel}` |
| 关联字段 | `timing_loop_bw_sel` |
| 字段中文名 | 定时环路带宽选择编码 |
| 字段真实位宽 | `3 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_CFG_C_WORD_5

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_CFG_C` |
| group_id | `8'h81` |
| 上报字索引 | `5` |
| 来源表达式 | `bool_to_u32(cfg_i.timing_filter_enable)` |
| 关联字段 | `timing_filter_enable` |
| 字段中文名 | 定时滤波使能位 |
| 字段真实位宽 | `1 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_CFG_C_WORD_6

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_CFG_C` |
| group_id | `8'h81` |
| 上报字索引 | `6` |
| 来源表达式 | `{25'd0, cfg_i.frame_sync_corr_peak_th}` |
| 关联字段 | `frame_sync_corr_peak_th` |
| 字段中文名 | 帧同步相关峰阈值 |
| 字段真实位宽 | `7 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_CFG_C_WORD_7

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_CFG_C` |
| group_id | `8'h81` |
| 上报字索引 | `7` |
| 来源表达式 | `{16'h0000, cfg_i.frame_lock_threshold}` |
| 关联字段 | `frame_lock_threshold` |
| 字段中文名 | 帧锁定门限值 |
| 字段真实位宽 | `16 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_CFG_C_WORD_8

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_CFG_C` |
| group_id | `8'h81` |
| 上报字索引 | `8` |
| 来源表达式 | `{16'h0000, cfg_i.frame_unlock_threshold}` |
| 关联字段 | `frame_unlock_threshold` |
| 字段中文名 | 帧失锁门限值 |
| 字段真实位宽 | `16 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_CFG_C_WORD_9

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_CFG_C` |
| group_id | `8'h81` |
| 上报字索引 | `9` |
| 来源表达式 | `bool_to_u32(cfg_i.auto_reset_enable)` |
| 关联字段 | `auto_reset_enable` |
| 字段中文名 | 自动复位使能位 |
| 字段真实位宽 | `1 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_CFG_C_WORD_10

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_CFG_C` |
| group_id | `8'h81` |
| 上报字索引 | `10` |
| 来源表达式 | `bool_to_u32(cfg_i.loop_enable)` |
| 关联字段 | `loop_enable` |
| 字段中文名 | 接收链路环回使能位 |
| 字段真实位宽 | `1 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_COMM_RX_IQ_C_WORD_0

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_COMM_RX_IQ_C` |
| group_id | `8'h82` |
| 上报字索引 | `0` |
| 来源表达式 | `stat_i.rx_iq_i_data[191:160]` |
| 关联字段 | `rx_iq_i_data` |
| 字段中文名 | I 路遥测采样组 |
| 字段真实位宽 | `192 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_COMM_RX_IQ_C_WORD_1

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_COMM_RX_IQ_C` |
| group_id | `8'h82` |
| 上报字索引 | `1` |
| 来源表达式 | `stat_i.rx_iq_i_data[159:128]` |
| 关联字段 | `rx_iq_i_data` |
| 字段中文名 | I 路遥测采样组 |
| 字段真实位宽 | `192 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_COMM_RX_IQ_C_WORD_2

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_COMM_RX_IQ_C` |
| group_id | `8'h82` |
| 上报字索引 | `2` |
| 来源表达式 | `stat_i.rx_iq_i_data[127:96]` |
| 关联字段 | `rx_iq_i_data` |
| 字段中文名 | I 路遥测采样组 |
| 字段真实位宽 | `192 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_COMM_RX_IQ_C_WORD_3

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_COMM_RX_IQ_C` |
| group_id | `8'h82` |
| 上报字索引 | `3` |
| 来源表达式 | `stat_i.rx_iq_i_data[95:64]` |
| 关联字段 | `rx_iq_i_data` |
| 字段中文名 | I 路遥测采样组 |
| 字段真实位宽 | `192 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_COMM_RX_IQ_C_WORD_4

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_COMM_RX_IQ_C` |
| group_id | `8'h82` |
| 上报字索引 | `4` |
| 来源表达式 | `stat_i.rx_iq_i_data[63:32]` |
| 关联字段 | `rx_iq_i_data` |
| 字段中文名 | I 路遥测采样组 |
| 字段真实位宽 | `192 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_COMM_RX_IQ_C_WORD_5

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_COMM_RX_IQ_C` |
| group_id | `8'h82` |
| 上报字索引 | `5` |
| 来源表达式 | `stat_i.rx_iq_i_data[31:0]` |
| 关联字段 | `rx_iq_i_data` |
| 字段中文名 | I 路遥测采样组 |
| 字段真实位宽 | `192 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_COMM_RX_IQ_C_WORD_6

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_COMM_RX_IQ_C` |
| group_id | `8'h82` |
| 上报字索引 | `6` |
| 来源表达式 | `stat_i.rx_iq_q_data[191:160]` |
| 关联字段 | `rx_iq_q_data` |
| 字段中文名 | Q 路遥测采样组 |
| 字段真实位宽 | `192 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_COMM_RX_IQ_C_WORD_7

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_COMM_RX_IQ_C` |
| group_id | `8'h82` |
| 上报字索引 | `7` |
| 来源表达式 | `stat_i.rx_iq_q_data[159:128]` |
| 关联字段 | `rx_iq_q_data` |
| 字段中文名 | Q 路遥测采样组 |
| 字段真实位宽 | `192 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_COMM_RX_IQ_C_WORD_8

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_COMM_RX_IQ_C` |
| group_id | `8'h82` |
| 上报字索引 | `8` |
| 来源表达式 | `stat_i.rx_iq_q_data[127:96]` |
| 关联字段 | `rx_iq_q_data` |
| 字段中文名 | Q 路遥测采样组 |
| 字段真实位宽 | `192 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_COMM_RX_IQ_C_WORD_9

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_COMM_RX_IQ_C` |
| group_id | `8'h82` |
| 上报字索引 | `9` |
| 来源表达式 | `stat_i.rx_iq_q_data[95:64]` |
| 关联字段 | `rx_iq_q_data` |
| 字段中文名 | Q 路遥测采样组 |
| 字段真实位宽 | `192 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_COMM_RX_IQ_C_WORD_10

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_COMM_RX_IQ_C` |
| group_id | `8'h82` |
| 上报字索引 | `10` |
| 来源表达式 | `stat_i.rx_iq_q_data[63:32]` |
| 关联字段 | `rx_iq_q_data` |
| 字段中文名 | Q 路遥测采样组 |
| 字段真实位宽 | `192 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_COMM_RX_IQ_C_WORD_11

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_COMM_RX_IQ_C` |
| group_id | `8'h82` |
| 上报字索引 | `11` |
| 来源表达式 | `stat_i.rx_iq_q_data[31:0]` |
| 关联字段 | `rx_iq_q_data` |
| 字段中文名 | Q 路遥测采样组 |
| 字段真实位宽 | `192 bit` |
| 应用层上报字位宽 | `32 bit` |
