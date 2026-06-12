# comm_rx_block 遥控指令清单

## 来源

- 模块目录：`import/rtl_source/comm_rx_block/`
- 遥控包：`D:/vivado_project/CZW/CZW_V7_runner_201803/repo_main/import/rtl_source/comm_rx_block/vars/comm_rx_ctrl_pkg.sv`
- module_id：`MODULE_ID_COMM_RX_C = 4'h8`

## Group 总表

### COMM_RX_CMD_GROUP_MAP_C

| 参数名字 | 参数中文名 | 参数id | 参数类型 | 应用层字数 | 应用层位宽 | 默认值 | 实现层参数名 | 实现层参数id | 实现层字数 | 实现层位宽 | 模块最终落地位宽 | 可选项数量 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [COMM_RX_PARAM_RATE_C](#comm_rx_param_rate_c) | 接收链路速率选择寄存值 | `8'd0` | `PARAM_KIND_VALUE_C` | `WORD_COUNT_SINGLE_C` | `32 bit` | `RATE_SEL_2P5G_C` (`8'd3`，2.5G) | `COMM_RX_IMPL_RATE_C` | `8'd0` | `8'd1` | `32 bit` | `8 bit` | `0` |
| [COMM_RX_PARAM_DECODE_C](#comm_rx_param_decode_c) | 解码选择，0=RS，1=LDPC | `8'd1` | `PARAM_KIND_VALUE_C` | `WORD_COUNT_SINGLE_C` | `32 bit` | `1'b0` | `COMM_RX_IMPL_DECODE_C` | `8'd1` | `8'd1` | `32 bit` | `1 bit` | `2` |
| [COMM_RX_PARAM_DESCRAMBLE_C](#comm_rx_param_descramble_c) | 接收解扰使能位 | `8'd2` | `PARAM_KIND_VALUE_C` | `WORD_COUNT_SINGLE_C` | `32 bit` | `1'b1`（有加扰） | `COMM_RX_IMPL_DESCRAMBLE_C` | `8'd2` | `8'd1` | `32 bit` | `1 bit` | `0` |
| [COMM_RX_PARAM_FILTER_C](#comm_rx_param_filter_c) | 载波滤波使能位 | `8'd3` | `PARAM_KIND_VALUE_C` | `WORD_COUNT_SINGLE_C` | `32 bit` | `1'b1`（有滤波器） | `COMM_RX_IMPL_FILTER_C` | `8'd3` | `8'd1` | `32 bit` | `1 bit` | `0` |
| [COMM_RX_PARAM_LOOP_BW_C](#comm_rx_param_loop_bw_c) | 定时环路带宽选择编码 | `8'd4` | `PARAM_KIND_VALUE_C` | `WORD_COUNT_SINGLE_C` | `32 bit` | `3'd3` | `COMM_RX_IMPL_LOOP_BW_C` | `8'd4` | `8'd1` | `32 bit` | `3 bit` | `0` |
| [COMM_RX_PARAM_TIMING_FILTER_C](#comm_rx_param_timing_filter_c) | 定时滤波使能位 | `8'd5` | `PARAM_KIND_VALUE_C` | `WORD_COUNT_SINGLE_C` | `32 bit` | `1'b0` | `COMM_RX_IMPL_TIMING_FILTER_C` | `8'd5` | `8'd1` | `32 bit` | `1 bit` | `0` |
| [COMM_RX_PARAM_AUTO_RESET_C](#comm_rx_param_auto_reset_c) | 自动复位使能位 | `8'd6` | `PARAM_KIND_VALUE_C` | `WORD_COUNT_SINGLE_C` | `32 bit` | `1'b1`（自动复位开） | `COMM_RX_IMPL_AUTO_RESET_C` | `8'd6` | `8'd1` | `32 bit` | `1 bit` | `0` |
| [COMM_RX_PARAM_LOOP_ENABLE_C](#comm_rx_param_loop_enable_c) | 接收链路环回使能位 | `8'd13` | `PARAM_KIND_VALUE_C` | `WORD_COUNT_SINGLE_C` | `32 bit` | `1'b0` | `COMM_RX_IMPL_LOOP_ENABLE_C` | `8'd13` | `8'd1` | `32 bit` | `1 bit` | `0` |

### COMM_RX_CMD_GROUP_VALUE_C

| 参数名字 | 参数中文名 | 参数id | 参数类型 | 应用层字数 | 应用层位宽 | 默认值 | 实现层参数名 | 实现层参数id | 实现层字数 | 实现层位宽 | 模块最终落地位宽 | 可选项数量 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [COMM_RX_PARAM_SYNC_CORR_PEAK_TH_C](#comm_rx_param_sync_corr_peak_th_c) | 帧同步相关峰阈值 | `8'd7` | `PARAM_KIND_VALUE_C` | `WORD_COUNT_SINGLE_C` | `32 bit` | `7'h20` | `COMM_RX_IMPL_SYNC_CORR_PEAK_TH_C` | `8'd7` | `8'd1` | `32 bit` | `7 bit` | `0` |
| [COMM_RX_PARAM_LOCK_TH_C](#comm_rx_param_lock_th_c) | 帧锁定门限值 | `8'd8` | `PARAM_KIND_VALUE_C` | `WORD_COUNT_SINGLE_C` | `32 bit` | `16'h0020` | `COMM_RX_IMPL_LOCK_TH_C` | `8'd8` | `8'd1` | `32 bit` | `16 bit` | `0` |
| [COMM_RX_PARAM_UNLOCK_TH_C](#comm_rx_param_unlock_th_c) | 帧失锁门限值 | `8'd9` | `PARAM_KIND_VALUE_C` | `WORD_COUNT_SINGLE_C` | `32 bit` | `16'h0004` | `COMM_RX_IMPL_UNLOCK_TH_C` | `8'd9` | `8'd1` | `32 bit` | `16 bit` | `0` |

### COMM_RX_CMD_GROUP_PULSE_RANGE_RST_C

| 参数名字 | 参数中文名 | 参数id | 参数类型 | 应用层字数 | 应用层位宽 | 默认值 | 实现层参数名 | 实现层参数id | 实现层字数 | 实现层位宽 | 模块最终落地位宽 | 可选项数量 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [COMM_RX_PARAM_RANGE_RESET_C](#comm_rx_param_range_reset_c) | 未标注中文名 | `8'd10` | `PARAM_KIND_PULSE_C` | `WORD_COUNT_ZERO_C` | `0 bit` | 上电默认不触发 | `COMM_RX_IMPL_RANGE_RESET_C` | `8'd10` | `8'd1` | `32 bit` | 未找到最终落地位宽 | `0` |

### COMM_RX_CMD_GROUP_PULSE_COUNT_CLR_C

| 参数名字 | 参数中文名 | 参数id | 参数类型 | 应用层字数 | 应用层位宽 | 默认值 | 实现层参数名 | 实现层参数id | 实现层字数 | 实现层位宽 | 模块最终落地位宽 | 可选项数量 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [COMM_RX_PARAM_COUNT_CLEAR_C](#comm_rx_param_count_clear_c) | 未标注中文名 | `8'd11` | `PARAM_KIND_PULSE_C` | `WORD_COUNT_ZERO_C` | `0 bit` | 上电默认不触发 | `COMM_RX_IMPL_COUNT_CLEAR_C` | `8'd11` | `8'd1` | `32 bit` | 未找到最终落地位宽 | `0` |

### COMM_RX_CMD_GROUP_PULSE_MANUAL_RST_C

| 参数名字 | 参数中文名 | 参数id | 参数类型 | 应用层字数 | 应用层位宽 | 默认值 | 实现层参数名 | 实现层参数id | 实现层字数 | 实现层位宽 | 模块最终落地位宽 | 可选项数量 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [COMM_RX_PARAM_MANUAL_RESET_C](#comm_rx_param_manual_reset_c) | 未标注中文名 | `8'd12` | `PARAM_KIND_PULSE_C` | `WORD_COUNT_ZERO_C` | `0 bit` | 上电默认不触发 | `COMM_RX_IMPL_MANUAL_RESET_C` | `8'd12` | `8'd1` | `32 bit` | 未找到最终落地位宽 | `0` |

## 参数说明表

### COMM_RX_PARAM_RATE_C

| 字段 | 内容 |
| --- | --- |
| 应用层参数名 | `COMM_RX_PARAM_RATE_C` |
| 应用层参数中文名 | 接收链路速率选择寄存值 |
| 应用层参数 id | `8'd0` |
| 所属 group | `COMM_RX_CMD_GROUP_MAP_C` |
| 参数类型 | `PARAM_KIND_VALUE_C` |
| 应用层字数 | `WORD_COUNT_SINGLE_C` |
| 应用层位宽 | `32 bit` |
| 应用层默认值 | `RATE_SEL_2P5G_C` (`8'd3`，2.5G) |
| 动作类型 | `ACTION_KIND_CFG_WRITE_C` |
| 实现层参数名 | `COMM_RX_IMPL_RATE_C` |
| 实现层参数 id | `8'd0` |
| 实现层字数 | `8'd1` |
| 实现层位宽 | `32 bit` |
| 模块最终落地目标 | `cfg_r.rate_sel` |
| 模块最终落地位宽 | `8 bit` |
| 模块上电默认生效值 | `RATE_SEL_2P5G_C` (`8'd3`，2.5G) |
| 可选项数量 | `0` |
| 映射表 | 无 |
| 来源 pkg 常量 | `COMM_RX_CMD_GROUP_MAP_C`<br>`COMM_RX_PARAM_RATE_C`<br>`COMM_RX_IMPL_RATE_C` |
| 说明 | 应用层参数 `COMM_RX_PARAM_RATE_C` 在组 `COMM_RX_CMD_GROUP_MAP_C` 内通过 `ACTION_KIND_CFG_WRITE_C` 转换到实现层参数 `COMM_RX_IMPL_RATE_C`。 |

| 速率选项 | 写入值 | 说明 |
| --- | --- | --- |
| `RATE_SEL_PSK_312M_C` | `8'h00` | PSK 312M |
| `RATE_SEL_PSK_625M_C` | `8'h01` | PSK 625M |
| `RATE_SEL_PSK_1P25G_C` | `8'h02` | PSK 1.25G |
| `RATE_SEL_PSK_2P5G_C` | `8'h03` | PSK 2.5G，上电默认 |
| `RATE_SEL_PSK_5G_C` | `8'h04` | PSK 5G |
| `RATE_SEL_OOK_20M_C` | `8'h80` | OOK 接收已接入 20M 判决链路，`rate_sel[7:5]=3'b100` |
| `RATE_SEL_OOK_10M_C` | `8'hA0` | OOK 接收已接入 10M 判决链路，`rate_sel[7:5]=3'b101` |
| `RATE_SEL_OOK_1M_C` | `8'hC0` | OOK 1M 速率编码预留，当前 RTL 未单独实现 1M 判决阈值 |

### COMM_RX_PARAM_DECODE_C

| 字段 | 内容 |
| --- | --- |
| 应用层参数名 | `COMM_RX_PARAM_DECODE_C` |
| 应用层参数中文名 | 解码选择，0=RS，1=LDPC |
| 应用层参数 id | `8'd1` |
| 所属 group | `COMM_RX_CMD_GROUP_MAP_C` |
| 参数类型 | `PARAM_KIND_VALUE_C` |
| 应用层字数 | `WORD_COUNT_SINGLE_C` |
| 应用层位宽 | `32 bit` |
| 应用层默认值 | `1'b0` |
| 动作类型 | `ACTION_KIND_CFG_WRITE_C` |
| 实现层参数名 | `COMM_RX_IMPL_DECODE_C` |
| 实现层参数 id | `8'd1` |
| 实现层字数 | `8'd1` |
| 实现层位宽 | `32 bit` |
| 模块最终落地目标 | `cfg_r.decode_sel` |
| 模块最终落地位宽 | `1 bit` |
| 模块上电默认生效值 | `1'b0` |
| 可选项数量 | `2` |
| 映射表 | `0=RS`，`1=LDPC` |
| 来源 pkg 常量 | `COMM_RX_CMD_GROUP_MAP_C`<br>`COMM_RX_PARAM_DECODE_C`<br>`COMM_RX_IMPL_DECODE_C` |
| 说明 | 应用层参数 `COMM_RX_PARAM_DECODE_C` 在组 `COMM_RX_CMD_GROUP_MAP_C` 内通过 `ACTION_KIND_CFG_WRITE_C` 转换到实现层参数 `COMM_RX_IMPL_DECODE_C`。 |

| 解码选项 | 写入值 | 说明 |
| --- | --- | --- |
| RS | `1'b0` | 选择 RS 译码链路，上电默认 |
| LDPC | `1'b1` | 选择 LDPC 译码链路；当前工程需确认 LDPC DCP/source 绑定和 `LDPC_DeCode_EN` 参数后才能实际生效 |

### COMM_RX_PARAM_DESCRAMBLE_C

| 字段 | 内容 |
| --- | --- |
| 应用层参数名 | `COMM_RX_PARAM_DESCRAMBLE_C` |
| 应用层参数中文名 | 接收解扰使能位 |
| 应用层参数 id | `8'd2` |
| 所属 group | `COMM_RX_CMD_GROUP_MAP_C` |
| 参数类型 | `PARAM_KIND_VALUE_C` |
| 应用层字数 | `WORD_COUNT_SINGLE_C` |
| 应用层位宽 | `32 bit` |
| 应用层默认值 | `1'b1`（有加扰） |
| 动作类型 | `ACTION_KIND_CFG_WRITE_C` |
| 实现层参数名 | `COMM_RX_IMPL_DESCRAMBLE_C` |
| 实现层参数 id | `8'd2` |
| 实现层字数 | `8'd1` |
| 实现层位宽 | `32 bit` |
| 模块最终落地目标 | `cfg_r.descramble_enable` |
| 模块最终落地位宽 | `1 bit` |
| 模块上电默认生效值 | `1'b1`（有加扰） |
| 可选项数量 | `0` |
| 映射表 | 无 |
| 来源 pkg 常量 | `COMM_RX_CMD_GROUP_MAP_C`<br>`COMM_RX_PARAM_DESCRAMBLE_C`<br>`COMM_RX_IMPL_DESCRAMBLE_C` |
| 说明 | 应用层参数 `COMM_RX_PARAM_DESCRAMBLE_C` 在组 `COMM_RX_CMD_GROUP_MAP_C` 内通过 `ACTION_KIND_CFG_WRITE_C` 转换到实现层参数 `COMM_RX_IMPL_DESCRAMBLE_C`。 |

### COMM_RX_PARAM_FILTER_C

| 字段 | 内容 |
| --- | --- |
| 应用层参数名 | `COMM_RX_PARAM_FILTER_C` |
| 应用层参数中文名 | 载波滤波使能位 |
| 应用层参数 id | `8'd3` |
| 所属 group | `COMM_RX_CMD_GROUP_MAP_C` |
| 参数类型 | `PARAM_KIND_VALUE_C` |
| 应用层字数 | `WORD_COUNT_SINGLE_C` |
| 应用层位宽 | `32 bit` |
| 应用层默认值 | `1'b1`（有滤波器） |
| 动作类型 | `ACTION_KIND_CFG_WRITE_C` |
| 实现层参数名 | `COMM_RX_IMPL_FILTER_C` |
| 实现层参数 id | `8'd3` |
| 实现层字数 | `8'd1` |
| 实现层位宽 | `32 bit` |
| 模块最终落地目标 | `cfg_r.carrier_filter_enable` |
| 模块最终落地位宽 | `1 bit` |
| 模块上电默认生效值 | `1'b1`（有滤波器） |
| 可选项数量 | `0` |
| 映射表 | 无 |
| 来源 pkg 常量 | `COMM_RX_CMD_GROUP_MAP_C`<br>`COMM_RX_PARAM_FILTER_C`<br>`COMM_RX_IMPL_FILTER_C` |
| 说明 | 应用层参数 `COMM_RX_PARAM_FILTER_C` 在组 `COMM_RX_CMD_GROUP_MAP_C` 内通过 `ACTION_KIND_CFG_WRITE_C` 转换到实现层参数 `COMM_RX_IMPL_FILTER_C`。 |

### COMM_RX_PARAM_LOOP_BW_C

| 字段 | 内容 |
| --- | --- |
| 应用层参数名 | `COMM_RX_PARAM_LOOP_BW_C` |
| 应用层参数中文名 | 定时环路带宽选择编码 |
| 应用层参数 id | `8'd4` |
| 所属 group | `COMM_RX_CMD_GROUP_MAP_C` |
| 参数类型 | `PARAM_KIND_VALUE_C` |
| 应用层字数 | `WORD_COUNT_SINGLE_C` |
| 应用层位宽 | `32 bit` |
| 应用层默认值 | `3'd3` |
| 动作类型 | `ACTION_KIND_CFG_WRITE_C` |
| 实现层参数名 | `COMM_RX_IMPL_LOOP_BW_C` |
| 实现层参数 id | `8'd4` |
| 实现层字数 | `8'd1` |
| 实现层位宽 | `32 bit` |
| 模块最终落地目标 | `cfg_r.timing_loop_bw_sel` |
| 模块最终落地位宽 | `3 bit` |
| 模块上电默认生效值 | `3'd3` |
| 可选项数量 | `0` |
| 映射表 | 无 |
| 来源 pkg 常量 | `COMM_RX_CMD_GROUP_MAP_C`<br>`COMM_RX_PARAM_LOOP_BW_C`<br>`COMM_RX_IMPL_LOOP_BW_C` |
| 说明 | 应用层参数 `COMM_RX_PARAM_LOOP_BW_C` 在组 `COMM_RX_CMD_GROUP_MAP_C` 内通过 `ACTION_KIND_CFG_WRITE_C` 转换到实现层参数 `COMM_RX_IMPL_LOOP_BW_C`。 |

### COMM_RX_PARAM_TIMING_FILTER_C

| 字段 | 内容 |
| --- | --- |
| 应用层参数名 | `COMM_RX_PARAM_TIMING_FILTER_C` |
| 应用层参数中文名 | 定时滤波使能位 |
| 应用层参数 id | `8'd5` |
| 所属 group | `COMM_RX_CMD_GROUP_MAP_C` |
| 参数类型 | `PARAM_KIND_VALUE_C` |
| 应用层字数 | `WORD_COUNT_SINGLE_C` |
| 应用层位宽 | `32 bit` |
| 应用层默认值 | `1'b0` |
| 动作类型 | `ACTION_KIND_CFG_WRITE_C` |
| 实现层参数名 | `COMM_RX_IMPL_TIMING_FILTER_C` |
| 实现层参数 id | `8'd5` |
| 实现层字数 | `8'd1` |
| 实现层位宽 | `32 bit` |
| 模块最终落地目标 | `cfg_r.timing_filter_enable` |
| 模块最终落地位宽 | `1 bit` |
| 模块上电默认生效值 | `1'b0` |
| 可选项数量 | `0` |
| 映射表 | 无 |
| 来源 pkg 常量 | `COMM_RX_CMD_GROUP_MAP_C`<br>`COMM_RX_PARAM_TIMING_FILTER_C`<br>`COMM_RX_IMPL_TIMING_FILTER_C` |
| 说明 | 应用层参数 `COMM_RX_PARAM_TIMING_FILTER_C` 在组 `COMM_RX_CMD_GROUP_MAP_C` 内通过 `ACTION_KIND_CFG_WRITE_C` 转换到实现层参数 `COMM_RX_IMPL_TIMING_FILTER_C`。 |

### COMM_RX_PARAM_AUTO_RESET_C

| 字段 | 内容 |
| --- | --- |
| 应用层参数名 | `COMM_RX_PARAM_AUTO_RESET_C` |
| 应用层参数中文名 | 自动复位使能位 |
| 应用层参数 id | `8'd6` |
| 所属 group | `COMM_RX_CMD_GROUP_MAP_C` |
| 参数类型 | `PARAM_KIND_VALUE_C` |
| 应用层字数 | `WORD_COUNT_SINGLE_C` |
| 应用层位宽 | `32 bit` |
| 应用层默认值 | `1'b1`（自动复位开） |
| 动作类型 | `ACTION_KIND_CFG_WRITE_C` |
| 实现层参数名 | `COMM_RX_IMPL_AUTO_RESET_C` |
| 实现层参数 id | `8'd6` |
| 实现层字数 | `8'd1` |
| 实现层位宽 | `32 bit` |
| 模块最终落地目标 | `cfg_r.auto_reset_enable` |
| 模块最终落地位宽 | `1 bit` |
| 模块上电默认生效值 | `1'b1`（自动复位开） |
| 可选项数量 | `0` |
| 映射表 | 无 |
| 来源 pkg 常量 | `COMM_RX_CMD_GROUP_MAP_C`<br>`COMM_RX_PARAM_AUTO_RESET_C`<br>`COMM_RX_IMPL_AUTO_RESET_C` |
| 说明 | 应用层参数 `COMM_RX_PARAM_AUTO_RESET_C` 在组 `COMM_RX_CMD_GROUP_MAP_C` 内通过 `ACTION_KIND_CFG_WRITE_C` 转换到实现层参数 `COMM_RX_IMPL_AUTO_RESET_C`。 |

### COMM_RX_PARAM_LOOP_ENABLE_C

| 字段 | 内容 |
| --- | --- |
| 应用层参数名 | `COMM_RX_PARAM_LOOP_ENABLE_C` |
| 应用层参数中文名 | 接收链路环回使能位 |
| 应用层参数 id | `8'd13` |
| 所属 group | `COMM_RX_CMD_GROUP_MAP_C` |
| 参数类型 | `PARAM_KIND_VALUE_C` |
| 应用层字数 | `WORD_COUNT_SINGLE_C` |
| 应用层位宽 | `32 bit` |
| 应用层默认值 | `1'b0` |
| 动作类型 | `ACTION_KIND_CFG_WRITE_C` |
| 实现层参数名 | `COMM_RX_IMPL_LOOP_ENABLE_C` |
| 实现层参数 id | `8'd13` |
| 实现层字数 | `8'd1` |
| 实现层位宽 | `32 bit` |
| 模块最终落地目标 | `cfg_r.loop_enable` |
| 模块最终落地位宽 | `1 bit` |
| 模块上电默认生效值 | `1'b0` |
| 可选项数量 | `0` |
| 映射表 | 无 |
| 来源 pkg 常量 | `COMM_RX_CMD_GROUP_MAP_C`<br>`COMM_RX_PARAM_LOOP_ENABLE_C`<br>`COMM_RX_IMPL_LOOP_ENABLE_C` |
| 说明 | 应用层参数 `COMM_RX_PARAM_LOOP_ENABLE_C` 在组 `COMM_RX_CMD_GROUP_MAP_C` 内通过 `ACTION_KIND_CFG_WRITE_C` 转换到实现层参数 `COMM_RX_IMPL_LOOP_ENABLE_C`。 |

### COMM_RX_PARAM_SYNC_CORR_PEAK_TH_C

| 字段 | 内容 |
| --- | --- |
| 应用层参数名 | `COMM_RX_PARAM_SYNC_CORR_PEAK_TH_C` |
| 应用层参数中文名 | 帧同步相关峰阈值 |
| 应用层参数 id | `8'd7` |
| 所属 group | `COMM_RX_CMD_GROUP_VALUE_C` |
| 参数类型 | `PARAM_KIND_VALUE_C` |
| 应用层字数 | `WORD_COUNT_SINGLE_C` |
| 应用层位宽 | `32 bit` |
| 应用层默认值 | `7'h20` |
| 动作类型 | `ACTION_KIND_CFG_WRITE_C` |
| 实现层参数名 | `COMM_RX_IMPL_SYNC_CORR_PEAK_TH_C` |
| 实现层参数 id | `8'd7` |
| 实现层字数 | `8'd1` |
| 实现层位宽 | `32 bit` |
| 模块最终落地目标 | `cfg_r.frame_sync_corr_peak_th` |
| 模块最终落地位宽 | `7 bit` |
| 模块上电默认生效值 | `7'h20` |
| 可选项数量 | `0` |
| 映射表 | 无 |
| 来源 pkg 常量 | `COMM_RX_CMD_GROUP_VALUE_C`<br>`COMM_RX_PARAM_SYNC_CORR_PEAK_TH_C`<br>`COMM_RX_IMPL_SYNC_CORR_PEAK_TH_C` |
| 说明 | 应用层参数 `COMM_RX_PARAM_SYNC_CORR_PEAK_TH_C` 在组 `COMM_RX_CMD_GROUP_VALUE_C` 内通过 `ACTION_KIND_CFG_WRITE_C` 转换到实现层参数 `COMM_RX_IMPL_SYNC_CORR_PEAK_TH_C`。 |

### COMM_RX_PARAM_LOCK_TH_C

| 字段 | 内容 |
| --- | --- |
| 应用层参数名 | `COMM_RX_PARAM_LOCK_TH_C` |
| 应用层参数中文名 | 帧锁定门限值 |
| 应用层参数 id | `8'd8` |
| 所属 group | `COMM_RX_CMD_GROUP_VALUE_C` |
| 参数类型 | `PARAM_KIND_VALUE_C` |
| 应用层字数 | `WORD_COUNT_SINGLE_C` |
| 应用层位宽 | `32 bit` |
| 应用层默认值 | `16'h0020` |
| 动作类型 | `ACTION_KIND_CFG_WRITE_C` |
| 实现层参数名 | `COMM_RX_IMPL_LOCK_TH_C` |
| 实现层参数 id | `8'd8` |
| 实现层字数 | `8'd1` |
| 实现层位宽 | `32 bit` |
| 模块最终落地目标 | `cfg_r.frame_lock_threshold` |
| 模块最终落地位宽 | `16 bit` |
| 模块上电默认生效值 | `16'h0020` |
| 可选项数量 | `0` |
| 映射表 | 无 |
| 来源 pkg 常量 | `COMM_RX_CMD_GROUP_VALUE_C`<br>`COMM_RX_PARAM_LOCK_TH_C`<br>`COMM_RX_IMPL_LOCK_TH_C` |
| 说明 | 应用层参数 `COMM_RX_PARAM_LOCK_TH_C` 在组 `COMM_RX_CMD_GROUP_VALUE_C` 内通过 `ACTION_KIND_CFG_WRITE_C` 转换到实现层参数 `COMM_RX_IMPL_LOCK_TH_C`。 |

### COMM_RX_PARAM_UNLOCK_TH_C

| 字段 | 内容 |
| --- | --- |
| 应用层参数名 | `COMM_RX_PARAM_UNLOCK_TH_C` |
| 应用层参数中文名 | 帧失锁门限值 |
| 应用层参数 id | `8'd9` |
| 所属 group | `COMM_RX_CMD_GROUP_VALUE_C` |
| 参数类型 | `PARAM_KIND_VALUE_C` |
| 应用层字数 | `WORD_COUNT_SINGLE_C` |
| 应用层位宽 | `32 bit` |
| 应用层默认值 | `16'h0004` |
| 动作类型 | `ACTION_KIND_CFG_WRITE_C` |
| 实现层参数名 | `COMM_RX_IMPL_UNLOCK_TH_C` |
| 实现层参数 id | `8'd9` |
| 实现层字数 | `8'd1` |
| 实现层位宽 | `32 bit` |
| 模块最终落地目标 | `cfg_r.frame_unlock_threshold` |
| 模块最终落地位宽 | `16 bit` |
| 模块上电默认生效值 | `16'h0004` |
| 可选项数量 | `0` |
| 映射表 | 无 |
| 来源 pkg 常量 | `COMM_RX_CMD_GROUP_VALUE_C`<br>`COMM_RX_PARAM_UNLOCK_TH_C`<br>`COMM_RX_IMPL_UNLOCK_TH_C` |
| 说明 | 应用层参数 `COMM_RX_PARAM_UNLOCK_TH_C` 在组 `COMM_RX_CMD_GROUP_VALUE_C` 内通过 `ACTION_KIND_CFG_WRITE_C` 转换到实现层参数 `COMM_RX_IMPL_UNLOCK_TH_C`。 |

### COMM_RX_PARAM_RANGE_RESET_C

| 字段 | 内容 |
| --- | --- |
| 应用层参数名 | `COMM_RX_PARAM_RANGE_RESET_C` |
| 应用层参数中文名 | 未标注中文名 |
| 应用层参数 id | `8'd10` |
| 所属 group | `COMM_RX_CMD_GROUP_PULSE_RANGE_RST_C` |
| 参数类型 | `PARAM_KIND_PULSE_C` |
| 应用层字数 | `WORD_COUNT_ZERO_C` |
| 应用层位宽 | `0 bit` |
| 应用层默认值 | 上电默认不触发 |
| 动作类型 | `ACTION_KIND_PULSE_C` |
| 实现层参数名 | `COMM_RX_IMPL_RANGE_RESET_C` |
| 实现层参数 id | `8'd10` |
| 实现层字数 | `8'd1` |
| 实现层位宽 | `32 bit` |
| 模块最终落地目标 | 未找到最终落地目标 |
| 模块最终落地位宽 | 未找到最终落地位宽 |
| 模块上电默认生效值 | `0`（脉冲不触发） |
| 可选项数量 | `0` |
| 映射表 | 无 |
| 来源 pkg 常量 | `COMM_RX_CMD_GROUP_PULSE_RANGE_RST_C`<br>`COMM_RX_PARAM_RANGE_RESET_C`<br>`COMM_RX_IMPL_RANGE_RESET_C` |
| 说明 | 应用层参数 `COMM_RX_PARAM_RANGE_RESET_C` 在组 `COMM_RX_CMD_GROUP_PULSE_RANGE_RST_C` 内通过 `ACTION_KIND_PULSE_C` 转换到实现层参数 `COMM_RX_IMPL_RANGE_RESET_C`。 |

### COMM_RX_PARAM_COUNT_CLEAR_C

| 字段 | 内容 |
| --- | --- |
| 应用层参数名 | `COMM_RX_PARAM_COUNT_CLEAR_C` |
| 应用层参数中文名 | 未标注中文名 |
| 应用层参数 id | `8'd11` |
| 所属 group | `COMM_RX_CMD_GROUP_PULSE_COUNT_CLR_C` |
| 参数类型 | `PARAM_KIND_PULSE_C` |
| 应用层字数 | `WORD_COUNT_ZERO_C` |
| 应用层位宽 | `0 bit` |
| 应用层默认值 | 上电默认不触发 |
| 动作类型 | `ACTION_KIND_PULSE_C` |
| 实现层参数名 | `COMM_RX_IMPL_COUNT_CLEAR_C` |
| 实现层参数 id | `8'd11` |
| 实现层字数 | `8'd1` |
| 实现层位宽 | `32 bit` |
| 模块最终落地目标 | 未找到最终落地目标 |
| 模块最终落地位宽 | 未找到最终落地位宽 |
| 模块上电默认生效值 | `0`（脉冲不触发） |
| 可选项数量 | `0` |
| 映射表 | 无 |
| 来源 pkg 常量 | `COMM_RX_CMD_GROUP_PULSE_COUNT_CLR_C`<br>`COMM_RX_PARAM_COUNT_CLEAR_C`<br>`COMM_RX_IMPL_COUNT_CLEAR_C` |
| 说明 | 应用层参数 `COMM_RX_PARAM_COUNT_CLEAR_C` 在组 `COMM_RX_CMD_GROUP_PULSE_COUNT_CLR_C` 内通过 `ACTION_KIND_PULSE_C` 转换到实现层参数 `COMM_RX_IMPL_COUNT_CLEAR_C`。 |

### COMM_RX_PARAM_MANUAL_RESET_C

| 字段 | 内容 |
| --- | --- |
| 应用层参数名 | `COMM_RX_PARAM_MANUAL_RESET_C` |
| 应用层参数中文名 | 未标注中文名 |
| 应用层参数 id | `8'd12` |
| 所属 group | `COMM_RX_CMD_GROUP_PULSE_MANUAL_RST_C` |
| 参数类型 | `PARAM_KIND_PULSE_C` |
| 应用层字数 | `WORD_COUNT_ZERO_C` |
| 应用层位宽 | `0 bit` |
| 应用层默认值 | 上电默认不触发 |
| 动作类型 | `ACTION_KIND_PULSE_C` |
| 实现层参数名 | `COMM_RX_IMPL_MANUAL_RESET_C` |
| 实现层参数 id | `8'd12` |
| 实现层字数 | `8'd1` |
| 实现层位宽 | `32 bit` |
| 模块最终落地目标 | 未找到最终落地目标 |
| 模块最终落地位宽 | 未找到最终落地位宽 |
| 模块上电默认生效值 | `0`（脉冲不触发） |
| 可选项数量 | `0` |
| 映射表 | 无 |
| 来源 pkg 常量 | `COMM_RX_CMD_GROUP_PULSE_MANUAL_RST_C`<br>`COMM_RX_PARAM_MANUAL_RESET_C`<br>`COMM_RX_IMPL_MANUAL_RESET_C` |
| 说明 | 应用层参数 `COMM_RX_PARAM_MANUAL_RESET_C` 在组 `COMM_RX_CMD_GROUP_PULSE_MANUAL_RST_C` 内通过 `ACTION_KIND_PULSE_C` 转换到实现层参数 `COMM_RX_IMPL_MANUAL_RESET_C`。 |
