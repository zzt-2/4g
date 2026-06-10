# clock_manager_block 遥控指令具体执行

说明：以下帧按当前 RTL 协议的有效组帧展开，不再把多参数组误写成单参数单帧。所有带数据的参数默认按 `0` 取值计算校验。

## CLOCK_MANAGER_CMD_GROUP_MAP_C

| 字段 | 内容 |
| --- | --- |
| 模块 | `clock_manager_block` |
| module_id | `MODULE_ID_CLK_MGMT_C = 4'h0` |
| group | `CLOCK_MANAGER_CMD_GROUP_MAP_C` |
| group_id | `8'h10` |
| group参数个数 | `2` |
| 默认payload数据字数 | `2` |
| 应用层头字 | `11010020` |
| 校验字 | `2BD0FC49` |
| 完整字节流 | `1A CF FC 1D 00 00 00 0C 11 01 00 20 00 00 00 00 00 00 00 00 2B D0 FC 49` |

| payload字索引 | 参数名 | 参数组内字索引 | 默认值 |
| --- | --- | --- | --- |
| `0` | `CLOCK_MANAGER_PARAM_PPS_SRC_C` | `0` | `00000000` |
| `1` | `CLOCK_MANAGER_PARAM_REF_SRC_C` | `0` | `00000000` |

| 帧字序号 | 含义 | 32bit 值 |
| --- | --- | --- |
| 0 | RS422 帧头 | `1ACFFC1D` |
| 1 | payload_length_bytes | `0000000C` |
| 2 | 应用层头 | `11010020` |
| 3 | 参数数据字 0 | `00000000` |
| 4 | 参数数据字 1 | `00000000` |
| 5 | checksum | `2BD0FC49` |
