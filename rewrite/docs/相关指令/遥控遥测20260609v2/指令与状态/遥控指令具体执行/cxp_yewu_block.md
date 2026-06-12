# cxp_yewu_block 遥控指令具体执行

说明：以下帧按当前 RTL 协议的有效组帧展开，不再把多参数组误写成单参数单帧。所有带数据的参数默认按 `0` 取值计算校验。

## CXP_CMD_GROUP_PULSE_RESET_C

| 字段 | 内容 |
| --- | --- |
| 模块 | `cxp_yewu_block` |
| module_id | `MODULE_ID_CXP_C = 4'h3` |
| group | `CXP_CMD_GROUP_PULSE_RESET_C` |
| group_id | `8'h12` |
| group参数个数 | `1` |
| 默认payload数据字数 | `0` |
| 应用层头字 | `11312010` |
| 校验字 | `2C011C31` |
| 完整字节流 | `1A CF FC 1D 00 00 00 04 11 31 20 10 2C 01 1C 31` |

| payload字索引 | 参数名 | 参数组内字索引 | 默认值 |
| --- | --- | --- | --- |
| `-` | `CXP_PARAM_RESET_C` | `-` | `无payload字` |

| 帧字序号 | 含义 | 32bit 值 |
| --- | --- | --- |
| 0 | RS422 帧头 | `1ACFFC1D` |
| 1 | payload_length_bytes | `00000004` |
| 2 | 应用层头 | `11312010` |
| 3 | checksum | `2C011C31` |
