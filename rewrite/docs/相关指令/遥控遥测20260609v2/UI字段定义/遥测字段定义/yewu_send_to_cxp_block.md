# yewu_send_to_cxp_block 遥测 UI 字段定义

- 来源：`import/rtl_source/yewu_send_to_cxp_block/vars/*_ctrl_pkg.sv` 和 `指令与状态/遥测指令清单/yewu_send_to_cxp_block.md`
- word 列表示遥测 payload 数据字索引，不包含 RS422 帧头、长度字、应用层头和 checksum。
- 对于 64bit/192bit 这类跨 word 字段，表中会按每个 32bit 分片列出，软件按字段切片说明重组。

## TM_GROUP_RUNTIME_C

- group_id：`8'h80`

| 参数原始字段名            | UI显示名称                              | word | 索引位宽     | 有符号/无符号 | UI类型 | 参数表格索引                                                                                    |
| ------------------------- | --------------------------------------- | ---- | ------------ | ------------- | ------ | ----------------------------------------------------------------------------------------------- |
| `total_count`             | total_count：发送业务帧总计数           | `0`  | `word[31:0]` | 无符号数      | 显示   | [UI_TM_GROUP_RUNTIME_C_TOTAL_COUNT](#ui_tm_group_runtime_c_total_count)                         |
| `link_status_frame_count` | link_status_frame_count：链路状态帧计数 | `1`  | `word[31:0]` | 无符号数      | 显示   | [UI_TM_GROUP_RUNTIME_C_LINK_STATUS_FRAME_COUNT](#ui_tm_group_runtime_c_link_status_frame_count) |
| `flow_ctrl_frame_count`   | flow_ctrl_frame_count：流控帧计数       | `2`  | `word[31:0]` | 无符号数      | 显示   | [UI_TM_GROUP_RUNTIME_C_FLOW_CTRL_FRAME_COUNT](#ui_tm_group_runtime_c_flow_ctrl_frame_count)     |
| `reset_status`            | reset_status：复位状态                  | `3`  | `word[0]`    | 无符号数      | 显示   | [UI_TM_GROUP_RUNTIME_C_RESET_STATUS](#ui_tm_group_runtime_c_reset_status)                       |

## TM_GROUP_CFG_C

- group_id：`8'h81`

| 参数原始字段名 | UI显示名称       | word | 索引位宽  | 有符号/无符号 | UI类型 | 参数表格索引                                          |
| -------------- | ---------------- | ---- | --------- | ------------- | ------ | ----------------------------------------------------- |
| `enable`       | 业务发送使能配置 | `0`  | `word[0]` | 无符号数      | 显示   | [UI_TM_GROUP_CFG_C_ENABLE](#ui_tm_group_cfg_c_enable) |

## 参数表格

### UI_TM_GROUP_RUNTIME_C_TOTAL_COUNT

- 原始字段：`total_count`
- UI名称：total_count：发送业务帧总计数
- 显示类型：数值显示
- 截取位置：`word[31:0]`
- 数据宽度：`32 bit`

| 接收值   | UI显示          | 说明               |
| -------- | --------------- | ------------------ |
| `原始值` | 32 bit 无符号数 | 按无符号十进制显示 |

### UI_TM_GROUP_RUNTIME_C_LINK_STATUS_FRAME_COUNT

- 原始字段：`link_status_frame_count`
- UI名称：link_status_frame_count：链路状态帧计数
- 显示类型：数值显示
- 截取位置：`word[31:0]`
- 数据宽度：`32 bit`

| 接收值   | UI显示          | 说明               |
| -------- | --------------- | ------------------ |
| `原始值` | 32 bit 无符号数 | 按无符号十进制显示 |

### UI_TM_GROUP_RUNTIME_C_FLOW_CTRL_FRAME_COUNT

- 原始字段：`flow_ctrl_frame_count`
- UI名称：flow_ctrl_frame_count：流控帧计数
- 显示类型：数值显示
- 截取位置：`word[31:0]`
- 数据宽度：`32 bit`

| 接收值   | UI显示          | 说明               |
| -------- | --------------- | ------------------ |
| `原始值` | 32 bit 无符号数 | 按无符号十进制显示 |

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

### UI_TM_GROUP_CFG_C_ENABLE

- 原始字段：`enable`
- UI名称：业务发送使能配置
- 显示类型：使能状态
- 截取位置：`word[0]`
- 数据宽度：`1 bit`

| 接收值 | UI显示 | 说明           |
| ------ | ------ | -------------- |
| `0`    | 未使能 | 使能状态位为 0 |
| `1`    | 使能   | 使能状态位为 1 |
