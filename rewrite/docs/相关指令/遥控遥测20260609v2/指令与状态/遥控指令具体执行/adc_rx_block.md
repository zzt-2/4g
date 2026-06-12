# adc_rx_block 遥控指令具体执行

说明：以下帧按当前 RTL 协议的有效组帧展开，不再把多参数组误写成单参数单帧。所有带数据的参数默认按 `0` 取值计算校验。

## ADC_RX_CMD_GROUP_MAP_C

| 字段 | 内容 |
| --- | --- |
| 模块 | `adc_rx_block` |
| module_id | `MODULE_ID_ADC_C = 4'h1` |
| group | `ADC_RX_CMD_GROUP_MAP_C` |
| group_id | `8'h10` |
| group参数个数 | `1` |
| 默认payload数据字数 | `1` |
| 应用层头字 | `11110010` |
| 校验字 | `2BE0FC35` |
| 完整字节流 | `1A CF FC 1D 00 00 00 08 11 11 00 10 00 00 00 00 2B E0 FC 35` |

| payload字索引 | 参数名 | 参数组内字索引 | 默认值 |
| --- | --- | --- | --- |
| `0` | `ADC_RX_PARAM_CAL_LOOP_C` | `0` | `00000000` |

| 帧字序号 | 含义 | 32bit 值 |
| --- | --- | --- |
| 0 | RS422 帧头 | `1ACFFC1D` |
| 1 | payload_length_bytes | `00000008` |
| 2 | 应用层头 | `11110010` |
| 3 | 参数数据字 0 | `00000000` |
| 4 | checksum | `2BE0FC35` |

## ADC_RX_CMD_GROUP_PULSE_RESET_C

| 字段 | 内容 |
| --- | --- |
| 模块 | `adc_rx_block` |
| module_id | `MODULE_ID_ADC_C = 4'h1` |
| group | `ADC_RX_CMD_GROUP_PULSE_RESET_C` |
| group_id | `8'h12` |
| group参数个数 | `1` |
| 默认payload数据字数 | `0` |
| 应用层头字 | `11112010` |
| 校验字 | `2BE11C31` |
| 完整字节流 | `1A CF FC 1D 00 00 00 04 11 11 20 10 2B E1 1C 31` |

| payload字索引 | 参数名 | 参数组内字索引 | 默认值 |
| --- | --- | --- | --- |
| `-` | `ADC_RX_PARAM_RESET_C` | `-` | `无payload字` |

| 帧字序号 | 含义 | 32bit 值 |
| --- | --- | --- |
| 0 | RS422 帧头 | `1ACFFC1D` |
| 1 | payload_length_bytes | `00000004` |
| 2 | 应用层头 | `11112010` |
| 3 | checksum | `2BE11C31` |
