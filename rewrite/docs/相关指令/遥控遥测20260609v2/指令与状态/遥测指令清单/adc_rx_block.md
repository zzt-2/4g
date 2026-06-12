# adc_rx_block 遥测指令清单

## 来源

- 遥测 agent：`D:/vivado_project/CZW/CZW_V7_runner_201803/repo_main/import/rtl_source/adc_rx_block/ctrl_tm/adc_rx_tm_agent.sv`
- module_id：`MODULE_ID_ADC_C = 4'h1`

## Group 总表

### TM_GROUP_RUNTIME_C

| 上报字索引 | 关联字段 | 字段中文名 | 来源表达式 | 字段真实位宽 |
| --- | --- | --- | --- | --- |
| [TM_GROUP_RUNTIME_C_WORD_0](#tm_group_runtime_c_word_0) | `reset_status` | ADC 复位状态 | `bool_to_u32(stat_i.reset_status)` | `1 bit` |
| [TM_GROUP_RUNTIME_C_WORD_1](#tm_group_runtime_c_word_1) | `power_good_status` | 时钟/电源正常状态 | `bool_to_u32(stat_i.power_good_status)` | `1 bit` |
| [TM_GROUP_RUNTIME_C_WORD_2](#tm_group_runtime_c_word_2) | `lmx_locked_status` | LMX 锁定状态 | `bool_to_u32(stat_i.lmx_locked_status)` | `1 bit` |
| [TM_GROUP_RUNTIME_C_WORD_3](#tm_group_runtime_c_word_3) | `lmk_locked_status` | LMK 锁定状态 | `bool_to_u32(stat_i.lmk_locked_status)` | `1 bit` |
| [TM_GROUP_RUNTIME_C_WORD_4](#tm_group_runtime_c_word_4) | `data_valid_status` | 数据有效状态 | `bool_to_u32(stat_i.data_valid_status)` | `1 bit` |
| [TM_GROUP_RUNTIME_C_WORD_5](#tm_group_runtime_c_word_5) | `board_status` | {LMX1, LMK12, SPI完成, 采样有效, ADC上电} | `{27'd0, stat_i.board_status}` | `5 bit` |
| [TM_GROUP_RUNTIME_C_WORD_6](#tm_group_runtime_c_word_6) | `rx_power_value` | 接收功率测量值 | `stat_i.rx_power_value` | `32 bit` |

### TM_GROUP_CFG_C

| 上报字索引 | 关联字段 | 字段中文名 | 来源表达式 | 字段真实位宽 |
| --- | --- | --- | --- | --- |
| [TM_GROUP_CFG_C_WORD_0](#tm_group_cfg_c_word_0) | `cal_loop_enable` | ADC 校准环路使能配置 | `bool_to_u32(cfg_i.cal_loop_enable)` | `1 bit` |

## 上报字说明表

### TM_GROUP_RUNTIME_C_WORD_0

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字索引 | `0` |
| 来源表达式 | `bool_to_u32(stat_i.reset_status)` |
| 关联字段 | `reset_status` |
| 字段中文名 | ADC 复位状态 |
| 字段真实位宽 | `1 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_RUNTIME_C_WORD_1

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字索引 | `1` |
| 来源表达式 | `bool_to_u32(stat_i.power_good_status)` |
| 关联字段 | `power_good_status` |
| 字段中文名 | 时钟/电源正常状态 |
| 字段真实位宽 | `1 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_RUNTIME_C_WORD_2

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字索引 | `2` |
| 来源表达式 | `bool_to_u32(stat_i.lmx_locked_status)` |
| 关联字段 | `lmx_locked_status` |
| 字段中文名 | LMX 锁定状态 |
| 字段真实位宽 | `1 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_RUNTIME_C_WORD_3

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字索引 | `3` |
| 来源表达式 | `bool_to_u32(stat_i.lmk_locked_status)` |
| 关联字段 | `lmk_locked_status` |
| 字段中文名 | LMK 锁定状态 |
| 字段真实位宽 | `1 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_RUNTIME_C_WORD_4

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字索引 | `4` |
| 来源表达式 | `bool_to_u32(stat_i.data_valid_status)` |
| 关联字段 | `data_valid_status` |
| 字段中文名 | 数据有效状态 |
| 字段真实位宽 | `1 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_RUNTIME_C_WORD_5

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字索引 | `5` |
| 来源表达式 | `{27'd0, stat_i.board_status}` |
| 关联字段 | `board_status` |
| 字段中文名 | {LMX1, LMK12, SPI完成, 采样有效, ADC上电} |
| 字段真实位宽 | `5 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_RUNTIME_C_WORD_6

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字索引 | `6` |
| 来源表达式 | `stat_i.rx_power_value` |
| 关联字段 | `rx_power_value` |
| 字段中文名 | 接收功率测量值 |
| 字段真实位宽 | `32 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_CFG_C_WORD_0

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_CFG_C` |
| group_id | `8'h81` |
| 上报字索引 | `0` |
| 来源表达式 | `bool_to_u32(cfg_i.cal_loop_enable)` |
| 关联字段 | `cal_loop_enable` |
| 字段中文名 | ADC 校准环路使能配置 |
| 字段真实位宽 | `1 bit` |
| 应用层上报字位宽 | `32 bit` |
