# laser_ctrl_block 遥控指令清单

## 来源

- 模块目录：`import/rtl_source/laser_ctrl_block/`
- 遥控包：`D:/vivado_project/CZW/CZW_V7_runner_201803/repo_main/import/rtl_source/laser_ctrl_block/vars/laser_ctrl_ctrl_pkg.sv`
- module_id：`MODULE_ID_LASER_CTRL_C = 4'h4`

## Group 总表

### LASER_CTRL_CMD_GROUP_TXM_ON_C

| 参数名字 | 参数中文名 | 参数id | 参数类型 | 应用层字数 | 应用层位宽 | 默认值 | 实现层参数名 | 实现层参数id | 实现层字数 | 实现层位宽 | 模块最终落地位宽 | 可选项数量 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [LASER_PARAM_TXM_ON_C](#laser_param_txm_on_c) | 发射激光器开关 | `8'd0` | `PARAM_KIND_VALUE_C` | `WORD_COUNT_SINGLE_C` | `32 bit` | `'0` | `LASER_IMPL_TXM_ON_C` | `8'd0` | `8'd1` | `32 bit` | `2 bit` | `0` |

### LASER_CTRL_CMD_GROUP_LO_ON_C

| 参数名字 | 参数中文名 | 参数id | 参数类型 | 应用层字数 | 应用层位宽 | 默认值 | 实现层参数名 | 实现层参数id | 实现层字数 | 实现层位宽 | 模块最终落地位宽 | 可选项数量 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [LASER_PARAM_LO_ON_C](#laser_param_lo_on_c) | 本振激光器开关 | `8'd1` | `PARAM_KIND_VALUE_C` | `WORD_COUNT_SINGLE_C` | `32 bit` | `'0` | `LASER_IMPL_LO_ON_C` | `8'd1` | `8'd1` | `32 bit` | `2 bit` | `0` |

### LASER_CTRL_CMD_GROUP_WAVE_SET_ON_C

| 参数名字 | 参数中文名 | 参数id | 参数类型 | 应用层字数 | 应用层位宽 | 默认值 | 实现层参数名 | 实现层参数id | 实现层字数 | 实现层位宽 | 模块最终落地位宽 | 可选项数量 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [LASER_PARAM_WAVE_SET_ON_C](#laser_param_wave_set_on_c) | 参数包/手动温度选择 | `8'd2` | `PARAM_KIND_VALUE_C` | `WORD_COUNT_SINGLE_C` | `32 bit` | `'0` | `LASER_IMPL_WAVE_SET_ON_C` | `8'd2` | `8'd1` | `32 bit` | `1 bit` | `0` |

### LASER_CTRL_CMD_GROUP_TEC_ON1_C

| 参数名字 | 参数中文名 | 参数id | 参数类型 | 应用层字数 | 应用层位宽 | 默认值 | 实现层参数名 | 实现层参数id | 实现层字数 | 实现层位宽 | 模块最终落地位宽 | 可选项数量 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [LASER_PARAM_TEC_ON1_C](#laser_param_tec_on1_c) | TEC1 开关 | `8'd3` | `PARAM_KIND_VALUE_C` | `WORD_COUNT_SINGLE_C` | `32 bit` | `'0` | `LASER_IMPL_TEC_ON1_C` | `8'd3` | `8'd1` | `32 bit` | `1 bit` | `0` |

### LASER_CTRL_CMD_GROUP_TEC_ON2_C

| 参数名字 | 参数中文名 | 参数id | 参数类型 | 应用层字数 | 应用层位宽 | 默认值 | 实现层参数名 | 实现层参数id | 实现层字数 | 实现层位宽 | 模块最终落地位宽 | 可选项数量 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [LASER_PARAM_TEC_ON2_C](#laser_param_tec_on2_c) | TEC2 开关 | `8'd4` | `PARAM_KIND_VALUE_C` | `WORD_COUNT_SINGLE_C` | `32 bit` | `'0` | `LASER_IMPL_TEC_ON2_C` | `8'd4` | `8'd1` | `32 bit` | `1 bit` | `0` |

### LASER_CTRL_CMD_GROUP_MODU_MODE_C

| 参数名字 | 参数中文名 | 参数id | 参数类型 | 应用层字数 | 应用层位宽 | 默认值 | 实现层参数名 | 实现层参数id | 实现层字数 | 实现层位宽 | 模块最终落地位宽 | 可选项数量 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [LASER_PARAM_MODU_MODE_C](#laser_param_modu_mode_c) | 调制模式 | `8'd5` | `PARAM_KIND_VALUE_C` | `WORD_COUNT_SINGLE_C` | `32 bit` | `'0` | `LASER_IMPL_MODU_MODE_C` | `8'd5` | `8'd1` | `32 bit` | `2 bit` | `0` |

### LASER_CTRL_CMD_GROUP_VOL_AUTO_C

| 参数名字 | 参数中文名 | 参数id | 参数类型 | 应用层字数 | 应用层位宽 | 默认值 | 实现层参数名 | 实现层参数id | 实现层字数 | 实现层位宽 | 模块最终落地位宽 | 可选项数量 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [LASER_PARAM_VOL_AUTO_C](#laser_param_vol_auto_c) | 调制开始 | `8'd6` | `PARAM_KIND_VALUE_C` | `WORD_COUNT_SINGLE_C` | `32 bit` | `'0` | `LASER_IMPL_VOL_AUTO_C` | `8'd6` | `8'd1` | `32 bit` | `1 bit` | `0` |

### LASER_CTRL_CMD_GROUP_TXM1_SET_C

| 参数名字 | 参数中文名 | 参数id | 参数类型 | 应用层字数 | 应用层位宽 | 默认值 | 实现层参数名 | 实现层参数id | 实现层字数 | 实现层位宽 | 模块最终落地位宽 | 可选项数量 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [LASER_PARAM_TXM1_SET_C](#laser_param_txm1_set_c) | 发射激光器1温度手动设置值 | `8'd12` | `PARAM_KIND_VALUE_C` | `WORD_COUNT_SINGLE_C` | `32 bit` | `16'h8000` | `LASER_IMPL_TXM1_SET_C` | `8'd12` | `8'd1` | `32 bit` | `16 bit` | `0` |

### LASER_CTRL_CMD_GROUP_TXM2_SET_C

| 参数名字 | 参数中文名 | 参数id | 参数类型 | 应用层字数 | 应用层位宽 | 默认值 | 实现层参数名 | 实现层参数id | 实现层字数 | 实现层位宽 | 模块最终落地位宽 | 可选项数量 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [LASER_PARAM_TXM2_SET_C](#laser_param_txm2_set_c) | 发射激光器2温度手动设置值 | `8'd13` | `PARAM_KIND_VALUE_C` | `WORD_COUNT_SINGLE_C` | `32 bit` | `16'h8000` | `LASER_IMPL_TXM2_SET_C` | `8'd13` | `8'd1` | `32 bit` | `16 bit` | `0` |

### LASER_CTRL_CMD_GROUP_LO1_SET_C

| 参数名字 | 参数中文名 | 参数id | 参数类型 | 应用层字数 | 应用层位宽 | 默认值 | 实现层参数名 | 实现层参数id | 实现层字数 | 实现层位宽 | 模块最终落地位宽 | 可选项数量 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [LASER_PARAM_LO1_SET_C](#laser_param_lo1_set_c) | 本振激光器1温度手动设置值 | `8'd14` | `PARAM_KIND_VALUE_C` | `WORD_COUNT_SINGLE_C` | `32 bit` | `16'h8000` | `LASER_IMPL_LO1_SET_C` | `8'd14` | `8'd1` | `32 bit` | `16 bit` | `0` |

### LASER_CTRL_CMD_GROUP_LO2_SET_C

| 参数名字 | 参数中文名 | 参数id | 参数类型 | 应用层字数 | 应用层位宽 | 默认值 | 实现层参数名 | 实现层参数id | 实现层字数 | 实现层位宽 | 模块最终落地位宽 | 可选项数量 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [LASER_PARAM_LO2_SET_C](#laser_param_lo2_set_c) | 本振激光器2温度手动设置值 | `8'd15` | `PARAM_KIND_VALUE_C` | `WORD_COUNT_SINGLE_C` | `32 bit` | `16'h8000` | `LASER_IMPL_LO2_SET_C` | `8'd15` | `8'd1` | `32 bit` | `16 bit` | `0` |

## 参数说明表

### LASER_PARAM_TXM_ON_C

| 字段 | 内容 |
| --- | --- |
| 应用层参数名 | `LASER_PARAM_TXM_ON_C` |
| 应用层参数中文名 | 发射激光器开关 |
| 应用层参数 id | `8'd0` |
| 所属 group | `LASER_CTRL_CMD_GROUP_TXM_ON_C` |
| 参数类型 | `PARAM_KIND_VALUE_C` |
| 应用层字数 | `WORD_COUNT_SINGLE_C` |
| 应用层位宽 | `32 bit` |
| 应用层默认值 | `'0` |
| 动作类型 | `ACTION_KIND_CFG_WRITE_C` |
| 实现层参数名 | `LASER_IMPL_TXM_ON_C` |
| 实现层参数 id | `8'd0` |
| 实现层字数 | `8'd1` |
| 实现层位宽 | `32 bit` |
| 模块最终落地目标 | `cfg_r.txm_on` |
| 模块最终落地位宽 | `2 bit` |
| 模块上电默认生效值 | `'0` |
| 可选项数量 | `0` |
| 映射表 | 无 |
| 来源 pkg 常量 | `LASER_CTRL_CMD_GROUP_TXM_ON_C`<br>`LASER_PARAM_TXM_ON_C`<br>`LASER_IMPL_TXM_ON_C` |
| 说明 | 应用层参数 `LASER_PARAM_TXM_ON_C` 在组 `LASER_CTRL_CMD_GROUP_TXM_ON_C` 内通过 `ACTION_KIND_CFG_WRITE_C` 转换到实现层参数 `LASER_IMPL_TXM_ON_C`。 |

### LASER_PARAM_LO_ON_C

| 字段 | 内容 |
| --- | --- |
| 应用层参数名 | `LASER_PARAM_LO_ON_C` |
| 应用层参数中文名 | 本振激光器开关 |
| 应用层参数 id | `8'd1` |
| 所属 group | `LASER_CTRL_CMD_GROUP_LO_ON_C` |
| 参数类型 | `PARAM_KIND_VALUE_C` |
| 应用层字数 | `WORD_COUNT_SINGLE_C` |
| 应用层位宽 | `32 bit` |
| 应用层默认值 | `'0` |
| 动作类型 | `ACTION_KIND_CFG_WRITE_C` |
| 实现层参数名 | `LASER_IMPL_LO_ON_C` |
| 实现层参数 id | `8'd1` |
| 实现层字数 | `8'd1` |
| 实现层位宽 | `32 bit` |
| 模块最终落地目标 | `cfg_r.lo_on` |
| 模块最终落地位宽 | `2 bit` |
| 模块上电默认生效值 | `'0` |
| 可选项数量 | `0` |
| 映射表 | 无 |
| 来源 pkg 常量 | `LASER_CTRL_CMD_GROUP_LO_ON_C`<br>`LASER_PARAM_LO_ON_C`<br>`LASER_IMPL_LO_ON_C` |
| 说明 | 应用层参数 `LASER_PARAM_LO_ON_C` 在组 `LASER_CTRL_CMD_GROUP_LO_ON_C` 内通过 `ACTION_KIND_CFG_WRITE_C` 转换到实现层参数 `LASER_IMPL_LO_ON_C`。 |

### LASER_PARAM_WAVE_SET_ON_C

| 字段 | 内容 |
| --- | --- |
| 应用层参数名 | `LASER_PARAM_WAVE_SET_ON_C` |
| 应用层参数中文名 | 参数包/手动温度选择 |
| 应用层参数 id | `8'd2` |
| 所属 group | `LASER_CTRL_CMD_GROUP_WAVE_SET_ON_C` |
| 参数类型 | `PARAM_KIND_VALUE_C` |
| 应用层字数 | `WORD_COUNT_SINGLE_C` |
| 应用层位宽 | `32 bit` |
| 应用层默认值 | `'0` |
| 动作类型 | `ACTION_KIND_CFG_WRITE_C` |
| 实现层参数名 | `LASER_IMPL_WAVE_SET_ON_C` |
| 实现层参数 id | `8'd2` |
| 实现层字数 | `8'd1` |
| 实现层位宽 | `32 bit` |
| 模块最终落地目标 | `cfg_r.wave_set_on` |
| 模块最终落地位宽 | `1 bit` |
| 模块上电默认生效值 | `'0` |
| 可选项数量 | `0` |
| 映射表 | 无 |
| 来源 pkg 常量 | `LASER_CTRL_CMD_GROUP_WAVE_SET_ON_C`<br>`LASER_PARAM_WAVE_SET_ON_C`<br>`LASER_IMPL_WAVE_SET_ON_C` |
| 说明 | 应用层参数 `LASER_PARAM_WAVE_SET_ON_C` 在组 `LASER_CTRL_CMD_GROUP_WAVE_SET_ON_C` 内通过 `ACTION_KIND_CFG_WRITE_C` 转换到实现层参数 `LASER_IMPL_WAVE_SET_ON_C`。 |

### LASER_PARAM_TEC_ON1_C

| 字段 | 内容 |
| --- | --- |
| 应用层参数名 | `LASER_PARAM_TEC_ON1_C` |
| 应用层参数中文名 | TEC1 开关 |
| 应用层参数 id | `8'd3` |
| 所属 group | `LASER_CTRL_CMD_GROUP_TEC_ON1_C` |
| 参数类型 | `PARAM_KIND_VALUE_C` |
| 应用层字数 | `WORD_COUNT_SINGLE_C` |
| 应用层位宽 | `32 bit` |
| 应用层默认值 | `'0` |
| 动作类型 | `ACTION_KIND_CFG_WRITE_C` |
| 实现层参数名 | `LASER_IMPL_TEC_ON1_C` |
| 实现层参数 id | `8'd3` |
| 实现层字数 | `8'd1` |
| 实现层位宽 | `32 bit` |
| 模块最终落地目标 | `cfg_r.tec_on1` |
| 模块最终落地位宽 | `1 bit` |
| 模块上电默认生效值 | `'0` |
| 可选项数量 | `0` |
| 映射表 | 无 |
| 来源 pkg 常量 | `LASER_CTRL_CMD_GROUP_TEC_ON1_C`<br>`LASER_PARAM_TEC_ON1_C`<br>`LASER_IMPL_TEC_ON1_C` |
| 说明 | 应用层参数 `LASER_PARAM_TEC_ON1_C` 在组 `LASER_CTRL_CMD_GROUP_TEC_ON1_C` 内通过 `ACTION_KIND_CFG_WRITE_C` 转换到实现层参数 `LASER_IMPL_TEC_ON1_C`。 |

### LASER_PARAM_TEC_ON2_C

| 字段 | 内容 |
| --- | --- |
| 应用层参数名 | `LASER_PARAM_TEC_ON2_C` |
| 应用层参数中文名 | TEC2 开关 |
| 应用层参数 id | `8'd4` |
| 所属 group | `LASER_CTRL_CMD_GROUP_TEC_ON2_C` |
| 参数类型 | `PARAM_KIND_VALUE_C` |
| 应用层字数 | `WORD_COUNT_SINGLE_C` |
| 应用层位宽 | `32 bit` |
| 应用层默认值 | `'0` |
| 动作类型 | `ACTION_KIND_CFG_WRITE_C` |
| 实现层参数名 | `LASER_IMPL_TEC_ON2_C` |
| 实现层参数 id | `8'd4` |
| 实现层字数 | `8'd1` |
| 实现层位宽 | `32 bit` |
| 模块最终落地目标 | `cfg_r.tec_on2` |
| 模块最终落地位宽 | `1 bit` |
| 模块上电默认生效值 | `'0` |
| 可选项数量 | `0` |
| 映射表 | 无 |
| 来源 pkg 常量 | `LASER_CTRL_CMD_GROUP_TEC_ON2_C`<br>`LASER_PARAM_TEC_ON2_C`<br>`LASER_IMPL_TEC_ON2_C` |
| 说明 | 应用层参数 `LASER_PARAM_TEC_ON2_C` 在组 `LASER_CTRL_CMD_GROUP_TEC_ON2_C` 内通过 `ACTION_KIND_CFG_WRITE_C` 转换到实现层参数 `LASER_IMPL_TEC_ON2_C`。 |

### LASER_PARAM_MODU_MODE_C

| 字段 | 内容 |
| --- | --- |
| 应用层参数名 | `LASER_PARAM_MODU_MODE_C` |
| 应用层参数中文名 | 调制模式 |
| 应用层参数 id | `8'd5` |
| 所属 group | `LASER_CTRL_CMD_GROUP_MODU_MODE_C` |
| 参数类型 | `PARAM_KIND_VALUE_C` |
| 应用层字数 | `WORD_COUNT_SINGLE_C` |
| 应用层位宽 | `32 bit` |
| 应用层默认值 | `'0` |
| 动作类型 | `ACTION_KIND_CFG_WRITE_C` |
| 实现层参数名 | `LASER_IMPL_MODU_MODE_C` |
| 实现层参数 id | `8'd5` |
| 实现层字数 | `8'd1` |
| 实现层位宽 | `32 bit` |
| 模块最终落地目标 | `cfg_r.modu_mode` |
| 模块最终落地位宽 | `2 bit` |
| 模块上电默认生效值 | `'0` |
| 可选项数量 | `0` |
| 映射表 | 无 |
| 来源 pkg 常量 | `LASER_CTRL_CMD_GROUP_MODU_MODE_C`<br>`LASER_PARAM_MODU_MODE_C`<br>`LASER_IMPL_MODU_MODE_C` |
| 说明 | 应用层参数 `LASER_PARAM_MODU_MODE_C` 在组 `LASER_CTRL_CMD_GROUP_MODU_MODE_C` 内通过 `ACTION_KIND_CFG_WRITE_C` 转换到实现层参数 `LASER_IMPL_MODU_MODE_C`。 |

### LASER_PARAM_VOL_AUTO_C

| 字段 | 内容 |
| --- | --- |
| 应用层参数名 | `LASER_PARAM_VOL_AUTO_C` |
| 应用层参数中文名 | 调制开始 |
| 应用层参数 id | `8'd6` |
| 所属 group | `LASER_CTRL_CMD_GROUP_VOL_AUTO_C` |
| 参数类型 | `PARAM_KIND_VALUE_C` |
| 应用层字数 | `WORD_COUNT_SINGLE_C` |
| 应用层位宽 | `32 bit` |
| 应用层默认值 | `'0` |
| 动作类型 | `ACTION_KIND_CFG_WRITE_C` |
| 实现层参数名 | `LASER_IMPL_VOL_AUTO_C` |
| 实现层参数 id | `8'd6` |
| 实现层字数 | `8'd1` |
| 实现层位宽 | `32 bit` |
| 模块最终落地目标 | `cfg_r.vol_auto` |
| 模块最终落地位宽 | `1 bit` |
| 模块上电默认生效值 | `'0` |
| 可选项数量 | `0` |
| 映射表 | 无 |
| 来源 pkg 常量 | `LASER_CTRL_CMD_GROUP_VOL_AUTO_C`<br>`LASER_PARAM_VOL_AUTO_C`<br>`LASER_IMPL_VOL_AUTO_C` |
| 说明 | 应用层参数 `LASER_PARAM_VOL_AUTO_C` 在组 `LASER_CTRL_CMD_GROUP_VOL_AUTO_C` 内通过 `ACTION_KIND_CFG_WRITE_C` 转换到实现层参数 `LASER_IMPL_VOL_AUTO_C`。 |

### LASER_PARAM_TXM1_SET_C

| 字段 | 内容 |
| --- | --- |
| 应用层参数名 | `LASER_PARAM_TXM1_SET_C` |
| 应用层参数中文名 | 发射激光器1温度手动设置值 |
| 应用层参数 id | `8'd12` |
| 所属 group | `LASER_CTRL_CMD_GROUP_TXM1_SET_C` |
| 参数类型 | `PARAM_KIND_VALUE_C` |
| 应用层字数 | `WORD_COUNT_SINGLE_C` |
| 应用层位宽 | `32 bit` |
| 应用层默认值 | `16'h8000` |
| 动作类型 | `ACTION_KIND_CFG_WRITE_C` |
| 实现层参数名 | `LASER_IMPL_TXM1_SET_C` |
| 实现层参数 id | `8'd12` |
| 实现层字数 | `8'd1` |
| 实现层位宽 | `32 bit` |
| 模块最终落地目标 | `cfg_r.txm1_set` |
| 模块最终落地位宽 | `16 bit` |
| 模块上电默认生效值 | `16'h8000` |
| 可选项数量 | `0` |
| 映射表 | 无 |
| 来源 pkg 常量 | `LASER_CTRL_CMD_GROUP_TXM1_SET_C`<br>`LASER_PARAM_TXM1_SET_C`<br>`LASER_IMPL_TXM1_SET_C` |
| 说明 | 应用层参数 `LASER_PARAM_TXM1_SET_C` 在组 `LASER_CTRL_CMD_GROUP_TXM1_SET_C` 内通过 `ACTION_KIND_CFG_WRITE_C` 转换到实现层参数 `LASER_IMPL_TXM1_SET_C`。 |

### LASER_PARAM_TXM2_SET_C

| 字段 | 内容 |
| --- | --- |
| 应用层参数名 | `LASER_PARAM_TXM2_SET_C` |
| 应用层参数中文名 | 发射激光器2温度手动设置值 |
| 应用层参数 id | `8'd13` |
| 所属 group | `LASER_CTRL_CMD_GROUP_TXM2_SET_C` |
| 参数类型 | `PARAM_KIND_VALUE_C` |
| 应用层字数 | `WORD_COUNT_SINGLE_C` |
| 应用层位宽 | `32 bit` |
| 应用层默认值 | `16'h8000` |
| 动作类型 | `ACTION_KIND_CFG_WRITE_C` |
| 实现层参数名 | `LASER_IMPL_TXM2_SET_C` |
| 实现层参数 id | `8'd13` |
| 实现层字数 | `8'd1` |
| 实现层位宽 | `32 bit` |
| 模块最终落地目标 | `cfg_r.txm2_set` |
| 模块最终落地位宽 | `16 bit` |
| 模块上电默认生效值 | `16'h8000` |
| 可选项数量 | `0` |
| 映射表 | 无 |
| 来源 pkg 常量 | `LASER_CTRL_CMD_GROUP_TXM2_SET_C`<br>`LASER_PARAM_TXM2_SET_C`<br>`LASER_IMPL_TXM2_SET_C` |
| 说明 | 应用层参数 `LASER_PARAM_TXM2_SET_C` 在组 `LASER_CTRL_CMD_GROUP_TXM2_SET_C` 内通过 `ACTION_KIND_CFG_WRITE_C` 转换到实现层参数 `LASER_IMPL_TXM2_SET_C`。 |

### LASER_PARAM_LO1_SET_C

| 字段 | 内容 |
| --- | --- |
| 应用层参数名 | `LASER_PARAM_LO1_SET_C` |
| 应用层参数中文名 | 本振激光器1温度手动设置值 |
| 应用层参数 id | `8'd14` |
| 所属 group | `LASER_CTRL_CMD_GROUP_LO1_SET_C` |
| 参数类型 | `PARAM_KIND_VALUE_C` |
| 应用层字数 | `WORD_COUNT_SINGLE_C` |
| 应用层位宽 | `32 bit` |
| 应用层默认值 | `16'h8000` |
| 动作类型 | `ACTION_KIND_CFG_WRITE_C` |
| 实现层参数名 | `LASER_IMPL_LO1_SET_C` |
| 实现层参数 id | `8'd14` |
| 实现层字数 | `8'd1` |
| 实现层位宽 | `32 bit` |
| 模块最终落地目标 | `cfg_r.lo1_set` |
| 模块最终落地位宽 | `16 bit` |
| 模块上电默认生效值 | `16'h8000` |
| 可选项数量 | `0` |
| 映射表 | 无 |
| 来源 pkg 常量 | `LASER_CTRL_CMD_GROUP_LO1_SET_C`<br>`LASER_PARAM_LO1_SET_C`<br>`LASER_IMPL_LO1_SET_C` |
| 说明 | 应用层参数 `LASER_PARAM_LO1_SET_C` 在组 `LASER_CTRL_CMD_GROUP_LO1_SET_C` 内通过 `ACTION_KIND_CFG_WRITE_C` 转换到实现层参数 `LASER_IMPL_LO1_SET_C`。 |

### LASER_PARAM_LO2_SET_C

| 字段 | 内容 |
| --- | --- |
| 应用层参数名 | `LASER_PARAM_LO2_SET_C` |
| 应用层参数中文名 | 本振激光器2温度手动设置值 |
| 应用层参数 id | `8'd15` |
| 所属 group | `LASER_CTRL_CMD_GROUP_LO2_SET_C` |
| 参数类型 | `PARAM_KIND_VALUE_C` |
| 应用层字数 | `WORD_COUNT_SINGLE_C` |
| 应用层位宽 | `32 bit` |
| 应用层默认值 | `16'h8000` |
| 动作类型 | `ACTION_KIND_CFG_WRITE_C` |
| 实现层参数名 | `LASER_IMPL_LO2_SET_C` |
| 实现层参数 id | `8'd15` |
| 实现层字数 | `8'd1` |
| 实现层位宽 | `32 bit` |
| 模块最终落地目标 | `cfg_r.lo2_set` |
| 模块最终落地位宽 | `16 bit` |
| 模块上电默认生效值 | `16'h8000` |
| 可选项数量 | `0` |
| 映射表 | 无 |
| 来源 pkg 常量 | `LASER_CTRL_CMD_GROUP_LO2_SET_C`<br>`LASER_PARAM_LO2_SET_C`<br>`LASER_IMPL_LO2_SET_C` |
| 说明 | 应用层参数 `LASER_PARAM_LO2_SET_C` 在组 `LASER_CTRL_CMD_GROUP_LO2_SET_C` 内通过 `ACTION_KIND_CFG_WRITE_C` 转换到实现层参数 `LASER_IMPL_LO2_SET_C`。 |
