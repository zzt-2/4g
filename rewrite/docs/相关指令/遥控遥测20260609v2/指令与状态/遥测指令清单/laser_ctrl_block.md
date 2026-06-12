# laser_ctrl_block 遥测指令清单

## 来源

- 遥测 agent：`D:/vivado_project/CZW/CZW_V7_runner_201803/repo_main/import/rtl_source/laser_ctrl_block/ctrl_tm/laser_ctrl_tm_agent.sv`
- module_id：`MODULE_ID_LASER_CTRL_C = 4'h4`

## Group 总表

### TM_GROUP_RUNTIME_C

| 上报字索引 | 关联字段 | 字段中文名 | 来源表达式 | 字段真实位宽 |
| --- | --- | --- | --- | --- |
| [TM_GROUP_RUNTIME_C_WORD_0](#tm_group_runtime_c_word_0) | `txm1_t_m_out` | 发射1温度 | `{16'h0000, stat_i.txm1_t_m_out}` | `16 bit` |
| [TM_GROUP_RUNTIME_C_WORD_1](#tm_group_runtime_c_word_1) | `txm1_c_m_out` | 发射1状态参数 | `{16'h0000, stat_i.txm1_c_m_out}` | `16 bit` |
| [TM_GROUP_RUNTIME_C_WORD_2](#tm_group_runtime_c_word_2) | `lo1_t_m_out` | 本振1温度 | `{16'h0000, stat_i.lo1_t_m_out}` | `16 bit` |
| [TM_GROUP_RUNTIME_C_WORD_3](#tm_group_runtime_c_word_3) | `lo1_c_m_out` | 本振1状态参数 | `{16'h0000, stat_i.lo1_c_m_out}` | `16 bit` |
| [TM_GROUP_RUNTIME_C_WORD_4](#tm_group_runtime_c_word_4) | `tec1_t_m_out` | TEC1温度 | `{16'h0000, stat_i.tec1_t_m_out}` | `16 bit` |
| [TM_GROUP_RUNTIME_C_WORD_5](#tm_group_runtime_c_word_5) | `tec1_c_2v5_m_out` | TEC1状态参数 | `{16'h0000, stat_i.tec1_c_2v5_m_out}` | `16 bit` |
| [TM_GROUP_RUNTIME_C_WORD_6](#tm_group_runtime_c_word_6) | `mod_pd_yc_out` | 调制器状态参数1 | `{16'h0000, stat_i.mod_pd_yc_out}` | `16 bit` |
| [TM_GROUP_RUNTIME_C_WORD_7](#tm_group_runtime_c_word_7) | `hmc_mod_pd_yc_out` | 调制器状态参数2 | `{16'h0000, stat_i.hmc_mod_pd_yc_out}` | `16 bit` |
| [TM_GROUP_RUNTIME_C_WORD_8](#tm_group_runtime_c_word_8) | `txm2_t_m_out` | 发射2温度 | `{16'h0000, stat_i.txm2_t_m_out}` | `16 bit` |
| [TM_GROUP_RUNTIME_C_WORD_9](#tm_group_runtime_c_word_9) | `txm2_c_m_out` | 发射2状态参数 | `{16'h0000, stat_i.txm2_c_m_out}` | `16 bit` |
| [TM_GROUP_RUNTIME_C_WORD_10](#tm_group_runtime_c_word_10) | `lo2_t_m_out` | 本振2温度 | `{16'h0000, stat_i.lo2_t_m_out}` | `16 bit` |
| [TM_GROUP_RUNTIME_C_WORD_11](#tm_group_runtime_c_word_11) | `lo2_c_m_out` | 本振2状态参数 | `{16'h0000, stat_i.lo2_c_m_out}` | `16 bit` |
| [TM_GROUP_RUNTIME_C_WORD_12](#tm_group_runtime_c_word_12) | `tec2_t_m_out` | TEC2温度 | `{16'h0000, stat_i.tec2_t_m_out}` | `16 bit` |
| [TM_GROUP_RUNTIME_C_WORD_13](#tm_group_runtime_c_word_13) | `tec2_c_2v5_m_out` | TEC2状态参数 | `{16'h0000, stat_i.tec2_c_2v5_m_out}` | `16 bit` |

### TM_GROUP_CFG_C

| 上报字索引 | 关联字段 | 字段中文名 | 来源表达式 | 字段真实位宽 |
| --- | --- | --- | --- | --- |
| [TM_GROUP_CFG_C_WORD_0](#tm_group_cfg_c_word_0) | `txm_on` | 发射激光器开关 | `{30'h0000_0000, cfg_i.txm_on}` | `2 bit` |
| [TM_GROUP_CFG_C_WORD_1](#tm_group_cfg_c_word_1) | `lo_on` | 本振激光器开关 | `{30'h0000_0000, cfg_i.lo_on}` | `2 bit` |
| [TM_GROUP_CFG_C_WORD_2](#tm_group_cfg_c_word_2) | `wave_set_on` | 参数包/手动温度选择 | `bool_to_u32(cfg_i.wave_set_on)` | `1 bit` |
| [TM_GROUP_CFG_C_WORD_3](#tm_group_cfg_c_word_3) | `tec_on1` | TEC1 开关 | `bool_to_u32(cfg_i.tec_on1)` | `1 bit` |
| [TM_GROUP_CFG_C_WORD_4](#tm_group_cfg_c_word_4) | `tec_on2` | TEC2 开关 | `bool_to_u32(cfg_i.tec_on2)` | `1 bit` |
| [TM_GROUP_CFG_C_WORD_5](#tm_group_cfg_c_word_5) | `modu_mode` | 调制模式 | `{30'h0000_0000, cfg_i.modu_mode}` | `2 bit` |
| [TM_GROUP_CFG_C_WORD_6](#tm_group_cfg_c_word_6) | `vol_auto` | 调制开始 | `bool_to_u32(cfg_i.vol_auto)` | `1 bit` |
| [TM_GROUP_CFG_C_WORD_7](#tm_group_cfg_c_word_7) | `doppler_on` | 多普勒功能开关 | `bool_to_u32(cfg_i.doppler_on)` | `1 bit` |
| [TM_GROUP_CFG_C_WORD_8](#tm_group_cfg_c_word_8) | `saomiao_on` | 扫描开关 | `bool_to_u32(cfg_i.saomiao_on)` | `1 bit` |
| [TM_GROUP_CFG_C_WORD_9](#tm_group_cfg_c_word_9) | `genzong_on` | 跟踪开关 | `bool_to_u32(cfg_i.genzong_on)` | `1 bit` |
| [TM_GROUP_CFG_C_WORD_10](#tm_group_cfg_c_word_10) | `flag_mod` | 调制标志 | `bool_to_u32(cfg_i.flag_mod)` | `1 bit` |
| [TM_GROUP_CFG_C_WORD_11](#tm_group_cfg_c_word_11) | `flag_sz` | SZ 标志输入 | `bool_to_u32(cfg_i.flag_sz)` | `1 bit` |
| [TM_GROUP_CFG_C_WORD_12](#tm_group_cfg_c_word_12) | `txm1_set` | 发射激光器1温度手动设置值 | `{16'h0000, cfg_i.txm1_set}` | `16 bit` |
| [TM_GROUP_CFG_C_WORD_13](#tm_group_cfg_c_word_13) | `txm2_set` | 发射激光器2温度手动设置值 | `{16'h0000, cfg_i.txm2_set}` | `16 bit` |
| [TM_GROUP_CFG_C_WORD_14](#tm_group_cfg_c_word_14) | `lo1_set` | 本振激光器1温度手动设置值 | `{16'h0000, cfg_i.lo1_set}` | `16 bit` |
| [TM_GROUP_CFG_C_WORD_15](#tm_group_cfg_c_word_15) | `lo2_set` | 本振激光器2温度手动设置值 | `{16'h0000, cfg_i.lo2_set}` | `16 bit` |
| [TM_GROUP_CFG_C_WORD_16](#tm_group_cfg_c_word_16) | `modul_dc1_set` | 调制器 DC1 设置 | `{16'h0000, cfg_i.modul_dc1_set}` | `16 bit` |
| [TM_GROUP_CFG_C_WORD_17](#tm_group_cfg_c_word_17) | `modul_dc2_set` | 调制器 DC2 设置 | `{16'h0000, cfg_i.modul_dc2_set}` | `16 bit` |
| [TM_GROUP_CFG_C_WORD_18](#tm_group_cfg_c_word_18) | `modul_dc3_set` | 调制器 DC3 设置 | `{16'h0000, cfg_i.modul_dc3_set}` | `16 bit` |
| [TM_GROUP_CFG_C_WORD_19](#tm_group_cfg_c_word_19) | `doppler_pre` | 预报多普勒值 | `{16'h0000, cfg_i.doppler_pre}` | `16 bit` |
| [TM_GROUP_CFG_C_WORD_20](#tm_group_cfg_c_word_20) | `dat_sz` | SZ 数据输入 | `{24'h000000, cfg_i.dat_sz}` | `8 bit` |

## 上报字说明表

### TM_GROUP_RUNTIME_C_WORD_0

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字索引 | `0` |
| 来源表达式 | `{16'h0000, stat_i.txm1_t_m_out}` |
| 关联字段 | `txm1_t_m_out` |
| 字段中文名 | 发射1温度 |
| 字段真实位宽 | `16 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_RUNTIME_C_WORD_1

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字索引 | `1` |
| 来源表达式 | `{16'h0000, stat_i.txm1_c_m_out}` |
| 关联字段 | `txm1_c_m_out` |
| 字段中文名 | 发射1状态参数 |
| 字段真实位宽 | `16 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_RUNTIME_C_WORD_2

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字索引 | `2` |
| 来源表达式 | `{16'h0000, stat_i.lo1_t_m_out}` |
| 关联字段 | `lo1_t_m_out` |
| 字段中文名 | 本振1温度 |
| 字段真实位宽 | `16 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_RUNTIME_C_WORD_3

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字索引 | `3` |
| 来源表达式 | `{16'h0000, stat_i.lo1_c_m_out}` |
| 关联字段 | `lo1_c_m_out` |
| 字段中文名 | 本振1状态参数 |
| 字段真实位宽 | `16 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_RUNTIME_C_WORD_4

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字索引 | `4` |
| 来源表达式 | `{16'h0000, stat_i.tec1_t_m_out}` |
| 关联字段 | `tec1_t_m_out` |
| 字段中文名 | TEC1温度 |
| 字段真实位宽 | `16 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_RUNTIME_C_WORD_5

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字索引 | `5` |
| 来源表达式 | `{16'h0000, stat_i.tec1_c_2v5_m_out}` |
| 关联字段 | `tec1_c_2v5_m_out` |
| 字段中文名 | TEC1状态参数 |
| 字段真实位宽 | `16 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_RUNTIME_C_WORD_6

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字索引 | `6` |
| 来源表达式 | `{16'h0000, stat_i.mod_pd_yc_out}` |
| 关联字段 | `mod_pd_yc_out` |
| 字段中文名 | 调制器状态参数1 |
| 字段真实位宽 | `16 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_RUNTIME_C_WORD_7

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字索引 | `7` |
| 来源表达式 | `{16'h0000, stat_i.hmc_mod_pd_yc_out}` |
| 关联字段 | `hmc_mod_pd_yc_out` |
| 字段中文名 | 调制器状态参数2 |
| 字段真实位宽 | `16 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_RUNTIME_C_WORD_8

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字索引 | `8` |
| 来源表达式 | `{16'h0000, stat_i.txm2_t_m_out}` |
| 关联字段 | `txm2_t_m_out` |
| 字段中文名 | 发射2温度 |
| 字段真实位宽 | `16 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_RUNTIME_C_WORD_9

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字索引 | `9` |
| 来源表达式 | `{16'h0000, stat_i.txm2_c_m_out}` |
| 关联字段 | `txm2_c_m_out` |
| 字段中文名 | 发射2状态参数 |
| 字段真实位宽 | `16 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_RUNTIME_C_WORD_10

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字索引 | `10` |
| 来源表达式 | `{16'h0000, stat_i.lo2_t_m_out}` |
| 关联字段 | `lo2_t_m_out` |
| 字段中文名 | 本振2温度 |
| 字段真实位宽 | `16 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_RUNTIME_C_WORD_11

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字索引 | `11` |
| 来源表达式 | `{16'h0000, stat_i.lo2_c_m_out}` |
| 关联字段 | `lo2_c_m_out` |
| 字段中文名 | 本振2状态参数 |
| 字段真实位宽 | `16 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_RUNTIME_C_WORD_12

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字索引 | `12` |
| 来源表达式 | `{16'h0000, stat_i.tec2_t_m_out}` |
| 关联字段 | `tec2_t_m_out` |
| 字段中文名 | TEC2温度 |
| 字段真实位宽 | `16 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_RUNTIME_C_WORD_13

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_RUNTIME_C` |
| group_id | `8'h80` |
| 上报字索引 | `13` |
| 来源表达式 | `{16'h0000, stat_i.tec2_c_2v5_m_out}` |
| 关联字段 | `tec2_c_2v5_m_out` |
| 字段中文名 | TEC2状态参数 |
| 字段真实位宽 | `16 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_CFG_C_WORD_0

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_CFG_C` |
| group_id | `8'h81` |
| 上报字索引 | `0` |
| 来源表达式 | `{30'h0000_0000, cfg_i.txm_on}` |
| 关联字段 | `txm_on` |
| 字段中文名 | 发射激光器开关 |
| 字段真实位宽 | `2 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_CFG_C_WORD_1

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_CFG_C` |
| group_id | `8'h81` |
| 上报字索引 | `1` |
| 来源表达式 | `{30'h0000_0000, cfg_i.lo_on}` |
| 关联字段 | `lo_on` |
| 字段中文名 | 本振激光器开关 |
| 字段真实位宽 | `2 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_CFG_C_WORD_2

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_CFG_C` |
| group_id | `8'h81` |
| 上报字索引 | `2` |
| 来源表达式 | `bool_to_u32(cfg_i.wave_set_on)` |
| 关联字段 | `wave_set_on` |
| 字段中文名 | 参数包/手动温度选择 |
| 字段真实位宽 | `1 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_CFG_C_WORD_3

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_CFG_C` |
| group_id | `8'h81` |
| 上报字索引 | `3` |
| 来源表达式 | `bool_to_u32(cfg_i.tec_on1)` |
| 关联字段 | `tec_on1` |
| 字段中文名 | TEC1 开关 |
| 字段真实位宽 | `1 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_CFG_C_WORD_4

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_CFG_C` |
| group_id | `8'h81` |
| 上报字索引 | `4` |
| 来源表达式 | `bool_to_u32(cfg_i.tec_on2)` |
| 关联字段 | `tec_on2` |
| 字段中文名 | TEC2 开关 |
| 字段真实位宽 | `1 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_CFG_C_WORD_5

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_CFG_C` |
| group_id | `8'h81` |
| 上报字索引 | `5` |
| 来源表达式 | `{30'h0000_0000, cfg_i.modu_mode}` |
| 关联字段 | `modu_mode` |
| 字段中文名 | 调制模式 |
| 字段真实位宽 | `2 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_CFG_C_WORD_6

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_CFG_C` |
| group_id | `8'h81` |
| 上报字索引 | `6` |
| 来源表达式 | `bool_to_u32(cfg_i.vol_auto)` |
| 关联字段 | `vol_auto` |
| 字段中文名 | 调制开始 |
| 字段真实位宽 | `1 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_CFG_C_WORD_7

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_CFG_C` |
| group_id | `8'h81` |
| 上报字索引 | `7` |
| 来源表达式 | `bool_to_u32(cfg_i.doppler_on)` |
| 关联字段 | `doppler_on` |
| 字段中文名 | 多普勒功能开关 |
| 字段真实位宽 | `1 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_CFG_C_WORD_8

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_CFG_C` |
| group_id | `8'h81` |
| 上报字索引 | `8` |
| 来源表达式 | `bool_to_u32(cfg_i.saomiao_on)` |
| 关联字段 | `saomiao_on` |
| 字段中文名 | 扫描开关 |
| 字段真实位宽 | `1 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_CFG_C_WORD_9

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_CFG_C` |
| group_id | `8'h81` |
| 上报字索引 | `9` |
| 来源表达式 | `bool_to_u32(cfg_i.genzong_on)` |
| 关联字段 | `genzong_on` |
| 字段中文名 | 跟踪开关 |
| 字段真实位宽 | `1 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_CFG_C_WORD_10

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_CFG_C` |
| group_id | `8'h81` |
| 上报字索引 | `10` |
| 来源表达式 | `bool_to_u32(cfg_i.flag_mod)` |
| 关联字段 | `flag_mod` |
| 字段中文名 | 调制标志 |
| 字段真实位宽 | `1 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_CFG_C_WORD_11

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_CFG_C` |
| group_id | `8'h81` |
| 上报字索引 | `11` |
| 来源表达式 | `bool_to_u32(cfg_i.flag_sz)` |
| 关联字段 | `flag_sz` |
| 字段中文名 | SZ 标志输入 |
| 字段真实位宽 | `1 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_CFG_C_WORD_12

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_CFG_C` |
| group_id | `8'h81` |
| 上报字索引 | `12` |
| 来源表达式 | `{16'h0000, cfg_i.txm1_set}` |
| 关联字段 | `txm1_set` |
| 字段中文名 | 发射激光器1温度手动设置值 |
| 字段真实位宽 | `16 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_CFG_C_WORD_13

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_CFG_C` |
| group_id | `8'h81` |
| 上报字索引 | `13` |
| 来源表达式 | `{16'h0000, cfg_i.txm2_set}` |
| 关联字段 | `txm2_set` |
| 字段中文名 | 发射激光器2温度手动设置值 |
| 字段真实位宽 | `16 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_CFG_C_WORD_14

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_CFG_C` |
| group_id | `8'h81` |
| 上报字索引 | `14` |
| 来源表达式 | `{16'h0000, cfg_i.lo1_set}` |
| 关联字段 | `lo1_set` |
| 字段中文名 | 本振激光器1温度手动设置值 |
| 字段真实位宽 | `16 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_CFG_C_WORD_15

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_CFG_C` |
| group_id | `8'h81` |
| 上报字索引 | `15` |
| 来源表达式 | `{16'h0000, cfg_i.lo2_set}` |
| 关联字段 | `lo2_set` |
| 字段中文名 | 本振激光器2温度手动设置值 |
| 字段真实位宽 | `16 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_CFG_C_WORD_16

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_CFG_C` |
| group_id | `8'h81` |
| 上报字索引 | `16` |
| 来源表达式 | `{16'h0000, cfg_i.modul_dc1_set}` |
| 关联字段 | `modul_dc1_set` |
| 字段中文名 | 调制器 DC1 设置 |
| 字段真实位宽 | `16 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_CFG_C_WORD_17

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_CFG_C` |
| group_id | `8'h81` |
| 上报字索引 | `17` |
| 来源表达式 | `{16'h0000, cfg_i.modul_dc2_set}` |
| 关联字段 | `modul_dc2_set` |
| 字段中文名 | 调制器 DC2 设置 |
| 字段真实位宽 | `16 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_CFG_C_WORD_18

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_CFG_C` |
| group_id | `8'h81` |
| 上报字索引 | `18` |
| 来源表达式 | `{16'h0000, cfg_i.modul_dc3_set}` |
| 关联字段 | `modul_dc3_set` |
| 字段中文名 | 调制器 DC3 设置 |
| 字段真实位宽 | `16 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_CFG_C_WORD_19

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_CFG_C` |
| group_id | `8'h81` |
| 上报字索引 | `19` |
| 来源表达式 | `{16'h0000, cfg_i.doppler_pre}` |
| 关联字段 | `doppler_pre` |
| 字段中文名 | 预报多普勒值 |
| 字段真实位宽 | `16 bit` |
| 应用层上报字位宽 | `32 bit` |

### TM_GROUP_CFG_C_WORD_20

| 字段 | 内容 |
| --- | --- |
| 所属group | `TM_GROUP_CFG_C` |
| group_id | `8'h81` |
| 上报字索引 | `20` |
| 来源表达式 | `{24'h000000, cfg_i.dat_sz}` |
| 关联字段 | `dat_sz` |
| 字段中文名 | SZ 数据输入 |
| 字段真实位宽 | `8 bit` |
| 应用层上报字位宽 | `32 bit` |
