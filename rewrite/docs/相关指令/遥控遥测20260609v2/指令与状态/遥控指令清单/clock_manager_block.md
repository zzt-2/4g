# clock_manager_block 遥控指令清单

## 来源

- 模块目录：`import/rtl_source/clock_manager_block/`
- 遥控包：`D:/vivado_project/CZW/CZW_V7_runner_201803/repo_main/import/rtl_source/clock_manager_block/vars/clock_manager_ctrl_pkg.sv`
- module_id：`MODULE_ID_CLK_MGMT_C = 4'h0`

## Group 总表

### CLOCK_MANAGER_CMD_GROUP_MAP_C

| 参数名字 | 参数中文名 | 参数id | 参数类型 | 应用层字数 | 应用层位宽 | 默认值 | 实现层参数名 | 实现层参数id | 实现层字数 | 实现层位宽 | 模块最终落地位宽 | 可选项数量 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [CLOCK_MANAGER_PARAM_PPS_SRC_C](#clock_manager_param_pps_src_c) | PPS 来源选择 | `8'd0` | `PARAM_KIND_VALUE_C` | `WORD_COUNT_SINGLE_C` | `32 bit` | `1'b0`（内参考） | `CLOCK_MANAGER_IMPL_PPS_SRC_C` | `8'd0` | `8'd1` | `32 bit` | `1 bit` | `0` |
| [CLOCK_MANAGER_PARAM_REF_SRC_C](#clock_manager_param_ref_src_c) | 参考时钟来源选择 | `8'd1` | `PARAM_KIND_VALUE_C` | `WORD_COUNT_SINGLE_C` | `32 bit` | `1'b0`（内参考） | `CLOCK_MANAGER_IMPL_REF_SRC_C` | `8'd1` | `8'd1` | `32 bit` | `1 bit` | `0` |

## 参数说明表

### CLOCK_MANAGER_PARAM_PPS_SRC_C

| 字段 | 内容 |
| --- | --- |
| 应用层参数名 | `CLOCK_MANAGER_PARAM_PPS_SRC_C` |
| 应用层参数中文名 | PPS 来源选择 |
| 应用层参数 id | `8'd0` |
| 所属 group | `CLOCK_MANAGER_CMD_GROUP_MAP_C` |
| 参数类型 | `PARAM_KIND_VALUE_C` |
| 应用层字数 | `WORD_COUNT_SINGLE_C` |
| 应用层位宽 | `32 bit` |
| 应用层默认值 | `1'b0`（内参考） |
| 动作类型 | `ACTION_KIND_CFG_WRITE_C` |
| 实现层参数名 | `CLOCK_MANAGER_IMPL_PPS_SRC_C` |
| 实现层参数 id | `8'd0` |
| 实现层字数 | `8'd1` |
| 实现层位宽 | `32 bit` |
| 模块最终落地目标 | `cfg_r.pps_source_sel` |
| 模块最终落地位宽 | `1 bit` |
| 模块上电默认生效值 | `1'b0`（内参考） |
| 可选项数量 | `0` |
| 映射表 | 无 |
| 来源 pkg 常量 | `CLOCK_MANAGER_CMD_GROUP_MAP_C`<br>`CLOCK_MANAGER_PARAM_PPS_SRC_C`<br>`CLOCK_MANAGER_IMPL_PPS_SRC_C` |
| 说明 | 应用层参数 `CLOCK_MANAGER_PARAM_PPS_SRC_C` 在组 `CLOCK_MANAGER_CMD_GROUP_MAP_C` 内通过 `ACTION_KIND_CFG_WRITE_C` 转换到实现层参数 `CLOCK_MANAGER_IMPL_PPS_SRC_C`。 |

### CLOCK_MANAGER_PARAM_REF_SRC_C

| 字段 | 内容 |
| --- | --- |
| 应用层参数名 | `CLOCK_MANAGER_PARAM_REF_SRC_C` |
| 应用层参数中文名 | 参考时钟来源选择 |
| 应用层参数 id | `8'd1` |
| 所属 group | `CLOCK_MANAGER_CMD_GROUP_MAP_C` |
| 参数类型 | `PARAM_KIND_VALUE_C` |
| 应用层字数 | `WORD_COUNT_SINGLE_C` |
| 应用层位宽 | `32 bit` |
| 应用层默认值 | `1'b0`（内参考） |
| 动作类型 | `ACTION_KIND_CFG_WRITE_C` |
| 实现层参数名 | `CLOCK_MANAGER_IMPL_REF_SRC_C` |
| 实现层参数 id | `8'd1` |
| 实现层字数 | `8'd1` |
| 实现层位宽 | `32 bit` |
| 模块最终落地目标 | `cfg_r.ref_source_sel` |
| 模块最终落地位宽 | `1 bit` |
| 模块上电默认生效值 | `1'b0`（内参考） |
| 可选项数量 | `0` |
| 映射表 | 无 |
| 来源 pkg 常量 | `CLOCK_MANAGER_CMD_GROUP_MAP_C`<br>`CLOCK_MANAGER_PARAM_REF_SRC_C`<br>`CLOCK_MANAGER_IMPL_REF_SRC_C` |
| 说明 | 应用层参数 `CLOCK_MANAGER_PARAM_REF_SRC_C` 在组 `CLOCK_MANAGER_CMD_GROUP_MAP_C` 内通过 `ACTION_KIND_CFG_WRITE_C` 转换到实现层参数 `CLOCK_MANAGER_IMPL_REF_SRC_C`。 |
