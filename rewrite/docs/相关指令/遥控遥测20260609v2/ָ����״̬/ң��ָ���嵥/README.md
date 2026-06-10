# 遥控指令清单

本目录只基于当前 RTL `pkg` 定义生成，不引用历史应用层文档反推 group/param 信息。

## 模块 module_id 索引

| 模块目录 | module_id 常量 | module_id 值 | 模块文档 |
| --- | --- | --- | --- |
| `adc_rx_block` | `MODULE_ID_ADC_C` | `4'h1` | [adc_rx_block.md](adc_rx_block.md) |
| `clock_manager_block` | `MODULE_ID_CLK_MGMT_C` | `4'h0` | [clock_manager_block.md](clock_manager_block.md) |
| `comm_rx_block` | `MODULE_ID_COMM_RX_C` | `4'h8` | [comm_rx_block.md](comm_rx_block.md) |
| `comm_tx_block` | `MODULE_ID_COMM_TX_C` | `4'h7` | [comm_tx_block.md](comm_tx_block.md) |
| `cxp_yewu_block` | `MODULE_ID_CXP_C` | `4'h3` | [cxp_yewu_block.md](cxp_yewu_block.md) |
| `gt_tx_block` | `MODULE_ID_GT_C` | `4'h2` | [gt_tx_block.md](gt_tx_block.md) |
| `laser_ctrl_block` | `MODULE_ID_LASER_CTRL_C` | `4'h4` | [laser_ctrl_block.md](laser_ctrl_block.md) |
| `yewu_rece_from_cxp_block` | `MODULE_ID_BIZ_RX_C` | `4'h5` | [yewu_rece_from_cxp_block.md](yewu_rece_from_cxp_block.md) |
| `yewu_send_to_cxp_block` | `MODULE_ID_BIZ_TX_C` | `4'h6` | [yewu_send_to_cxp_block.md](yewu_send_to_cxp_block.md) |

## 使用边界

- 本清单只说明应用层到共享遥控链第 2 段结束的实现层映射。
- 参数默认值优先取各模块 pkg 中 `default_cfg()` 的上电配置；脉冲类参数默认记为“上电不触发”。
- 不说明模块本地寄存器、信号或状态机最终落点之外的运行时演化。
- 各模块 group 和参数表请进入对应 Markdown 文件查看。
