# laser_ctrl_block 遥控指令具体执行

说明：以下帧按当前 RTL 协议的有效组帧展开，不再把多参数组误写成单参数单帧。所有带数据的参数默认按 `0` 取值计算校验。

## LASER_CTRL_CMD_GROUP_TXM_ON_C

| 字段 | 内容 |
| --- | --- |
| 模块 | `laser_ctrl_block` |
| module_id | `MODULE_ID_LASER_CTRL_C = 4'h4` |
| group | `LASER_CTRL_CMD_GROUP_TXM_ON_C` |
| group_id | `8'h10` |
| group参数个数 | `1` |
| 默认payload数据字数 | `1` |
| 应用层头字 | `11410010` |
| 校验字 | `2C10FC35` |
| 完整字节流 | `1A CF FC 1D 00 00 00 08 11 41 00 10 00 00 00 00 2C 10 FC 35` |

| payload字索引 | 参数名 | 参数组内字索引 | 默认值 |
| --- | --- | --- | --- |
| `0` | `LASER_PARAM_TXM_ON_C` | `0` | `00000000` |

| 帧字序号 | 含义 | 32bit 值 |
| --- | --- | --- |
| 0 | RS422 帧头 | `1ACFFC1D` |
| 1 | payload_length_bytes | `00000008` |
| 2 | 应用层头 | `11410010` |
| 3 | 参数数据字 0 | `00000000` |
| 4 | checksum | `2C10FC35` |

## LASER_CTRL_CMD_GROUP_LO_ON_C

| 字段 | 内容 |
| --- | --- |
| 模块 | `laser_ctrl_block` |
| module_id | `MODULE_ID_LASER_CTRL_C = 4'h4` |
| group | `LASER_CTRL_CMD_GROUP_LO_ON_C` |
| group_id | `8'h11` |
| group参数个数 | `1` |
| 默认payload数据字数 | `1` |
| 应用层头字 | `11411010` |
| 校验字 | `2C110C35` |
| 完整字节流 | `1A CF FC 1D 00 00 00 08 11 41 10 10 00 00 00 00 2C 11 0C 35` |

| payload字索引 | 参数名 | 参数组内字索引 | 默认值 |
| --- | --- | --- | --- |
| `0` | `LASER_PARAM_LO_ON_C` | `0` | `00000000` |

| 帧字序号 | 含义 | 32bit 值 |
| --- | --- | --- |
| 0 | RS422 帧头 | `1ACFFC1D` |
| 1 | payload_length_bytes | `00000008` |
| 2 | 应用层头 | `11411010` |
| 3 | 参数数据字 0 | `00000000` |
| 4 | checksum | `2C110C35` |

## LASER_CTRL_CMD_GROUP_WAVE_SET_ON_C

| 字段 | 内容 |
| --- | --- |
| 模块 | `laser_ctrl_block` |
| module_id | `MODULE_ID_LASER_CTRL_C = 4'h4` |
| group | `LASER_CTRL_CMD_GROUP_WAVE_SET_ON_C` |
| group_id | `8'h12` |
| group参数个数 | `1` |
| 默认payload数据字数 | `1` |
| 应用层头字 | `11412010` |
| 校验字 | `2C111C35` |
| 完整字节流 | `1A CF FC 1D 00 00 00 08 11 41 20 10 00 00 00 00 2C 11 1C 35` |

| payload字索引 | 参数名 | 参数组内字索引 | 默认值 |
| --- | --- | --- | --- |
| `0` | `LASER_PARAM_WAVE_SET_ON_C` | `0` | `00000000` |

| 帧字序号 | 含义 | 32bit 值 |
| --- | --- | --- |
| 0 | RS422 帧头 | `1ACFFC1D` |
| 1 | payload_length_bytes | `00000008` |
| 2 | 应用层头 | `11412010` |
| 3 | 参数数据字 0 | `00000000` |
| 4 | checksum | `2C111C35` |

## LASER_CTRL_CMD_GROUP_TEC_ON1_C

| 字段 | 内容 |
| --- | --- |
| 模块 | `laser_ctrl_block` |
| module_id | `MODULE_ID_LASER_CTRL_C = 4'h4` |
| group | `LASER_CTRL_CMD_GROUP_TEC_ON1_C` |
| group_id | `8'h13` |
| group参数个数 | `1` |
| 默认payload数据字数 | `1` |
| 应用层头字 | `11413010` |
| 校验字 | `2C112C35` |
| 完整字节流 | `1A CF FC 1D 00 00 00 08 11 41 30 10 00 00 00 00 2C 11 2C 35` |

