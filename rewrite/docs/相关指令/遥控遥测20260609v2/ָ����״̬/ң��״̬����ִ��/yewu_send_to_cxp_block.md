# yewu_send_to_cxp_block 遥测状态具体执行

说明：以下遥测帧示例统一按“所有上报数据字为 0”计算，不使用模块 `default_cfg()` 的默认配置值。

## TM_GROUP_RUNTIME_C

| 字段 | 内容 |
| --- | --- |
| module_id | `MODULE_ID_BIZ_TX_C = 4'h6` |
| group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字数常量 | `TM_RUNTIME_WORDS_C` |
| 上报字数 | `4` |
| 应用层头字 | `12680040` |
| 校验字 | `2D37FC71` |
| 完整字节流 | `1A CF FC 1D 00 00 00 14 12 68 00 40 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 2D 37 FC 71` |

| 上报字索引 | 来源表达式 | 关联字段 | 字段真实位宽 | 默认值 |
| --- | --- | --- | --- | --- |
| `0` | `stat_i.total_count` | `total_count` | `32 bit` | `00000000` |
| `1` | `stat_i.link_status_frame_count` | `link_status_frame_count` | `32 bit` | `00000000` |
| `2` | `stat_i.flow_ctrl_frame_count` | `flow_ctrl_frame_count` | `32 bit` | `00000000` |
| `3` | `bool_to_u32(stat_i.reset_status)` | `reset_status` | `1 bit` | `00000000` |

| 帧字序号 | 含义 | 32bit 值 |
| --- | --- | --- |
| 0 | RS422 帧头 | `1ACFFC1D` |
| 1 | payload_length_bytes | `00000014` |
| 2 | 应用层头 | `12680040` |
| 3 | 遥测数据字 0 | `00000000` |
| 4 | 遥测数据字 1 | `00000000` |
| 5 | 遥测数据字 2 | `00000000` |
| 6 | 遥测数据字 3 | `00000000` |
| 7 | checksum | `2D37FC71` |

## TM_GROUP_CFG_C

| 字段 | 内容 |
| --- | --- |
| module_id | `MODULE_ID_BIZ_TX_C = 4'h6` |
| group | `TM_GROUP_CFG_C` |
| group_id | `8'h81` |
| 上报字数常量 | `TM_CFG_WORDS_C` |
| 上报字数 | `1` |
| 应用层头字 | `12681010` |
| 校验字 | `2D380C35` |
| 完整字节流 | `1A CF FC 1D 00 00 00 08 12 68 10 10 00 00 00 00 2D 38 0C 35` |

| 上报字索引 | 来源表达式 | 关联字段 | 字段真实位宽 | 默认值 |
| --- | --- | --- | --- | --- |
| `0` | `bool_to_u32(cfg_i.enable)` | `enable` | `1 bit` | `00000000` |

| 帧字序号 | 含义 | 32bit 值 |
| --- | --- | --- |
| 0 | RS422 帧头 | `1ACFFC1D` |
| 1 | payload_length_bytes | `00000008` |
| 2 | 应用层头 | `12681010` |
| 3 | 遥测数据字 0 | `00000000` |
| 4 | checksum | `2D380C35` |
