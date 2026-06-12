# 遥测字段定义

本目录给软件 UI 使用，说明遥测字段如何从回传 payload 中截取并显示。

## 截取规则

- 每个遥测 payload 字是 32bit。
- `word` 是遥测数据字索引，不包含 RS422 帧头、长度字、应用层头和 checksum。
- `索引位宽` 写成 `word[n:m]`，表示 UI 字段从当前遥测字截取的 bit。
- 对有符号数字段，软件按列出的 bit 宽执行补码转十进制。
- 对多 word 数值，按表格列出的字段切片重组；当前文档中高位字在前。
- 对 1bit 状态，参数表格给出 0/1 的中文显示。

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