| payload字索引 | 参数名 | 参数组内字索引 | 默认值 |
| --- | --- | --- | --- |
| `0` | `LASER_PARAM_TEC_ON1_C` | `0` | `00000000` |

| 帧字序号 | 含义 | 32bit 值 |
| --- | --- | --- |
| 0 | RS422 帧头 | `1ACFFC1D` |
| 1 | payload_length_bytes | `00000008` |
| 2 | 应用层头 | `11413010` |
| 3 | 参数数据字 0 | `00000000` |
| 4 | checksum | `2C112C35` |

## LASER_CTRL_CMD_GROUP_TEC_ON2_C

| 字段 | 内容 |
| --- | --- |
| 模块 | `laser_ctrl_block` |
| module_id | `MODULE_ID_LASER_CTRL_C = 4'h4` |
| group | `LASER_CTRL_CMD_GROUP_TEC_ON2_C` |
| group_id | `8'h14` |
| group参数个数 | `1` |
| 默认payload数据字数 | `1` |
| 应用层头字 | `11414010` |
| 校验字 | `2C113C35` |
| 完整字节流 | `1A CF FC 1D 00 00 00 08 11 41 40 10 00 00 00 00 2C 11 3C 35` |

| payload字索引 | 参数名 | 参数组内字索引 | 默认值 |
| --- | --- | --- | --- |
| `0` | `LASER_PARAM_TEC_ON2_C` | `0` | `00000000` |

| 帧字序号 | 含义 | 32bit 值 |
| --- | --- | --- |
| 0 | RS422 帧头 | `1ACFFC1D` |
| 1 | payload_length_bytes | `00000008` |
| 2 | 应用层头 | `11414010` |
| 3 | 参数数据字 0 | `00000000` |
| 4 | checksum | `2C113C35` |

## LASER_CTRL_CMD_GROUP_MODU_MODE_C

| 字段 | 内容 |
| --- | --- |
| 模块 | `laser_ctrl_block` |
| module_id | `MODULE_ID_LASER_CTRL_C = 4'h4` |
| group | `LASER_CTRL_CMD_GROUP_MODU_MODE_C` |
| group_id | `8'h15` |
| group参数个数 | `1` |
| 默认payload数据字数 | `1` |
| 应用层头字 | `11415010` |
| 校验字 | `2C114C35` |
| 完整字节流 | `1A CF FC 1D 00 00 00 08 11 41 50 10 00 00 00 00 2C 11 4C 35` |

| payload字索引 | 参数名 | 参数组内字索引 | 默认值 |
| --- | --- | --- | --- |
| `0` | `LASER_PARAM_MODU_MODE_C` | `0` | `00000000` |

| 帧字序号 | 含义 | 32bit 值 |
| --- | --- | --- |
| 0 | RS422 帧头 | `1ACFFC1D` |
| 1 | payload_length_bytes | `00000008` |
| 2 | 应用层头 | `11415010` |
| 3 | 参数数据字 0 | `00000000` |
| 4 | checksum | `2C114C35` |

## LASER_CTRL_CMD_GROUP_VOL_AUTO_C

| 字段 | 内容 |
| --- | --- |
| 模块 | `laser_ctrl_block` |
| module_id | `MODULE_ID_LASER_CTRL_C = 4'h4` |
| group | `LASER_CTRL_CMD_GROUP_VOL_AUTO_C` |
| group_id | `8'h16` |
| group参数个数 | `1` |
| 默认payload数据字数 | `1` |
| 应用层头字 | `11416010` |
| 校验字 | `2C115C35` |
| 完整字节流 | `1A CF FC 1D 00 00 00 08 11 41 60 10 00 00 00 00 2C 11 5C 35` |

| payload字索引 | 参数名 | 参数组内字索引 | 默认值 |
| --- | --- | --- | --- |
| `0` | `LASER_PARAM_VOL_AUTO_C` | `0` | `00000000` |

| 帧字序号 | 含义 | 32bit 值 |
| --- | --- | --- |
| 0 | RS422 帧头 | `1ACFFC1D` |
| 1 | payload_length_bytes | `00000008` |
| 2 | 应用层头 | `11416010` |
| 3 | 参数数据字 0 | `00000000` |
| 4 | checksum | `2C115C35` |

## LASER_CTRL_CMD_GROUP_TXM1_SET_C

