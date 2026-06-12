# cxp_yewu_block 遥测 UI 字段定义

- 来源：`import/rtl_source/cxp_yewu_block/vars/*_ctrl_pkg.sv` 和 `指令与状态/遥测指令清单/cxp_yewu_block.md`
- word 列表示遥测 payload 数据字索引，不包含 RS422 帧头、长度字、应用层头和 checksum。
- 对于 64bit/192bit 这类跨 word 字段，表中会按每个 32bit 分片列出，软件按字段切片说明重组。

## TM_GROUP_RUNTIME_C

- group_id：`8'h80`

| 参数原始字段名     | UI显示名称                 | word | 索引位宽  | 有符号/无符号 | UI类型 | 参数表格索引                                                                      |
| ------------------ | -------------------------- | ---- | --------- | ------------- | ------ | --------------------------------------------------------------------------------- |
| `reset_status`     | reset_status：复位状态     | `0`  | `word[0]` | 无符号数      | 显示   | [UI_TM_GROUP_RUNTIME_C_RESET_STATUS](#ui_tm_group_runtime_c_reset_status)         |
| `handshake_status` | handshake_status：握手状态 | `1`  | `word[0]` | 无符号数      | 显示   | [UI_TM_GROUP_RUNTIME_C_HANDSHAKE_STATUS](#ui_tm_group_runtime_c_handshake_status) |

## 参数表格

### UI_TM_GROUP_RUNTIME_C_RESET_STATUS

- 原始字段：`reset_status`
- UI名称：reset_status：复位状态
- 显示类型：复位状态
- 截取位置：`word[0]`
- 数据宽度：`1 bit`

| 接收值 | UI显示        | 说明                   |
| ------ | ------------- | ---------------------- |
| `0`    | 空闲          | 未处于复位请求/忙状态  |
| `1`    | 复位中/已接受 | 复位请求已接受或复位忙 |

### UI_TM_GROUP_RUNTIME_C_HANDSHAKE_STATUS

- 原始字段：`handshake_status`
- UI名称：handshake_status：握手状态
- 显示类型：握手状态
- 截取位置：`word[0]`
- 数据宽度：`1 bit`

| 接收值 | UI显示   | 说明           |
| ------ | -------- | -------------- |
| `0`    | 未握手   | 握手状态位为 0 |
| `1`    | 握手有效 | 握手状态位为 1 |
