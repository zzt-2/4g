# 遥测状态具体执行

本目录按模块展开当前 `tm_agent` 实际支持的遥测组，并给出默认全 0 上报帧。

| 模块目录 | 文件 | 支持遥测组 |
| --- | --- | --- |
| `adc_rx_block` | [adc_rx_block.md](adc_rx_block.md) | `TM_GROUP_RUNTIME_C`<br>`TM_GROUP_CFG_C` |
| `clock_manager_block` | [clock_manager_block.md](clock_manager_block.md) | `TM_GROUP_RUNTIME_C`<br>`TM_GROUP_CFG_C` |
| `comm_rx_block` | [comm_rx_block.md](comm_rx_block.md) | `TM_GROUP_RUNTIME_C`<br>`TM_GROUP_CFG_C`<br>`TM_GROUP_COMM_RX_IQ_C` |
| `comm_tx_block` | [comm_tx_block.md](comm_tx_block.md) | `TM_GROUP_RUNTIME_C`<br>`TM_GROUP_CFG_C` |
| `cxp_yewu_block` | [cxp_yewu_block.md](cxp_yewu_block.md) | `TM_GROUP_RUNTIME_C` |
| `gt_tx_block` | [gt_tx_block.md](gt_tx_block.md) | `TM_GROUP_RUNTIME_C` |
| `laser_ctrl_block` | [laser_ctrl_block.md](laser_ctrl_block.md) | `TM_GROUP_RUNTIME_C`<br>`TM_GROUP_CFG_C` |
| `yewu_rece_from_cxp_block` | [yewu_rece_from_cxp_block.md](yewu_rece_from_cxp_block.md) | `TM_GROUP_RUNTIME_C`<br>`TM_GROUP_CFG_C` |
| `yewu_send_to_cxp_block` | [yewu_send_to_cxp_block.md](yewu_send_to_cxp_block.md) | `TM_GROUP_RUNTIME_C`<br>`TM_GROUP_CFG_C` |
