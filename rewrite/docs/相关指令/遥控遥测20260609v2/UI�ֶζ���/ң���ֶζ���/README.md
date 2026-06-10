# 遥控字段定义

本目录给软件 UI 使用，说明遥控字段如何从 UI 输入转换成下发 payload。

## 截取规则

- 每个遥控 payload 字是 32bit。
- `word` 是 payload 数据字索引，不包含 RS422 帧头、长度字、应用层头和 checksum。
- `索引位宽` 写成 `word[n:m]`，表示该字段占用当前 payload 字的哪些 bit。
- 标为有符号数的字段，UI 负数下发前按对应 bit 宽转换成补码；标为无符号数的字段不允许输入负数。
- 遥控 UI 类型包括：`下拉栏`、`使能开关`、`数值填写`、`触发按钮`。
- `触发按钮` 是补充 UI 类型，用于复位、清零这类无 payload 脉冲命令。

## 模块文件

| 模块 | 文件 |
| --- | --- |
| `adc_rx_block` | [adc_rx_block.md](adc_rx_block.md) |
| `clock_manager_block` | [clock_manager_block.md](clock_manager_block.md) |
| `comm_rx_block` | [comm_rx_block.md](comm_rx_block.md) |
| `comm_tx_block` | [comm_tx_block.md](comm_tx_block.md) |
| `cxp_yewu_block` | [cxp_yewu_block.md](cxp_yewu_block.md) |
| `gt_tx_block` | [gt_tx_block.md](gt_tx_block.md) |
| `laser_ctrl_block` | [laser_ctrl_block.md](laser_ctrl_block.md) |
| `yewu_rece_from_cxp_block` | [yewu_rece_from_cxp_block.md](yewu_rece_from_cxp_block.md) |
| `yewu_send_to_cxp_block` | [yewu_send_to_cxp_block.md](yewu_send_to_cxp_block.md) |