| 字段 | 内容 |
| --- | --- |
| 模块 | `laser_ctrl_block` |
| module_id | `MODULE_ID_LASER_CTRL_C = 4'h4` |
| group | `LASER_CTRL_CMD_GROUP_TXM1_SET_C` |
| group_id | `8'h20` |
| group参数个数 | `1` |
| 默认payload数据字数 | `1` |
| 应用层头字 | `11420010` |
| 校验字 | `2C11FC35` |
| 完整字节流 | `1A CF FC 1D 00 00 00 08 11 42 00 10 00 00 00 00 2C 11 FC 35` |

| payload字索引 | 参数名 | 参数组内字索引 | 默认值 |
| --- | --- | --- | --- |
| `0` | `LASER_PARAM_TXM1_SET_C` | `0` | `00000000` |

| 帧字序号 | 含义 | 32bit 值 |
| --- | --- | --- |
| 0 | RS422 帧头 | `1ACFFC1D` |
| 1 | payload_length_bytes | `00000008` |
| 2 | 应用层头 | `11420010` |
| 3 | 参数数据字 0 | `00000000` |
| 4 | checksum | `2C11FC35` |

## LASER_CTRL_CMD_GROUP_TXM2_SET_C

| 字段 | 内容 |
| --- | --- |
| 模块 | `laser_ctrl_block` |
| module_id | `MODULE_ID_LASER_CTRL_C = 4'h4` |
| group | `LASER_CTRL_CMD_GROUP_TXM2_SET_C` |
| group_id | `8'h21` |
| group参数个数 | `1` |
| 默认payload数据字数 | `1` |
| 应用层头字 | `11421010` |
| 校验字 | `2C120C35` |
| 完整字节流 | `1A CF FC 1D 00 00 00 08 11 42 10 10 00 00 00 00 2C 12 0C 35` |

| payload字索引 | 参数名 | 参数组内字索引 | 默认值 |
| --- | --- | --- | --- |
| `0` | `LASER_PARAM_TXM2_SET_C` | `0` | `00000000` |

| 帧字序号 | 含义 | 32bit 值 |
| --- | --- | --- |
| 0 | RS422 帧头 | `1ACFFC1D` |
| 1 | payload_length_bytes | `00000008` |
| 2 | 应用层头 | `11421010` |
| 3 | 参数数据字 0 | `00000000` |
| 4 | checksum | `2C120C35` |

## LASER_CTRL_CMD_GROUP_LO1_SET_C

| 字段 | 内容 |
| --- | --- |
| 模块 | `laser_ctrl_block` |
| module_id | `MODULE_ID_LASER_CTRL_C = 4'h4` |
| group | `LASER_CTRL_CMD_GROUP_LO1_SET_C` |
| group_id | `8'h22` |
| group参数个数 | `1` |
| 默认payload数据字数 | `1` |
| 应用层头字 | `11422010` |
| 校验字 | `2C121C35` |
| 完整字节流 | `1A CF FC 1D 00 00 00 08 11 42 20 10 00 00 00 00 2C 12 1C 35` |

| payload字索引 | 参数名 | 参数组内字索引 | 默认值 |
| --- | --- | --- | --- |
| `0` | `LASER_PARAM_LO1_SET_C` | `0` | `00000000` |

| 帧字序号 | 含义 | 32bit 值 |
| --- | --- | --- |
| 0 | RS422 帧头 | `1ACFFC1D` |
| 1 | payload_length_bytes | `00000008` |
| 2 | 应用层头 | `11422010` |
| 3 | 参数数据字 0 | `00000000` |
| 4 | checksum | `2C121C35` |

## LASER_CTRL_CMD_GROUP_LO2_SET_C

| 字段 | 内容 |
| --- | --- |
| 模块 | `laser_ctrl_block` |
| module_id | `MODULE_ID_LASER_CTRL_C = 4'h4` |
| group | `LASER_CTRL_CMD_GROUP_LO2_SET_C` |
| group_id | `8'h23` |
| group参数个数 | `1` |
| 默认payload数据字数 | `1` |
| 应用层头字 | `11423010` |
| 校验字 | `2C122C35` |
| 完整字节流 | `1A CF FC 1D 00 00 00 08 11 42 30 10 00 00 00 00 2C 12 2C 35` |

| payload字索引 | 参数名 | 参数组内字索引 | 默认值 |
| --- | --- | --- | --- |
| `0` | `LASER_PARAM_LO2_SET_C` | `0` | `00000000` |

| 帧字序号 | 含义 | 32bit 值 |
| --- | --- | --- |
| 0 | RS422 帧头 | `1ACFFC1D` |
| 1 | payload_length_bytes | `00000008` |
| 2 | 应用层头 | `11423010` |
| 3 | 参数数据字 0 | `00000000` |
| 4 | checksum | `2C122C35` |
