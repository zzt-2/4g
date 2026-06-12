# clock_manager_block 遥测指令清单

## 来源

- 遥测 agent：`D:/vivado_project/CZW/CZW_V7_runner_201803/repo_main/import/rtl_source/clock_manager_block/ctrl_tm/clock_manager_tm_agent.sv`
- module_id：`MODULE_ID_CLK_MGMT_C = 4'h0`

## Group 总表

### TM_GROUP_RUNTIME_C

| 上报字索引 | 关联字段 | 字段中文名 | 来源表达式 | 字段真实位宽 |
| --- | --- | --- | --- | --- |
| [TM_GROUP_RUNTIME_C_WORD_0](#tm_group_runtime_c_word_0) | `clock_lock_status` | {lmk100M锁定, adc数据时钟锁定, adc核时钟锁定} | `{29'd0, stat_i.clock_lock_status}` | `3 bit` |

### TM_GROUP_CFG_C

| 上报字索引 | 关联字段 | 字段中文名 | 来源表达式 | 字段真实位宽 |
| --- | --- | --- | --- | --- |
| [TM_GROUP_CFG_C_WORD_0](#tm_group_cfg_c_word_0) | `pps_source_sel` | PPS 来源选择 | `bool_to_u32(cfg_i.pps_source_sel)` | `1 bit` |
| [TM_GROUP_CFG_C_WORD_1](#tm_group_cfg_c_word_1) | `ref_source_sel` | 参考时钟来源选择 | `bool_to_u32(cfg_i.ref_source_sel)` | `1 bit` |

## 上报字说明表

### TM_GROUP_RUNTIME_C_WORD_0

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字索引 | `0` |
| 来源表达式 | `{29'd0, stat_i.clock_lock_status}` |
| 关联字段 | `clock_lock_status` |
| 字段中文名 | {lmk100M锁定, adc数据时钟锁定, adc核时钟锁定} |
| 字段真实位宽 | `3 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_CFG_C_WORD_0

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_CFG_C` |
| group_id | `8'h81` |
| 上报字索引 | `0` |
| 来源表达式 | `bool_to_u32(cfg_i.pps_source_sel)` |
| 关联字段 | `pps_source_sel` |
| 字段中文名 | PPS 来源选择 |
| 字段真实位宽 | `1 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_CFG_C_WORD_1

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_CFG_C` |
| group_id | `8'h81` |
| 上报字索引 | `1` |
| 来源表达式 | `bool_to_u32(cfg_i.ref_source_sel)` |
| 关联字段 | `ref_source_sel` |
| 字段中文名 | 参考时钟来源选择 |
| 字段真实位宽 | `1 bit` |
| 应用层上报字位宽 | `32 bit` |
