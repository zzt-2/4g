# yewu_rece_from_cxp_block 遥控指令具体执行

说明：以下帧按当前 RTL 协议的有效组帧展开，不再把多参数组误写成单参数单帧。所有带数据的参数默认按 `0` 取值计算校验。

## BIZ_RX_CMD_GROUP_MAP_C

| 字段 | 内容 |
| --- | --- |
| 模块 | `yewu_rece_from_cxp_block` |
| module_id | `MODULE_ID_BIZ_RX_C = 4'h5` |
| group | `BIZ_RX_CMD_GROUP_MAP_C` |
| group_id | `8'h10` |
| group参数个数 | `1` |
| 默认payload数据字数 | `1` |
| 应用层头字 | `11510010` |
| 校验字 | `2C20FC35` |
| 完整字节流 | `1A CF FC 1D 00 00 00 08 11 51 00 10 00 00 00 00 2C 20 FC 35` |

| payload字索引 | 参数名 | 参数组内字索引 | 默认值 |
| --- | --- | --- | --- |
| `0` | `BIZ_RX_PARAM_ENABLE_C` | `0` | `00000000` |

| 帧字序号 | 含义 | 32bit 值 |
| --- | --- | --- |
| 0 | RS422 帧头 | `1ACFFC1D` |
| 1 | payload_length_bytes | `00000008` |
| 2 | 应用层头 | `11510010` |
| 3 | 参数数据字 0 | `00000000` |
| 4 | checksum | `2C20FC35` |

## BIZ_RX_CMD_GROUP_PULSE_CLEAR_C

| 字段 | 内容 |
| --- | --- |
| 模块 | `yewu_rece_from_cxp_block` |
| module_id | `MODULE_ID_BIZ_RX_C = 4'h5` |
| group | `BIZ_RX_CMD_GROUP_PULSE_CLEAR_C` |
| group_id | `8'h12` |
| group参数个数 | `1` |
| 默认payload数据字数 | `0` |
| 应用层头字 | `11512010` |
| 校验字 | `2C211C31` |
| 完整字节流 | `1A CF FC 1D 00 00 00 04 11 51 20 10 2C 21 1C 31` |

| payload字索引 | 参数名 | 参数组内字索引 | 默认值 |
| --- | --- | --- | --- |
| `-` | `BIZ_RX_PARAM_COUNT_CLEAR_C` | `-` | `无payload字` |

| 帧字序号 | 含义 | 32bit 值 |
| --- | --- | --- |
| 0 | RS422 帧头 | `1ACFFC1D` |
| 1 | payload_length_bytes | `00000004` |
| 2 | 应用层头 | `11512010` |
| 3 | checksum | `2C211C31` |

## BIZ_RX_CMD_GROUP_PULSE_RESET_C

| 字段 | 内容 |
| --- | --- |
| 模块 | `yewu_rece_from_cxp_block` |
| module_id | `MODULE_ID_BIZ_RX_C = 4'h5` |
| group | `BIZ_RX_CMD_GROUP_PULSE_RESET_C` |
| group_id | `8'h13` |
| group参数个数 | `1` |
| 默认payload数据字数 | `0` |
| 应用层头字 | `11513010` |
| 校验字 | `2C212C31` |
| 完整字节流 | `1A CF FC 1D 00 00 00 04 11 51 30 10 2C 21 2C 31` |

| payload字索引 | 参数名 | 参数组内字索引 | 默认值 |
| --- | --- | --- | --- |
| `-` | `BIZ_RX_PARAM_RESET_C` | `-` | `无payload字` |

| 帧字序号 | 含义 | 32bit 值 |
| --- | --- | --- |
| 0 | RS422 帧头 | `1ACFFC1D` |
| 1 | payload_length_bytes | `00000004` |
| 2 | 应用层头 | `11513010` |
| 3 | checksum | `2C212C31` |
