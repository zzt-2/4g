# cxp_yewu_block 遥测指令清单

## 来源

- 遥测 agent：`D:/vivado_project/CZW/CZW_V7_runner_201803/repo_main/import/rtl_source/cxp_yewu_block/ctrl_tm/cxp_yewu_tm_agent.sv`
- module_id：`MODULE_ID_CXP_C = 4'h3`

## Group 总表

### TM_GROUP_RUNTIME_C

| 上报字索引 | 关联字段 | 字段中文名 | 来源表达式 | 字段真实位宽 |
| --- | --- | --- | --- | --- |
| [TM_GROUP_RUNTIME_C_WORD_0](#tm_group_runtime_c_word_0) | `reset_status` | reset_status：未标注中文名 | `bool_to_u32(stat_i.reset_status)` | `1 bit` |
| [TM_GROUP_RUNTIME_C_WORD_1](#tm_group_runtime_c_word_1) | `handshake_status` | handshake_status：未标注中文名 | `bool_to_u32(stat_i.handshake_status)` | `1 bit` |

## 上报字说明表

### TM_GROUP_RUNTIME_C_WORD_0

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字索引 | `0` |
| 来源表达式 | `bool_to_u32(stat_i.reset_status)` |
| 关联字段 | `reset_status` |
| 字段中文名 | reset_status：未标注中文名 |
| 字段真实位宽 | `1 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_RUNTIME_C_WORD_1

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字索引 | `1` |
| 来源表达式 | `bool_to_u32(stat_i.handshake_status)` |
| 关联字段 | `handshake_status` |
| 字段中文名 | handshake_status：未标注中文名 |
| 字段真实位宽 | `1 bit` |
| 应用层上报字位宽 | `32 bit` |
