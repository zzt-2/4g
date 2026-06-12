# cxp_yewu_block 遥控指令清单

## 来源

- 模块目录：`import/rtl_source/cxp_yewu_block/`
- 遥控包：`D:/vivado_project/CZW/CZW_V7_runner_201803/repo_main/import/rtl_source/cxp_yewu_block/vars/cxp_yewu_ctrl_pkg.sv`
- module_id：`MODULE_ID_CXP_C = 4'h3`

## Group 总表

### CXP_CMD_GROUP_PULSE_RESET_C

| 参数名字 | 参数中文名 | 参数id | 参数类型 | 应用层字数 | 应用层位宽 | 默认值 | 实现层参数名 | 实现层参数id | 实现层字数 | 实现层位宽 | 模块最终落地位宽 | 可选项数量 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [CXP_PARAM_RESET_C](#cxp_param_reset_c) | 未标注中文名 | `8'd0` | `PARAM_KIND_PULSE_C` | `8'd0` | `0 bit` | 上电默认不触发 | `CXP_IMPL_RESET_C` | `8'd0` | `8'd1` | `32 bit` | 未找到最终落地位宽 | `0` |

## 参数说明表

### CXP_PARAM_RESET_C

| 字段 | 内容 |
| --- | --- |
| 应用层参数名 | `CXP_PARAM_RESET_C` |
| 应用层参数中文名 | 未标注中文名 |
| 应用层参数 id | `8'd0` |
| 所属 group | `CXP_CMD_GROUP_PULSE_RESET_C` |
| 参数类型 | `PARAM_KIND_PULSE_C` |
| 应用层字数 | `8'd0` |
| 应用层位宽 | `0 bit` |
| 应用层默认值 | 上电默认不触发 |
| 动作类型 | `ACTION_KIND_PULSE_C` |
| 实现层参数名 | `CXP_IMPL_RESET_C` |
| 实现层参数 id | `8'd0` |
| 实现层字数 | `8'd1` |
| 实现层位宽 | `32 bit` |
| 模块最终落地目标 | 未找到最终落地目标 |
| 模块最终落地位宽 | 未找到最终落地位宽 |
| 模块上电默认生效值 | `0`（脉冲不触发） |
| 可选项数量 | `0` |
| 映射表 | 无 |
| 来源 pkg 常量 | `CXP_CMD_GROUP_PULSE_RESET_C`<br>`CXP_PARAM_RESET_C`<br>`CXP_IMPL_RESET_C` |
| 说明 | 应用层参数 `CXP_PARAM_RESET_C` 在组 `CXP_CMD_GROUP_PULSE_RESET_C` 内通过 `ACTION_KIND_PULSE_C` 转换到实现层参数 `CXP_IMPL_RESET_C`。 |
