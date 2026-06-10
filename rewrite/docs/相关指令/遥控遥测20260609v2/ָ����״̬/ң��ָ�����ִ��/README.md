# 遥控指令具体执行

本目录按模块展开每条遥控指令的默认执行帧，统一从 `1ACFFC1D` 帧头到最终 `checksum`。
所有带数据的遥控参数都按 `0` 作为默认值参与校验计算。

| 模块目录 | 文件 |
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
