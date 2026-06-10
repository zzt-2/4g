# comm_tx_block 遥控指令具体执行

说明：以下帧按当前 RTL 协议的有效组帧展开，不再把多参数组误写成单参数单帧。所有带数据的参数默认按 `0` 取值计算校验。

## COMM_TX_CMD_GROUP_MAP_C

| 字段 | 内容 |
| --- | --- |
| 模块 | `comm_tx_block` |
| module_id | `MODULE_ID_COMM_TX_C = 4'h7` |
| group | `COMM_TX_CMD_GROUP_MAP_C` |
| group_id | `8'h10` |
| group参数个数 | `10` |
| 默认payload数据字数 | `10` |
| 应用层头字 | `117100A0` |
| 校验字 | `2C40FCE9` |
| 完整字节流 | `1A CF FC 1D 00 00 00 2C 11 71 00 A0 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 2C 40 FC E9` |

| payload字索引 | 参数名 | 参数组内字索引 | 默认值 |
| --- | --- | --- | --- |
| `0` | `COMM_TX_PARAM_RATE_C` | `0` | `00000000` |
| `1` | `COMM_TX_PARAM_SCRAMBLE_C` | `0` | `00000000` |
| `2` | `COMM_TX_PARAM_ENCODE_C` | `0` | `00000000` |
| `3` | `COMM_TX_PARAM_BER_INJECT_C` | `0` | `00000000` |
| `4` | `COMM_TX_PARAM_CRC_ERROR_C` | `0` | `00000000` |
| `5` | `COMM_TX_PARAM_HEADER_ERROR_C` | `0` | `00000000` |
| `6` | `COMM_TX_PARAM_DATA_TYPE_ERROR_C` | `0` | `00000000` |
| `7` | `COMM_TX_PARAM_FIELD_POS_ERROR_C` | `0` | `00000000` |
| `8` | `COMM_TX_PARAM_ENCODE_ERROR_C` | `0` | `00000000` |
| `9` | `COMM_TX_PARAM_DATA_LINK_BREAK_C` | `0` | `00000000` |

发送 OOK 速率时只替换 `COMM_TX_PARAM_RATE_C` 所在的参数数据字 0：OOK 20M=`00000080`，OOK 10M=`000000A0`，OOK 1M=`000000C0`；替换后需要按实际 payload 重新计算 checksum。

发送编码类型只替换 `COMM_TX_PARAM_ENCODE_C` 所在的参数数据字 2：RS=`00000000`，LDPC=`00000001`；替换后需要按实际 payload 重新计算 checksum。当前工程需确认 LDPC DCP/source 绑定和 `LDPC_ENCODE_EN` 参数后，LDPC 编码链路才能实际生效。

| 帧字序号 | 含义 | 32bit 值 |
| --- | --- | --- |
| 0 | RS422 帧头 | `1ACFFC1D` |
| 1 | payload_length_bytes | `0000002C` |
| 2 | 应用层头 | `117100A0` |
| 3 | 参数数据字 0 | `00000000` |
| 4 | 参数数据字 1 | `00000000` |
| 5 | 参数数据字 2 | `00000000` |
| 6 | 参数数据字 3 | `00000000` |
| 7 | 参数数据字 4 | `00000000` |
| 8 | 参数数据字 5 | `00000000` |
| 9 | 参数数据字 6 | `00000000` |
| 10 | 参数数据字 7 | `00000000` |
| 11 | 参数数据字 8 | `00000000` |
| 12 | 参数数据字 9 | `00000000` |
| 13 | checksum | `2C40FCE9` |

## COMM_TX_CMD_GROUP_PULSE_RESET_C

| 字段 | 内容 |
| --- | --- |
| 模块 | `comm_tx_block` |
| module_id | `MODULE_ID_COMM_TX_C = 4'h7` |
| group | `COMM_TX_CMD_GROUP_PULSE_RESET_C` |
| group_id | `8'h12` |
| group参数个数 | `1` |
| 默认payload数据字数 | `0` |
| 应用层头字 | `11712010` |
| 校验字 | `2C411C31` |
| 完整字节流 | `1A CF FC 1D 00 00 00 04 11 71 20 10 2C 41 1C 31` |

| payload字索引 | 参数名 | 参数组内字索引 | 默认值 |
| --- | --- | --- | --- |
| `-` | `COMM_TX_PARAM_RESET_C` | `-` | `无payload字` |

| 帧字序号 | 含义 | 32bit 值 |
| --- | --- | --- |
| 0 | RS422 帧头 | `1ACFFC1D` |
| 1 | payload_length_bytes | `00000004` |
| 2 | 应用层头 | `11712010` |
| 3 | checksum | `2C411C31` |

## COMM_TX_CMD_GROUP_PULSE_CLEAR_C

| 字段 | 内容 |
| --- | --- |
| 模块 | `comm_tx_block` |
| module_id | `MODULE_ID_COMM_TX_C = 4'h7` |
| group | `COMM_TX_CMD_GROUP_PULSE_CLEAR_C` |
| group_id | `8'h13` |
| group参数个数 | `1` |
| 默认payload数据字数 | `0` |
| 应用层头字 | `11713010` |
| 校验字 | `2C412C31` |
| 完整字节流 | `1A CF FC 1D 00 00 00 04 11 71 30 10 2C 41 2C 31` |

| payload字索引 | 参数名 | 参数组内字索引 | 默认值 |
| --- | --- | --- | --- |
| `-` | `COMM_TX_PARAM_COUNT_CLEAR_C` | `-` | `无payload字` |

| 帧字序号 | 含义 | 32bit 值 |
| --- | --- | --- |
| 0 | RS422 帧头 | `1ACFFC1D` |
| 1 | payload_length_bytes | `00000004` |
| 2 | 应用层头 | `11713010` |
| 3 | checksum | `2C412C31` |
