# yewu_send_to_cxp_block 遥控指令清单

## 来源

- 模块目录：`import/rtl_source/yewu_send_to_cxp_block/`
- 遥控包：`D:/vivado_project/CZW/CZW_V7_runner_201803/repo_main/import/rtl_source/yewu_send_to_cxp_block/vars/yewu_send_to_cxp_ctrl_pkg.sv`
- module_id：`MODULE_ID_BIZ_TX_C = 4'h6`

## Group 总表

### BIZ_TX_CMD_GROUP_MAP_C

| 参数名字 | 参数中文名 | 参数id | 参数类型 | 应用层字数 | 应用层位宽 | 默认值 | 实现层参数名 | 实现层参数id | 实现层字数 | 实现层位宽 | 模块最终落地位宽 | 可选项数量 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [BIZ_TX_PARAM_ENABLE_C](#biz_tx_param_enable_c) | 业务发送使能配置 | `8'd0` | `PARAM_KIND_MAP_C` | `8'd1` | `32 bit` | `APP_DISABLE_C` (`32'h0`) | `BIZ_TX_IMPL_ENABLE_C` | `8'd0` | `8'd1` | `32 bit` | `1 bit` | `2` |

### BIZ_TX_CMD_GROUP_PULSE_CLEAR_C

| 参数名字 | 参数中文名 | 参数id | 参数类型 | 应用层字数 | 应用层位宽 | 默认值 | 实现层参数名 | 实现层参数id | 实现层字数 | 实现层位宽 | 模块最终落地位宽 | 可选项数量 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [BIZ_TX_PARAM_COUNT_CLEAR_C](#biz_tx_param_count_clear_c) | 未标注中文名 | `8'd1` | `PARAM_KIND_PULSE_C` | `8'd0` | `0 bit` | 上电默认不触发 | `BIZ_TX_IMPL_COUNT_CLEAR_C` | `8'd1` | `8'd1` | `32 bit` | 未找到最终落地位宽 | `0` |

### BIZ_TX_CMD_GROUP_PULSE_RESET_C

| 参数名字 | 参数中文名 | 参数id | 参数类型 | 应用层字数 | 应用层位宽 | 默认值 | 实现层参数名 | 实现层参数id | 实现层字数 | 实现层位宽 | 模块最终落地位宽 | 可选项数量 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [BIZ_TX_PARAM_RESET_C](#biz_tx_param_reset_c) | 未标注中文名 | `8'd2` | `PARAM_KIND_PULSE_C` | `8'd0` | `0 bit` | 上电默认不触发 | `BIZ_TX_IMPL_RESET_C` | `8'd2` | `8'd1` | `32 bit` | 未找到最终落地位宽 | `0` |

## 参数说明表

### BIZ_TX_PARAM_ENABLE_C

| 字段 | 内容 |
| --- | --- |
| 应用层参数名 | `BIZ_TX_PARAM_ENABLE_C` |
| 应用层参数中文名 | 业务发送使能配置 |
| 应用层参数 id | `8'd0` |
| 所属 group | `BIZ_TX_CMD_GROUP_MAP_C` |
| 参数类型 | `PARAM_KIND_MAP_C` |
| 应用层字数 | `8'd1` |
| 应用层位宽 | `32 bit` |
| 应用层默认值 | `APP_DISABLE_C` (`32'h0`) |
| 动作类型 | `ACTION_KIND_MAP_WRITE_C` |
| 实现层参数名 | `BIZ_TX_IMPL_ENABLE_C` |
| 实现层参数 id | `8'd0` |
| 实现层字数 | `8'd1` |
| 实现层位宽 | `32 bit` |
| 模块最终落地目标 | `cfg_r.enable` |
| 模块最终落地位宽 | `1 bit` |
| 模块上电默认生效值 | `1'b0` |
| 可选项数量 | `2` |
| 映射表 | `APP_ENABLE_C` (`32'h1`) -> `IMPL_BOOL_ENABLE_C` (`32'h1`)<br>`APP_DISABLE_C` (`32'h0`) -> `IMPL_BOOL_DISABLE_C` (`32'h0`) |
| 来源 pkg 常量 | `BIZ_TX_CMD_GROUP_MAP_C`<br>`BIZ_TX_PARAM_ENABLE_C`<br>`BIZ_TX_IMPL_ENABLE_C` |
| 说明 | 应用层参数 `BIZ_TX_PARAM_ENABLE_C` 在组 `BIZ_TX_CMD_GROUP_MAP_C` 内通过 `ACTION_KIND_MAP_WRITE_C` 转换到实现层参数 `BIZ_TX_IMPL_ENABLE_C`。 |

### BIZ_TX_PARAM_COUNT_CLEAR_C

| 字段 | 内容 |
| --- | --- |
| 应用层参数名 | `BIZ_TX_PARAM_COUNT_CLEAR_C` |
| 应用层参数中文名 | 未标注中文名 |
| 应用层参数 id | `8'd1` |
| 所属 group | `BIZ_TX_CMD_GROUP_PULSE_CLEAR_C` |
| 参数类型 | `PARAM_KIND_PULSE_C` |
| 应用层字数 | `8'd0` |
| 应用层位宽 | `0 bit` |
| 应用层默认值 | 上电默认不触发 |
| 动作类型 | `ACTION_KIND_PULSE_C` |
| 实现层参数名 | `BIZ_TX_IMPL_COUNT_CLEAR_C` |
| 实现层参数 id | `8'd1` |
| 实现层字数 | `8'd1` |
| 实现层位宽 | `32 bit` |
| 模块最终落地目标 | 未找到最终落地目标 |
| 模块最终落地位宽 | 未找到最终落地位宽 |
| 模块上电默认生效值 | `0`（脉冲不触发） |
| 可选项数量 | `0` |
| 映射表 | 无 |
| 来源 pkg 常量 | `BIZ_TX_CMD_GROUP_PULSE_CLEAR_C`<br>`BIZ_TX_PARAM_COUNT_CLEAR_C`<br>`BIZ_TX_IMPL_COUNT_CLEAR_C` |
| 说明 | 应用层参数 `BIZ_TX_PARAM_COUNT_CLEAR_C` 在组 `BIZ_TX_CMD_GROUP_PULSE_CLEAR_C` 内通过 `ACTION_KIND_PULSE_C` 转换到实现层参数 `BIZ_TX_IMPL_COUNT_CLEAR_C`。 |

### BIZ_TX_PARAM_RESET_C

| 字段 | 内容 |
| --- | --- |
| 应用层参数名 | `BIZ_TX_PARAM_RESET_C` |
| 应用层参数中文名 | 未标注中文名 |
| 应用层参数 id | `8'd2` |
| 所属 group | `BIZ_TX_CMD_GROUP_PULSE_RESET_C` |
| 参数类型 | `PARAM_KIND_PULSE_C` |
| 应用层字数 | `8'd0` |
| 应用层位宽 | `0 bit` |
| 应用层默认值 | 上电默认不触发 |
| 动作类型 | `ACTION_KIND_PULSE_C` |
| 实现层参数名 | `BIZ_TX_IMPL_RESET_C` |
| 实现层参数 id | `8'd2` |
| 实现层字数 | `8'd1` |
| 实现层位宽 | `32 bit` |
| 模块最终落地目标 | 未找到最终落地目标 |
| 模块最终落地位宽 | 未找到最终落地位宽 |
| 模块上电默认生效值 | `0`（脉冲不触发） |
| 可选项数量 | `0` |
| 映射表 | 无 |
| 来源 pkg 常量 | `BIZ_TX_CMD_GROUP_PULSE_RESET_C`<br>`BIZ_TX_PARAM_RESET_C`<br>`BIZ_TX_IMPL_RESET_C` |
| 说明 | 应用层参数 `BIZ_TX_PARAM_RESET_C` 在组 `BIZ_TX_CMD_GROUP_PULSE_RESET_C` 内通过 `ACTION_KIND_PULSE_C` 转换到实现层参数 `BIZ_TX_IMPL_RESET_C`。 |
