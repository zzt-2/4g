# clock_manager_block 遥测状态具体执行

说明：以下遥测帧示例统一按“所有上报数据字为 0”计算，不使用模块 `default_cfg()` 的默认配置值。

## TM_GROUP_RUNTIME_C

| 字段 | 内容 |
| --- | --- |
| module_id | `MODULE_ID_CLK_MGMT_C = 4'h0` |
| group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字数常量 | `TM_RUNTIME_WORDS_C` |
| 上报字数 | `1` |
| 应用层头字 | `12080010` |
| 校验字 | `2CD7FC35` |
| 完整字节流 | `1A CF FC 1D 00 00 00 08 12 08 00 10 00 00 00 00 2C D7 FC 35` |

| 上报字索引 | 来源表达式 | 关联字段 | 字段真实位宽 | 默认值 |
| --- | --- | --- | --- | --- |
| `0` | `{29'd0, stat_i.clock_lock_status}` | `clock_lock_status` | `3 bit` | `00000000` |

| 帧字序号 | 含义 | 32bit 值 |
| --- | --- | --- |
| 0 | RS422 帧头 | `1ACFFC1D` |
| 1 | payload_length_bytes | `00000008` |
| 2 | 应用层头 | `12080010` |
| 3 | 遥测数据字 0 | `00000000` |
| 4 | checksum | `2CD7FC35` |

## TM_GROUP_CFG_C

| 字段 | 内容 |
| --- | --- |
| module_id | `MODULE_ID_CLK_MGMT_C = 4'h0` |
| group | `TM_GROUP_CFG_C` |
| group_id | `8'h81` |
| 上报字数常量 | `TM_CFG_WORDS_C` |
| 上报字数 | `2` |
| 应用层头字 | `12081020` |
| 校验字 | `2CD80C49` |
| 完整字节流 | `1A CF FC 1D 00 00 00 0C 12 08 10 20 00 00 00 00 00 00 00 00 2C D8 0C 49` |

| 上报字索引 | 来源表达式 | 关联字段 | 字段真实位宽 | 默认值 |
| --- | --- | --- | --- | --- |
| `0` | `bool_to_u32(cfg_i.pps_source_sel)` | `pps_source_sel` | `1 bit` | `00000000` |
| `1` | `bool_to_u32(cfg_i.ref_source_sel)` | `ref_source_sel` | `1 bit` | `00000000` |

| 帧字序号 | 含义 | 32bit 值 |
| --- | --- | --- |
| 0 | RS422 帧头 | `1ACFFC1D` |
| 1 | payload_length_bytes | `0000000C` |
| 2 | 应用层头 | `12081020` |
| 3 | 遥测数据字 0 | `00000000` |
| 4 | 遥测数据字 1 | `00000000` |
| 5 | checksum | `2CD80C49` |
