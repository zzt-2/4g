# yewu_rece_from_cxp_block 遥测指令清单

## 来源

- 遥测 agent：`D:/vivado_project/CZW/CZW_V7_runner_201803/repo_main/import/rtl_source/yewu_rece_from_cxp_block/ctrl_tm/yewu_rece_from_cxp_tm_agent.sv`
- module_id：`MODULE_ID_BIZ_RX_C = 4'h5`

## Group 总表

### TM_GROUP_RUNTIME_C

| 上报字索引 | 关联字段 | 字段中文名 | 来源表达式 | 字段真实位宽 |
| --- | --- | --- | --- | --- |
| [TM_GROUP_RUNTIME_C_WORD_0](#tm_group_runtime_c_word_0) | `total_count` | 总接收帧计数 | `stat_i.total_count` | `32 bit` |
| [TM_GROUP_RUNTIME_C_WORD_1](#tm_group_runtime_c_word_1) | `error_frame_count` | 错误帧计数 | `stat_i.error_frame_count` | `32 bit` |
| [TM_GROUP_RUNTIME_C_WORD_2](#tm_group_runtime_c_word_2) | `isl_frame_count` | 接收帧计数 | `stat_i.isl_frame_count` | `32 bit` |
| [TM_GROUP_RUNTIME_C_WORD_3](#tm_group_runtime_c_word_3) | `pg_frame_count` | 背压相关计数 | `stat_i.pg_frame_count` | `32 bit` |
| [TM_GROUP_RUNTIME_C_WORD_4](#tm_group_runtime_c_word_4) | `reset_status` | 复位状态 | `bool_to_u32(stat_i.reset_status)` | `1 bit` |
| [TM_GROUP_RUNTIME_C_WORD_5](#tm_group_runtime_c_word_5) | `flow_ctrl_status` | 流控状态 | `bool_to_u32(stat_i.flow_ctrl_status)` | `1 bit` |

### TM_GROUP_CFG_C

| 上报字索引 | 关联字段 | 字段中文名 | 来源表达式 | 字段真实位宽 |
| --- | --- | --- | --- | --- |
| [TM_GROUP_CFG_C_WORD_0](#tm_group_cfg_c_word_0) | `enable` | 业务接收使能配置 | `bool_to_u32(cfg_i.enable)` | `1 bit` |

## 上报字说明表

### TM_GROUP_RUNTIME_C_WORD_0

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字索引 | `0` |
| 来源表达式 | `stat_i.total_count` |
| 关联字段 | `total_count` |
| 字段中文名 | 总接收帧计数 |
| 字段真实位宽 | `32 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_RUNTIME_C_WORD_1

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字索引 | `1` |
| 来源表达式 | `stat_i.error_frame_count` |
| 关联字段 | `error_frame_count` |
| 字段中文名 | 错误帧计数 |
| 字段真实位宽 | `32 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_RUNTIME_C_WORD_2

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字索引 | `2` |
| 来源表达式 | `stat_i.isl_frame_count` |
| 关联字段 | `isl_frame_count` |
| 字段中文名 | 接收帧计数 |
| 字段真实位宽 | `32 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_RUNTIME_C_WORD_3

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字索引 | `3` |
| 来源表达式 | `stat_i.pg_frame_count` |
| 关联字段 | `pg_frame_count` |
| 字段中文名 | 背压相关计数 |
| 字段真实位宽 | `32 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_RUNTIME_C_WORD_4

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字索引 | `4` |
| 来源表达式 | `bool_to_u32(stat_i.reset_status)` |
| 关联字段 | `reset_status` |
| 字段中文名 | 复位状态 |
| 字段真实位宽 | `1 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_RUNTIME_C_WORD_5

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字索引 | `5` |
| 来源表达式 | `bool_to_u32(stat_i.flow_ctrl_status)` |
| 关联字段 | `flow_ctrl_status` |
| 字段中文名 | 流控状态 |
| 字段真实位宽 | `1 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_CFG_C_WORD_0

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_CFG_C` |
| group_id | `8'h81` |
| 上报字索引 | `0` |
| 来源表达式 | `bool_to_u32(cfg_i.enable)` |
| 关联字段 | `enable` |
| 字段中文名 | 业务接收使能配置 |
| 字段真实位宽 | `1 bit` |
| 应用层上报字位宽 | `32 bit` |
