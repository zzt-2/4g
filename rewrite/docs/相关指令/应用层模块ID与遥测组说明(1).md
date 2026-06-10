# 应用层模块ID与遥测组说明

## 文档目的

本文档用于说明当前 `master` 控制与状态协议里的：

- 协议侧 `module_id`
- 共享 `group_id`
- 各模块当前支持的遥测组

## 协议侧 module_id

当前应用层 `module_id` 定义位于：

- `import/rtl_source/ctrl_status_block/ctrl_status_block_pkg.sv`

现役定义如下：

| `module_id` | 常量名 | 目标一级模块 |
| --- | --- | --- |
| `4'h0` | `MODULE_ID_CLK_MGMT_C` | `top_clock_manager_block` |
| `4'h1` | `MODULE_ID_ADC_C` | `top_adc_rx_block` |
| `4'h2` | `MODULE_ID_GT_C` | `top_gt_tx_block` |
| `4'h3` | `MODULE_ID_CXP_C` | `top_cxp_yewu_block` |
| `4'h4` | `MODULE_ID_LASER_CTRL_C` | `top_laser_ctrl_block` |
| `4'h5` | `MODULE_ID_BIZ_RX_C` | `top_yewu_rx_block` |
| `4'h6` | `MODULE_ID_BIZ_TX_C` | `top_yewu_tx_block` |
| `4'h7` | `MODULE_ID_COMM_TX_C` | `top_comm_tx_block` |
| `4'h8` | `MODULE_ID_COMM_RX_C` | `top_comm_rx_block` |
| `4'h9` | `MODULE_ID_CTRL_STATUS_C` | 保留，不接入遥控路由 |

说明：

- 控制与状态模块自身仅保留 `4'h9` 模块号，当前不作为协议命令目标模块参与路由
- 顶层 `top.sv` 仍保留 `8-bit module_id_t` 作为框架级索引常量
- `top_ctrl_status_block` 负责把协议侧 `4-bit module_id` 路由到顶层实际模块接口

## 共享遥测组号

当前控制与状态共享使用两类遥测组：

| `group_id` | 常量名 | 含义 |
| --- | --- | --- |
| `8'h80` | `TM_GROUP_RUNTIME_C` | 运行态、计数值、测量值、故障观测 |
| `8'h81` | `TM_GROUP_CFG_C` | 当前生效配置回读 |

## 当前各模块组支持

当前 `ctrl_status_host_ctrl_core` 和各模块本地 `tm_agent` 的组合结果如下。`param_count` 为数据区 `32-bit word` 数，不包含应用层 header。

| 模块 | 当前支持组 | `param_count` |
| --- | --- | --- |
| `top_clock_manager_block` | `cfg` | `2` |
| `top_adc_rx_block` | `runtime`、`cfg` | `6`、`1` |
| `top_gt_tx_block` | `runtime` | `2` |
| `top_cxp_yewu_block` | `runtime` | `2` |
| `top_laser_ctrl_block` | `runtime`、`cfg` | `8`、`18` |
| `top_yewu_rx_block` | `runtime`、`cfg` | `6`、`1` |
| `top_yewu_tx_block` | `runtime`、`cfg` | `4`、`1` |
| `top_comm_tx_block` | `runtime`、`cfg` | `8`、`8` |
| `top_comm_rx_block` | `runtime`、`cfg` | `14`、`10` |

## 当前轮询顺序

`ctrl_status_host_ctrl_core` 当前固定按下列顺序轮询：

1. `COMM_TX runtime`
2. `COMM_TX cfg`
3. `LASER_CTRL runtime`
4. `LASER_CTRL cfg`
5. `CLK_MGMT cfg`
6. `ADC runtime`
7. `ADC cfg`
8. `GT runtime`
9. `CXP runtime`
10. `BIZ_RX runtime`
11. `BIZ_RX cfg`
12. `BIZ_TX runtime`
13. `BIZ_TX cfg`
14. `COMM_RX runtime`
15. `COMM_RX cfg`

## 当前边界

- 模块私有“命令组 / 参数 ID / 动作类型”不在本文件统一展开
- 这些私有协议表定义分别位于各模块 `*_ctrl_pkg.sv`
- 本文件只约束跨模块共享的 `module_id`、`group_id` 和当前遥测组 `param_count`
- 现役遥测不使用旧版外部对象字段模型，也不拆分快包/慢包
