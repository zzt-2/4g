# comm_rx_block 遥测 UI 字段定义

- 来源：`import/rtl_source/comm_rx_block/vars/*_ctrl_pkg.sv` 和 `指令与状态/遥测指令清单/comm_rx_block.md`
- word 列表示遥测 payload 数据字索引，不包含 RS422 帧头、长度字、应用层头和 checksum。
- 对于 64bit/192bit 这类跨 word 字段，表中会按每个 32bit 分片列出，软件按字段切片说明重组。

## TM_GROUP_RUNTIME_C

- group_id：`8'h80`

| 参数原始字段名 | UI显示名称 | word | 索引位宽 | 有符号/无符号 | UI类型 | 参数表格索引 |
| --- | --- | --- | --- | --- | --- | --- |
| `signal_power` | 接收信号功率测量值 | `0` | `word[15:0]` | 无符号数 | 显示 | [UI_TM_GROUP_RUNTIME_C_SIGNAL_POWER](#ui_tm_group_runtime_c_signal_power) |
| `carrier_freq_offset_est` | 载波频偏粗估计值 | `1` | `word[31:0]` | 有符号数 | 显示 | [UI_TM_GROUP_RUNTIME_C_CARRIER_FREQ_OFFSET_EST](#ui_tm_group_runtime_c_carrier_freq_offset_est) |
| `carrier_lock_state` | 载波锁定状态 | `2` | `word[0]` | 无符号数 | 显示 | [UI_TM_GROUP_RUNTIME_C_CARRIER_LOCK_STATE](#ui_tm_group_runtime_c_carrier_lock_state) |
| `symbol_lock_state` | 符号锁定状态 | `3` | `word[0]` | 无符号数 | 显示 | [UI_TM_GROUP_RUNTIME_C_SYMBOL_LOCK_STATE](#ui_tm_group_runtime_c_symbol_lock_state) |
| `frame_lock_state` | 帧锁定状态 | `4` | `word[0]` | 无符号数 | 显示 | [UI_TM_GROUP_RUNTIME_C_FRAME_LOCK_STATE](#ui_tm_group_runtime_c_frame_lock_state) |
| `frame_count_sec` | 每秒帧总计数 | `5` | `word[31:0]` | 无符号数 | 显示 | [UI_TM_GROUP_RUNTIME_C_FRAME_COUNT_SEC](#ui_tm_group_runtime_c_frame_count_sec) |
| `error_frame_count_sec` | 每秒错误帧计数 | `6` | `word[31:0]` | 无符号数 | 显示 | [UI_TM_GROUP_RUNTIME_C_ERROR_FRAME_COUNT_SEC](#ui_tm_group_runtime_c_error_frame_count_sec) |
| `air_frame_count_sec` | 每秒空口帧计数 | `7` | `word[31:0]` | 无符号数 | 显示 | [UI_TM_GROUP_RUNTIME_C_AIR_FRAME_COUNT_SEC](#ui_tm_group_runtime_c_air_frame_count_sec) |
| `biz_frame_count_sec` | 每秒业务帧计数 | `8` | `word[31:0]` | 无符号数 | 显示 | [UI_TM_GROUP_RUNTIME_C_BIZ_FRAME_COUNT_SEC](#ui_tm_group_runtime_c_biz_frame_count_sec) |
| `pre_total_bit_count_sec[63:32]` | 译码前总比特计数 | `9` | `word[31:0] / 字段[63:32]` | 无符号数 | 显示 | [UI_TM_GROUP_RUNTIME_C_PRE_TOTAL_BIT_COUNT_SEC_63_32](#ui_tm_group_runtime_c_pre_total_bit_count_sec_63_32) |
| `pre_total_bit_count_sec[31:0]` | 译码前总比特计数 | `10` | `word[31:0] / 字段[31:0]` | 无符号数 | 显示 | [UI_TM_GROUP_RUNTIME_C_PRE_TOTAL_BIT_COUNT_SEC_31_0](#ui_tm_group_runtime_c_pre_total_bit_count_sec_31_0) |
| `pre_dec_err_bits_sec[63:32]` | 译码前误码计数 | `11` | `word[31:0] / 字段[63:32]` | 无符号数 | 显示 | [UI_TM_GROUP_RUNTIME_C_PRE_DEC_ERR_BITS_SEC_63_32](#ui_tm_group_runtime_c_pre_dec_err_bits_sec_63_32) |
| `pre_dec_err_bits_sec[31:0]` | 译码前误码计数 | `12` | `word[31:0] / 字段[31:0]` | 无符号数 | 显示 | [UI_TM_GROUP_RUNTIME_C_PRE_DEC_ERR_BITS_SEC_31_0](#ui_tm_group_runtime_c_pre_dec_err_bits_sec_31_0) |
| `post_total_bit_count_sec[63:32]` | 译码后总比特计数 | `13` | `word[31:0] / 字段[63:32]` | 无符号数 | 显示 | [UI_TM_GROUP_RUNTIME_C_POST_TOTAL_BIT_COUNT_SEC_63_32](#ui_tm_group_runtime_c_post_total_bit_count_sec_63_32) |
| `post_total_bit_count_sec[31:0]` | 译码后总比特计数 | `14` | `word[31:0] / 字段[31:0]` | 无符号数 | 显示 | [UI_TM_GROUP_RUNTIME_C_POST_TOTAL_BIT_COUNT_SEC_31_0](#ui_tm_group_runtime_c_post_total_bit_count_sec_31_0) |
| `post_dec_err_bits_sec[63:32]` | 译码后误码计数 | `15` | `word[31:0] / 字段[63:32]` | 无符号数 | 显示 | [UI_TM_GROUP_RUNTIME_C_POST_DEC_ERR_BITS_SEC_63_32](#ui_tm_group_runtime_c_post_dec_err_bits_sec_63_32) |
| `post_dec_err_bits_sec[31:0]` | 译码后误码计数 | `16` | `word[31:0] / 字段[31:0]` | 无符号数 | 显示 | [UI_TM_GROUP_RUNTIME_C_POST_DEC_ERR_BITS_SEC_31_0](#ui_tm_group_runtime_c_post_dec_err_bits_sec_31_0) |
| `coarse_range_value` | 粗测距值 | `17` | `word[31:0]` | 无符号数 | 显示 | [UI_TM_GROUP_RUNTIME_C_COARSE_RANGE_VALUE](#ui_tm_group_runtime_c_coarse_range_value) |
| `fine_range_value` | 细测距值 | `18` | `word[31:0]` | 无符号数 | 显示 | [UI_TM_GROUP_RUNTIME_C_FINE_RANGE_VALUE](#ui_tm_group_runtime_c_fine_range_value) |
| `ranging_reset_status` | 测距复位接受/忙状态 | `19` | `word[0]` | 无符号数 | 显示 | [UI_TM_GROUP_RUNTIME_C_RANGING_RESET_STATUS](#ui_tm_group_runtime_c_ranging_reset_status) |
| `manual_reset_status` | 手动接收复位接受/忙状态 | `20` | `word[0]` | 无符号数 | 显示 | [UI_TM_GROUP_RUNTIME_C_MANUAL_RESET_STATUS](#ui_tm_group_runtime_c_manual_reset_status) |
| `ook_lock_state` | OOK 判决锁定状态 | `21` | `word[0]` | 无符号数 | 显示 | [UI_TM_GROUP_RUNTIME_C_OOK_LOCK_STATE](#ui_tm_group_runtime_c_ook_lock_state) |

## TM_GROUP_CFG_C

- group_id：`8'h81`

| 参数原始字段名 | UI显示名称 | word | 索引位宽 | 有符号/无符号 | UI类型 | 参数表格索引 |
| --- | --- | --- | --- | --- | --- | --- |
| `rate_sel` | 接收链路速率选择寄存值 | `0` | `word[7:0]` | 无符号数 | 显示 | [UI_TM_GROUP_CFG_C_RATE_SEL](#ui_tm_group_cfg_c_rate_sel) |
| `decode_sel` | 解码选择，0=RS，1=LDPC | `1` | `word[0]` | 无符号数 | 显示 | [UI_TM_GROUP_CFG_C_DECODE_SEL](#ui_tm_group_cfg_c_decode_sel) |
| `descramble_enable` | 接收解扰使能位 | `2` | `word[0]` | 无符号数 | 显示 | [UI_TM_GROUP_CFG_C_DESCRAMBLE_ENABLE](#ui_tm_group_cfg_c_descramble_enable) |
| `carrier_filter_enable` | 载波滤波使能位 | `3` | `word[0]` | 无符号数 | 显示 | [UI_TM_GROUP_CFG_C_CARRIER_FILTER_ENABLE](#ui_tm_group_cfg_c_carrier_filter_enable) |
| `timing_loop_bw_sel` | 定时环路带宽选择编码 | `4` | `word[2:0]` | 无符号数 | 显示 | [UI_TM_GROUP_CFG_C_TIMING_LOOP_BW_SEL](#ui_tm_group_cfg_c_timing_loop_bw_sel) |
| `timing_filter_enable` | 定时滤波使能位 | `5` | `word[0]` | 无符号数 | 显示 | [UI_TM_GROUP_CFG_C_TIMING_FILTER_ENABLE](#ui_tm_group_cfg_c_timing_filter_enable) |
| `frame_sync_corr_peak_th` | 帧同步相关峰阈值 | `6` | `word[6:0]` | 无符号数 | 显示 | [UI_TM_GROUP_CFG_C_FRAME_SYNC_CORR_PEAK_TH](#ui_tm_group_cfg_c_frame_sync_corr_peak_th) |
| `frame_lock_threshold` | 帧锁定门限值 | `7` | `word[15:0]` | 无符号数 | 显示 | [UI_TM_GROUP_CFG_C_FRAME_LOCK_THRESHOLD](#ui_tm_group_cfg_c_frame_lock_threshold) |
| `frame_unlock_threshold` | 帧失锁门限值 | `8` | `word[15:0]` | 无符号数 | 显示 | [UI_TM_GROUP_CFG_C_FRAME_UNLOCK_THRESHOLD](#ui_tm_group_cfg_c_frame_unlock_threshold) |
| `auto_reset_enable` | 自动复位使能位 | `9` | `word[0]` | 无符号数 | 显示 | [UI_TM_GROUP_CFG_C_AUTO_RESET_ENABLE](#ui_tm_group_cfg_c_auto_reset_enable) |
| `loop_enable` | 接收链路环回使能位 | `10` | `word[0]` | 无符号数 | 显示 | [UI_TM_GROUP_CFG_C_LOOP_ENABLE](#ui_tm_group_cfg_c_loop_enable) |

## TM_GROUP_COMM_RX_IQ_C

- group_id：`8'h82`

| 参数原始字段名 | UI显示名称 | word | 索引位宽 | 有符号/无符号 | UI类型 | 参数表格索引 |
| --- | --- | --- | --- | --- | --- | --- |
| `rx_iq_i_data[191:160]` | I 路遥测采样组 | `0` | `word[31:0] / 字段[191:160]` | 无符号数 | 显示 | [UI_TM_GROUP_COMM_RX_IQ_C_RX_IQ_I_DATA_191_160](#ui_tm_group_comm_rx_iq_c_rx_iq_i_data_191_160) |
| `rx_iq_i_data[159:128]` | I 路遥测采样组 | `1` | `word[31:0] / 字段[159:128]` | 无符号数 | 显示 | [UI_TM_GROUP_COMM_RX_IQ_C_RX_IQ_I_DATA_159_128](#ui_tm_group_comm_rx_iq_c_rx_iq_i_data_159_128) |
| `rx_iq_i_data[127:96]` | I 路遥测采样组 | `2` | `word[31:0] / 字段[127:96]` | 无符号数 | 显示 | [UI_TM_GROUP_COMM_RX_IQ_C_RX_IQ_I_DATA_127_96](#ui_tm_group_comm_rx_iq_c_rx_iq_i_data_127_96) |
| `rx_iq_i_data[95:64]` | I 路遥测采样组 | `3` | `word[31:0] / 字段[95:64]` | 无符号数 | 显示 | [UI_TM_GROUP_COMM_RX_IQ_C_RX_IQ_I_DATA_95_64](#ui_tm_group_comm_rx_iq_c_rx_iq_i_data_95_64) |
| `rx_iq_i_data[63:32]` | I 路遥测采样组 | `4` | `word[31:0] / 字段[63:32]` | 无符号数 | 显示 | [UI_TM_GROUP_COMM_RX_IQ_C_RX_IQ_I_DATA_63_32](#ui_tm_group_comm_rx_iq_c_rx_iq_i_data_63_32) |
| `rx_iq_i_data[31:0]` | I 路遥测采样组 | `5` | `word[31:0] / 字段[31:0]` | 无符号数 | 显示 | [UI_TM_GROUP_COMM_RX_IQ_C_RX_IQ_I_DATA_31_0](#ui_tm_group_comm_rx_iq_c_rx_iq_i_data_31_0) |
| `rx_iq_q_data[191:160]` | Q 路遥测采样组 | `6` | `word[31:0] / 字段[191:160]` | 无符号数 | 显示 | [UI_TM_GROUP_COMM_RX_IQ_C_RX_IQ_Q_DATA_191_160](#ui_tm_group_comm_rx_iq_c_rx_iq_q_data_191_160) |
| `rx_iq_q_data[159:128]` | Q 路遥测采样组 | `7` | `word[31:0] / 字段[159:128]` | 无符号数 | 显示 | [UI_TM_GROUP_COMM_RX_IQ_C_RX_IQ_Q_DATA_159_128](#ui_tm_group_comm_rx_iq_c_rx_iq_q_data_159_128) |
| `rx_iq_q_data[127:96]` | Q 路遥测采样组 | `8` | `word[31:0] / 字段[127:96]` | 无符号数 | 显示 | [UI_TM_GROUP_COMM_RX_IQ_C_RX_IQ_Q_DATA_127_96](#ui_tm_group_comm_rx_iq_c_rx_iq_q_data_127_96) |
| `rx_iq_q_data[95:64]` | Q 路遥测采样组 | `9` | `word[31:0] / 字段[95:64]` | 无符号数 | 显示 | [UI_TM_GROUP_COMM_RX_IQ_C_RX_IQ_Q_DATA_95_64](#ui_tm_group_comm_rx_iq_c_rx_iq_q_data_95_64) |
| `rx_iq_q_data[63:32]` | Q 路遥测采样组 | `10` | `word[31:0] / 字段[63:32]` | 无符号数 | 显示 | [UI_TM_GROUP_COMM_RX_IQ_C_RX_IQ_Q_DATA_63_32](#ui_tm_group_comm_rx_iq_c_rx_iq_q_data_63_32) |
| `rx_iq_q_data[31:0]` | Q 路遥测采样组 | `11` | `word[31:0] / 字段[31:0]` | 无符号数 | 显示 | [UI_TM_GROUP_COMM_RX_IQ_C_RX_IQ_Q_DATA_31_0](#ui_tm_group_comm_rx_iq_c_rx_iq_q_data_31_0) |

## 参数表格

### UI_TM_GROUP_RUNTIME_C_SIGNAL_POWER

- 原始字段：`signal_power`
- UI名称：接收信号功率测量值
- 显示类型：数值显示
- 截取位置：`word[15:0]`
- 数据宽度：`16 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `原始值` | 16 bit 无符号数 | 按无符号十进制显示 |

### UI_TM_GROUP_RUNTIME_C_CARRIER_FREQ_OFFSET_EST

- 原始字段：`carrier_freq_offset_est`
- UI名称：载波频偏粗估计值
- 显示类型：数值显示
- 截取位置：`word[31:0]`
- 数据宽度：`32 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `原始值` | 32 bit 补码 | 按补码转换成十进制正负数显示 |

### UI_TM_GROUP_RUNTIME_C_CARRIER_LOCK_STATE

- 原始字段：`carrier_lock_state`
- UI名称：载波锁定状态
- 显示类型：锁定状态
- 截取位置：`word[0]`
- 数据宽度：`1 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `0` | 未锁定 | 锁定类状态位为 0 |
| `1` | 锁定 | 锁定类状态位为 1 |

### UI_TM_GROUP_RUNTIME_C_SYMBOL_LOCK_STATE

- 原始字段：`symbol_lock_state`
- UI名称：符号锁定状态
- 显示类型：锁定状态
- 截取位置：`word[0]`
- 数据宽度：`1 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `0` | 未锁定 | 锁定类状态位为 0 |
| `1` | 锁定 | 锁定类状态位为 1 |

### UI_TM_GROUP_RUNTIME_C_FRAME_LOCK_STATE

- 原始字段：`frame_lock_state`
- UI名称：帧锁定状态
- 显示类型：锁定状态
- 截取位置：`word[0]`
- 数据宽度：`1 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `0` | 未锁定 | 锁定类状态位为 0 |
| `1` | 锁定 | 锁定类状态位为 1 |

### UI_TM_GROUP_RUNTIME_C_FRAME_COUNT_SEC

- 原始字段：`frame_count_sec`
- UI名称：每秒帧总计数
- 显示类型：数值显示
- 截取位置：`word[31:0]`
- 数据宽度：`32 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `原始值` | 32 bit 无符号数 | 按无符号十进制显示 |

### UI_TM_GROUP_RUNTIME_C_ERROR_FRAME_COUNT_SEC

- 原始字段：`error_frame_count_sec`
- UI名称：每秒错误帧计数
- 显示类型：数值显示
- 截取位置：`word[31:0]`
- 数据宽度：`32 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `原始值` | 32 bit 无符号数 | 按无符号十进制显示 |

### UI_TM_GROUP_RUNTIME_C_AIR_FRAME_COUNT_SEC

- 原始字段：`air_frame_count_sec`
- UI名称：每秒空口帧计数
- 显示类型：数值显示
- 截取位置：`word[31:0]`
- 数据宽度：`32 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `原始值` | 32 bit 无符号数 | 按无符号十进制显示 |

### UI_TM_GROUP_RUNTIME_C_BIZ_FRAME_COUNT_SEC

- 原始字段：`biz_frame_count_sec`
- UI名称：每秒业务帧计数
- 显示类型：数值显示
- 截取位置：`word[31:0]`
- 数据宽度：`32 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `原始值` | 32 bit 无符号数 | 按无符号十进制显示 |

### UI_TM_GROUP_RUNTIME_C_PRE_TOTAL_BIT_COUNT_SEC_63_32

- 原始字段：`pre_total_bit_count_sec[63:32]`
- UI名称：译码前总比特计数
- 显示类型：数值显示
- 截取位置：`word[31:0] / 字段[63:32]`
- 数据宽度：`32 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `原始值` | 32 bit 无符号数 | 按无符号十进制显示 |

### UI_TM_GROUP_RUNTIME_C_PRE_TOTAL_BIT_COUNT_SEC_31_0

- 原始字段：`pre_total_bit_count_sec[31:0]`
- UI名称：译码前总比特计数
- 显示类型：数值显示
- 截取位置：`word[31:0] / 字段[31:0]`
- 数据宽度：`32 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `原始值` | 32 bit 无符号数 | 按无符号十进制显示 |

### UI_TM_GROUP_RUNTIME_C_PRE_DEC_ERR_BITS_SEC_63_32

- 原始字段：`pre_dec_err_bits_sec[63:32]`
- UI名称：译码前误码计数
- 显示类型：数值显示
- 截取位置：`word[31:0] / 字段[63:32]`
- 数据宽度：`32 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `原始值` | 32 bit 无符号数 | 按无符号十进制显示 |

### UI_TM_GROUP_RUNTIME_C_PRE_DEC_ERR_BITS_SEC_31_0

- 原始字段：`pre_dec_err_bits_sec[31:0]`
- UI名称：译码前误码计数
- 显示类型：数值显示
- 截取位置：`word[31:0] / 字段[31:0]`
- 数据宽度：`32 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `原始值` | 32 bit 无符号数 | 按无符号十进制显示 |

### UI_TM_GROUP_RUNTIME_C_POST_TOTAL_BIT_COUNT_SEC_63_32

- 原始字段：`post_total_bit_count_sec[63:32]`
- UI名称：译码后总比特计数
- 显示类型：数值显示
- 截取位置：`word[31:0] / 字段[63:32]`
- 数据宽度：`32 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `原始值` | 32 bit 无符号数 | 按无符号十进制显示 |

### UI_TM_GROUP_RUNTIME_C_POST_TOTAL_BIT_COUNT_SEC_31_0

- 原始字段：`post_total_bit_count_sec[31:0]`
- UI名称：译码后总比特计数
- 显示类型：数值显示
- 截取位置：`word[31:0] / 字段[31:0]`
- 数据宽度：`32 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `原始值` | 32 bit 无符号数 | 按无符号十进制显示 |

### UI_TM_GROUP_RUNTIME_C_POST_DEC_ERR_BITS_SEC_63_32

- 原始字段：`post_dec_err_bits_sec[63:32]`
- UI名称：译码后误码计数
- 显示类型：数值显示
- 截取位置：`word[31:0] / 字段[63:32]`
- 数据宽度：`32 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `原始值` | 32 bit 无符号数 | 按无符号十进制显示 |

### UI_TM_GROUP_RUNTIME_C_POST_DEC_ERR_BITS_SEC_31_0

- 原始字段：`post_dec_err_bits_sec[31:0]`
- UI名称：译码后误码计数
- 显示类型：数值显示
- 截取位置：`word[31:0] / 字段[31:0]`
- 数据宽度：`32 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `原始值` | 32 bit 无符号数 | 按无符号十进制显示 |

### UI_TM_GROUP_RUNTIME_C_COARSE_RANGE_VALUE

- 原始字段：`coarse_range_value`
- UI名称：粗测距值
- 显示类型：数值显示
- 截取位置：`word[31:0]`
- 数据宽度：`32 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `原始值` | 32 bit 无符号数 | 按无符号十进制显示 |

### UI_TM_GROUP_RUNTIME_C_FINE_RANGE_VALUE

- 原始字段：`fine_range_value`
- UI名称：细测距值
- 显示类型：数值显示
- 截取位置：`word[31:0]`
- 数据宽度：`32 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `原始值` | 32 bit 无符号数 | 按无符号十进制显示 |

### UI_TM_GROUP_RUNTIME_C_RANGING_RESET_STATUS

- 原始字段：`ranging_reset_status`
- UI名称：测距复位接受/忙状态
- 显示类型：复位状态
- 截取位置：`word[0]`
- 数据宽度：`1 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `0` | 空闲 | 未处于复位请求/忙状态 |
| `1` | 复位中/已接受 | 复位请求已接受或复位忙 |

### UI_TM_GROUP_RUNTIME_C_MANUAL_RESET_STATUS

- 原始字段：`manual_reset_status`
- UI名称：手动接收复位接受/忙状态
- 显示类型：复位状态
- 截取位置：`word[0]`
- 数据宽度：`1 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `0` | 空闲 | 未处于复位请求/忙状态 |
| `1` | 复位中/已接受 | 复位请求已接受或复位忙 |

### UI_TM_GROUP_RUNTIME_C_OOK_LOCK_STATE

- 原始字段：`ook_lock_state`
- UI名称：OOK 判决锁定状态
- 显示类型：锁定状态
- 截取位置：`word[0]`
- 数据宽度：`1 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `0` | 未锁定 | OOK 判决链路未锁定或当前非 OOK 模式 |
| `1` | 锁定 | OOK 判决链路已完成入锁 |

### UI_TM_GROUP_CFG_C_RATE_SEL

- 原始字段：`rate_sel`
- UI名称：接收链路速率选择寄存值
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
| `128` / `8'h80` | OOK 20M | OOK 接收已接入 20M 判决链路 |
| `160` / `8'hA0` | OOK 10M | OOK 接收已接入 10M 判决链路 |
| `192` / `8'hC0` | OOK 1M | OOK 1M 速率编码已预留，当前 RTL 未单独实现 1M 判决阈值 |
| `其它` | 保留/未知 | 未定义速率编码 |

### UI_TM_GROUP_CFG_C_DECODE_SEL

- 原始字段：`decode_sel`
- UI名称：解码选择，0=RS，1=LDPC
- 显示类型：枚举状态
- 截取位置：`word[0]`
- 数据宽度：`1 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `0` | RS | RS 编码/译码 |
| `1` | LDPC | LDPC 译码；需确认 LDPC DCP/source 绑定和 `LDPC_DeCode_EN` 参数后实际生效 |
| `其它` | 保留/未知 | 当前按低 1 bit 使用 |

### UI_TM_GROUP_CFG_C_DESCRAMBLE_ENABLE

- 原始字段：`descramble_enable`
- UI名称：接收解扰使能位
- 显示类型：使能状态
- 截取位置：`word[0]`
- 数据宽度：`1 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `0` | 未使能 | 使能状态位为 0 |
| `1` | 使能 | 使能状态位为 1 |

### UI_TM_GROUP_CFG_C_CARRIER_FILTER_ENABLE

- 原始字段：`carrier_filter_enable`
- UI名称：载波滤波使能位
- 显示类型：使能状态
- 截取位置：`word[0]`
- 数据宽度：`1 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `0` | 未使能 | 使能状态位为 0 |
| `1` | 使能 | 使能状态位为 1 |

### UI_TM_GROUP_CFG_C_TIMING_LOOP_BW_SEL

- 原始字段：`timing_loop_bw_sel`
- UI名称：定时环路带宽选择编码
- 显示类型：枚举状态
- 截取位置：`word[2:0]`
- 数据宽度：`3 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `0` | 带宽编码 0 | 定时环路带宽编码，具体带宽值待确认 |
| `1` | 带宽编码 1 | 定时环路带宽编码，具体带宽值待确认 |
| `2` | 带宽编码 2 | 定时环路带宽编码，具体带宽值待确认 |
| `3` | 带宽编码 3 | 定时环路带宽编码，具体带宽值待确认 |
| `4` | 带宽编码 4 | 定时环路带宽编码，具体带宽值待确认 |
| `5` | 带宽编码 5 | 定时环路带宽编码，具体带宽值待确认 |
| `6` | 带宽编码 6 | 定时环路带宽编码，具体带宽值待确认 |
| `7` | 带宽编码 7 | 定时环路带宽编码，具体带宽值待确认 |

### UI_TM_GROUP_CFG_C_TIMING_FILTER_ENABLE

- 原始字段：`timing_filter_enable`
- UI名称：定时滤波使能位
- 显示类型：使能状态
- 截取位置：`word[0]`
- 数据宽度：`1 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `0` | 未使能 | 使能状态位为 0 |
| `1` | 使能 | 使能状态位为 1 |

### UI_TM_GROUP_CFG_C_FRAME_SYNC_CORR_PEAK_TH

- 原始字段：`frame_sync_corr_peak_th`
- UI名称：帧同步相关峰阈值
- 显示类型：数值显示
- 截取位置：`word[6:0]`
- 数据宽度：`7 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `原始值` | 7 bit 无符号数 | 按无符号十进制显示 |

### UI_TM_GROUP_CFG_C_FRAME_LOCK_THRESHOLD

- 原始字段：`frame_lock_threshold`
- UI名称：帧锁定门限值
- 显示类型：数值显示
- 截取位置：`word[15:0]`
- 数据宽度：`16 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `原始值` | 16 bit 无符号数 | 按无符号十进制显示 |

### UI_TM_GROUP_CFG_C_FRAME_UNLOCK_THRESHOLD

- 原始字段：`frame_unlock_threshold`
- UI名称：帧失锁门限值
- 显示类型：数值显示
- 截取位置：`word[15:0]`
- 数据宽度：`16 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `原始值` | 16 bit 无符号数 | 按无符号十进制显示 |

### UI_TM_GROUP_CFG_C_AUTO_RESET_ENABLE

- 原始字段：`auto_reset_enable`
- UI名称：自动复位使能位
- 显示类型：使能状态
- 截取位置：`word[0]`
- 数据宽度：`1 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `0` | 未使能 | 使能状态位为 0 |
| `1` | 使能 | 使能状态位为 1 |

### UI_TM_GROUP_CFG_C_LOOP_ENABLE

- 原始字段：`loop_enable`
- UI名称：接收链路环回使能位
- 显示类型：使能状态
- 截取位置：`word[0]`
- 数据宽度：`1 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `0` | 未使能 | 使能状态位为 0 |
| `1` | 使能 | 使能状态位为 1 |

### UI_TM_GROUP_COMM_RX_IQ_C_RX_IQ_I_DATA_191_160

- 原始字段：`rx_iq_i_data[191:160]`
- UI名称：I 路遥测采样组
- 显示类型：数值显示
- 截取位置：`word[31:0] / 字段[191:160]`
- 数据宽度：`32 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `原始值` | 32 bit 无符号数 | 按无符号十进制显示 |

### UI_TM_GROUP_COMM_RX_IQ_C_RX_IQ_I_DATA_159_128

- 原始字段：`rx_iq_i_data[159:128]`
- UI名称：I 路遥测采样组
- 显示类型：数值显示
- 截取位置：`word[31:0] / 字段[159:128]`
- 数据宽度：`32 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `原始值` | 32 bit 无符号数 | 按无符号十进制显示 |

### UI_TM_GROUP_COMM_RX_IQ_C_RX_IQ_I_DATA_127_96

- 原始字段：`rx_iq_i_data[127:96]`
- UI名称：I 路遥测采样组
- 显示类型：数值显示
- 截取位置：`word[31:0] / 字段[127:96]`
- 数据宽度：`32 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `原始值` | 32 bit 无符号数 | 按无符号十进制显示 |

### UI_TM_GROUP_COMM_RX_IQ_C_RX_IQ_I_DATA_95_64

- 原始字段：`rx_iq_i_data[95:64]`
- UI名称：I 路遥测采样组
- 显示类型：数值显示
- 截取位置：`word[31:0] / 字段[95:64]`
- 数据宽度：`32 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `原始值` | 32 bit 无符号数 | 按无符号十进制显示 |

### UI_TM_GROUP_COMM_RX_IQ_C_RX_IQ_I_DATA_63_32

- 原始字段：`rx_iq_i_data[63:32]`
- UI名称：I 路遥测采样组
- 显示类型：数值显示
- 截取位置：`word[31:0] / 字段[63:32]`
- 数据宽度：`32 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `原始值` | 32 bit 无符号数 | 按无符号十进制显示 |

### UI_TM_GROUP_COMM_RX_IQ_C_RX_IQ_I_DATA_31_0

- 原始字段：`rx_iq_i_data[31:0]`
- UI名称：I 路遥测采样组
- 显示类型：数值显示
- 截取位置：`word[31:0] / 字段[31:0]`
- 数据宽度：`32 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `原始值` | 32 bit 无符号数 | 按无符号十进制显示 |

### UI_TM_GROUP_COMM_RX_IQ_C_RX_IQ_Q_DATA_191_160

- 原始字段：`rx_iq_q_data[191:160]`
- UI名称：Q 路遥测采样组
- 显示类型：数值显示
- 截取位置：`word[31:0] / 字段[191:160]`
- 数据宽度：`32 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `原始值` | 32 bit 无符号数 | 按无符号十进制显示 |

### UI_TM_GROUP_COMM_RX_IQ_C_RX_IQ_Q_DATA_159_128

- 原始字段：`rx_iq_q_data[159:128]`
- UI名称：Q 路遥测采样组
- 显示类型：数值显示
- 截取位置：`word[31:0] / 字段[159:128]`
- 数据宽度：`32 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `原始值` | 32 bit 无符号数 | 按无符号十进制显示 |

### UI_TM_GROUP_COMM_RX_IQ_C_RX_IQ_Q_DATA_127_96

- 原始字段：`rx_iq_q_data[127:96]`
- UI名称：Q 路遥测采样组
- 显示类型：数值显示
- 截取位置：`word[31:0] / 字段[127:96]`
- 数据宽度：`32 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `原始值` | 32 bit 无符号数 | 按无符号十进制显示 |

### UI_TM_GROUP_COMM_RX_IQ_C_RX_IQ_Q_DATA_95_64

- 原始字段：`rx_iq_q_data[95:64]`
- UI名称：Q 路遥测采样组
- 显示类型：数值显示
- 截取位置：`word[31:0] / 字段[95:64]`
- 数据宽度：`32 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `原始值` | 32 bit 无符号数 | 按无符号十进制显示 |

### UI_TM_GROUP_COMM_RX_IQ_C_RX_IQ_Q_DATA_63_32

- 原始字段：`rx_iq_q_data[63:32]`
- UI名称：Q 路遥测采样组
- 显示类型：数值显示
- 截取位置：`word[31:0] / 字段[63:32]`
- 数据宽度：`32 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `原始值` | 32 bit 无符号数 | 按无符号十进制显示 |

### UI_TM_GROUP_COMM_RX_IQ_C_RX_IQ_Q_DATA_31_0

- 原始字段：`rx_iq_q_data[31:0]`
- UI名称：Q 路遥测采样组
- 显示类型：数值显示
- 截取位置：`word[31:0] / 字段[31:0]`
- 数据宽度：`32 bit`

| 接收值 | UI显示 | 说明 |
| --- | --- | --- |
| `原始值` | 32 bit 无符号数 | 按无符号十进制显示 |
