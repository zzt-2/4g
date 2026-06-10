# yewu_rece_from_cxp_block 遥测状态具体执行

说明：以下遥测帧示例统一按“所有上报数据字为 0”计算，不使用模块 `default_cfg()` 的默认配置值。

## TM_GROUP_RUNTIME_C

| 字段 | 内容 |
| --- | --- |
| module_id | `MODULE_ID_BIZ_RX_C = 4'h5` |
| group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字数常量 | `TM_RUNTIME_WORDS_C` |
| 上报字数 | `6` |
| 应用层头字 | `12580060` |
| 校验字 | `2D27FC99` |
| 完整字节流 | `1A CF FC 1D 00 00 00 1C 12 58 00 60 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 2D 27 FC 99` |

| 上报字索引 | 来源表达式 | 关联字段 | 字段真实位宽 | 默认值 |
| --- | --- | --- | --- | --- |
| `0` | `stat_i.total_count` | `total_count` | `32 bit` | `00000000` |
| `1` | `stat_i.error_frame_count` | `error_frame_count` | `32 bit` | `00000000` |
| `2` | `stat_i.isl_frame_count` | `isl_frame_count` | `32 bit` | `00000000` |
| `3` | `stat_i.pg_frame_count` | `pg_frame_count` | `32 bit` | `00000000` |
| `4` | `bool_to_u32(stat_i.reset_status)` | `reset_status` | `1 bit` | `00000000` |
| `5` | `bool_to_u32(stat_i.flow_ctrl_status)` | `flow_ctrl_status` | `1 bit` | `00000000` |

| 帧字序号 | 含义 | 32bit 值 |
| --- | --- | --- |
| 0 | RS422 帧头 | `1ACFFC1D` |
| 1 | payload_length_bytes | `0000001C` |
| 2 | 应用层头 | `12580060` |
| 3 | 遥测数据字 0 | `00000000` |
| 4 | 遥测数据字 1 | `00000000` |
| 5 | 遥测数据字 2 | `00000000` |
| 6 | 遥测数据字 3 | `00000000` |
| 7 | 遥测数据字 4 | `00000000` |
| 8 | 遥测数据字 5 | `00000000` |
| 9 | checksum | `2D27FC99` |

## TM_GROUP_CFG_C

| 字段 | 内容 |
| --- | --- |
| module_id | `MODULE_ID_BIZ_RX_C = 4'h5` |
| group | `TM_GROUP_CFG_C` |
| group_id | `8'h81` |
| 上报字数常量 | `TM_CFG_WORDS_C` |
| 上报字数 | `1` |
| 应用层头字 | `12581010` |
| 校验字 | `2D280C35` |
| 完整字节流 | `1A CF FC 1D 00 00 00 08 12 58 10 10 00 00 00 00 2D 28 0C 35` |

| 上报字索引 | 来源表达式 | 关联字段 | 字段真实位宽 | 默认值 |
| --- | --- | --- | --- | --- |
| `0` | `bool_to_u32(cfg_i.enable)` | `enable` | `1 bit` | `00000000` |

| 帧字序号 | 含义 | 32bit 值 |
| --- | --- | --- |
| 0 | RS422 帧头 | `1ACFFC1D` |
| 1 | payload_length_bytes | `00000008` |
| 2 | 应用层头 | `12581010` |
| 3 | 遥测数据字 0 | `00000000` |
| 4 | checksum | `2D280C35` |
