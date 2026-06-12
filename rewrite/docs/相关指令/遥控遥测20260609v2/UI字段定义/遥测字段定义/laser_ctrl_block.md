# laser_ctrl_block 遥测 UI 字段定义

- 来源：`import/rtl_source/laser_ctrl_block/vars/*_ctrl_pkg.sv` 和 `指令与状态/遥测指令清单/laser_ctrl_block.md`
- word 列表示遥测 payload 数据字索引，不包含 RS422 帧头、长度字、应用层头和 checksum。
- 对于 64bit/192bit 这类跨 word 字段，表中会按每个 32bit 分片列出，软件按字段切片说明重组。

## TM_GROUP_RUNTIME_C

- group_id：`8'h80`

| 参数原始字段名      | UI显示名称      | word | 索引位宽     | 有符号/无符号 | UI类型 | 参数表格索引                                                                        |
| ------------------- | --------------- | ---- | ------------ | ------------- | ------ | ----------------------------------------------------------------------------------- |
| `txm1_t_m_out`      | 发射1温度       | `0`  | `word[15:0]` | 无符号数      | 显示   | [UI_TM_GROUP_RUNTIME_C_TXM1_T_M_OUT](#ui_tm_group_runtime_c_txm1_t_m_out)           |
| `txm1_c_m_out`      | 发射1状态参数   | `1`  | `word[15:0]` | 无符号数      | 显示   | [UI_TM_GROUP_RUNTIME_C_TXM1_C_M_OUT](#ui_tm_group_runtime_c_txm1_c_m_out)           |
| `lo1_t_m_out`       | 本振1温度       | `2`  | `word[15:0]` | 无符号数      | 显示   | [UI_TM_GROUP_RUNTIME_C_LO1_T_M_OUT](#ui_tm_group_runtime_c_lo1_t_m_out)             |
| `lo1_c_m_out`       | 本振1状态参数   | `3`  | `word[15:0]` | 无符号数      | 显示   | [UI_TM_GROUP_RUNTIME_C_LO1_C_M_OUT](#ui_tm_group_runtime_c_lo1_c_m_out)             |
| `tec1_t_m_out`      | TEC1温度        | `4`  | `word[15:0]` | 无符号数      | 显示   | [UI_TM_GROUP_RUNTIME_C_TEC1_T_M_OUT](#ui_tm_group_runtime_c_tec1_t_m_out)           |
| `tec1_c_2v5_m_out`  | TEC1状态参数    | `5`  | `word[15:0]` | 无符号数      | 显示   | [UI_TM_GROUP_RUNTIME_C_TEC1_C_2V5_M_OUT](#ui_tm_group_runtime_c_tec1_c_2v5_m_out)   |
| `mod_pd_yc_out`     | 调制器状态参数1 | `6`  | `word[15:0]` | 无符号数      | 显示   | [UI_TM_GROUP_RUNTIME_C_MOD_PD_YC_OUT](#ui_tm_group_runtime_c_mod_pd_yc_out)         |
| `hmc_mod_pd_yc_out` | 调制器状态参数2 | `7`  | `word[15:0]` | 无符号数      | 显示   | [UI_TM_GROUP_RUNTIME_C_HMC_MOD_PD_YC_OUT](#ui_tm_group_runtime_c_hmc_mod_pd_yc_out) |
| `txm2_t_m_out`      | 发射2温度       | `8`  | `word[15:0]` | 无符号数      | 显示   | [UI_TM_GROUP_RUNTIME_C_TXM2_T_M_OUT](#ui_tm_group_runtime_c_txm2_t_m_out)           |
| `txm2_c_m_out`      | 发射2状态参数   | `9`  | `word[15:0]` | 无符号数      | 显示   | [UI_TM_GROUP_RUNTIME_C_TXM2_C_M_OUT](#ui_tm_group_runtime_c_txm2_c_m_out)           |
| `lo2_t_m_out`       | 本振2温度       | `10` | `word[15:0]` | 无符号数      | 显示   | [UI_TM_GROUP_RUNTIME_C_LO2_T_M_OUT](#ui_tm_group_runtime_c_lo2_t_m_out)             |
| `lo2_c_m_out`       | 本振2状态参数   | `11` | `word[15:0]` | 无符号数      | 显示   | [UI_TM_GROUP_RUNTIME_C_LO2_C_M_OUT](#ui_tm_group_runtime_c_lo2_c_m_out)             |
| `tec2_t_m_out`      | TEC2温度        | `12` | `word[15:0]` | 无符号数      | 显示   | [UI_TM_GROUP_RUNTIME_C_TEC2_T_M_OUT](#ui_tm_group_runtime_c_tec2_t_m_out)           |
| `tec2_c_2v5_m_out`  | TEC2状态参数    | `13` | `word[15:0]` | 无符号数      | 显示   | [UI_TM_GROUP_RUNTIME_C_TEC2_C_2V5_M_OUT](#ui_tm_group_runtime_c_tec2_c_2v5_m_out)   |

## TM_GROUP_CFG_C

- group_id：`8'h81`

| 参数原始字段名  | UI显示名称                | word | 索引位宽     | 有符号/无符号 | UI类型 | 参数表格索引                                                        |
| --------------- | ------------------------- | ---- | ------------ | ------------- | ------ | ------------------------------------------------------------------- |
| `txm_on`        | 发射激光器开关            | `0`  | `word[1:0]`  | 无符号数      | 显示   | [UI_TM_GROUP_CFG_C_TXM_ON](#ui_tm_group_cfg_c_txm_on)               |
| `lo_on`         | 本振激光器开关            | `1`  | `word[1:0]`  | 无符号数      | 显示   | [UI_TM_GROUP_CFG_C_LO_ON](#ui_tm_group_cfg_c_lo_on)                 |
| `wave_set_on`   | 参数包/手动温度选择       | `2`  | `word[0]`    | 无符号数      | 显示   | [UI_TM_GROUP_CFG_C_WAVE_SET_ON](#ui_tm_group_cfg_c_wave_set_on)     |
| `tec_on1`       | TEC1 开关                 | `3`  | `word[0]`    | 无符号数      | 显示   | [UI_TM_GROUP_CFG_C_TEC_ON1](#ui_tm_group_cfg_c_tec_on1)             |
| `tec_on2`       | TEC2 开关                 | `4`  | `word[0]`    | 无符号数      | 显示   | [UI_TM_GROUP_CFG_C_TEC_ON2](#ui_tm_group_cfg_c_tec_on2)             |
| `modu_mode`     | 调制模式                  | `5`  | `word[1:0]`  | 无符号数      | 显示   | [UI_TM_GROUP_CFG_C_MODU_MODE](#ui_tm_group_cfg_c_modu_mode)         |
| `vol_auto`      | 调制开始                  | `6`  | `word[0]`    | 无符号数      | 显示   | [UI_TM_GROUP_CFG_C_VOL_AUTO](#ui_tm_group_cfg_c_vol_auto)           |
| `doppler_on`    | 多普勒功能开关            | `7`  | `word[0]`    | 无符号数      | 显示   | [UI_TM_GROUP_CFG_C_DOPPLER_ON](#ui_tm_group_cfg_c_doppler_on)       |
| `saomiao_on`    | 扫描开关                  | `8`  | `word[0]`    | 无符号数      | 显示   | [UI_TM_GROUP_CFG_C_SAOMIAO_ON](#ui_tm_group_cfg_c_saomiao_on)       |
| `genzong_on`    | 跟踪开关                  | `9`  | `word[0]`    | 无符号数      | 显示   | [UI_TM_GROUP_CFG_C_GENZONG_ON](#ui_tm_group_cfg_c_genzong_on)       |
| `flag_mod`      | 调制标志                  | `10` | `word[0]`    | 无符号数      | 显示   | [UI_TM_GROUP_CFG_C_FLAG_MOD](#ui_tm_group_cfg_c_flag_mod)           |
| `flag_sz`       | SZ 标志输入               | `11` | `word[0]`    | 无符号数      | 显示   | [UI_TM_GROUP_CFG_C_FLAG_SZ](#ui_tm_group_cfg_c_flag_sz)             |
| `txm1_set`      | 发射激光器1温度手动设置值 | `12` | `word[15:0]` | 无符号数      | 显示   | [UI_TM_GROUP_CFG_C_TXM1_SET](#ui_tm_group_cfg_c_txm1_set)           |
| `txm2_set`      | 发射激光器2温度手动设置值 | `13` | `word[15:0]` | 无符号数      | 显示   | [UI_TM_GROUP_CFG_C_TXM2_SET](#ui_tm_group_cfg_c_txm2_set)           |
| `lo1_set`       | 本振激光器1温度手动设置值 | `14` | `word[15:0]` | 无符号数      | 显示   | [UI_TM_GROUP_CFG_C_LO1_SET](#ui_tm_group_cfg_c_lo1_set)             |
| `lo2_set`       | 本振激光器2温度手动设置值 | `15` | `word[15:0]` | 无符号数      | 显示   | [UI_TM_GROUP_CFG_C_LO2_SET](#ui_tm_group_cfg_c_lo2_set)             |
| `modul_dc1_set` | 调制器 DC1 设置           | `16` | `word[15:0]` | 无符号数      | 显示   | [UI_TM_GROUP_CFG_C_MODUL_DC1_SET](#ui_tm_group_cfg_c_modul_dc1_set) |
| `modul_dc2_set` | 调制器 DC2 设置           | `17` | `word[15:0]` | 无符号数      | 显示   | [UI_TM_GROUP_CFG_C_MODUL_DC2_SET](#ui_tm_group_cfg_c_modul_dc2_set) |
| `modul_dc3_set` | 调制器 DC3 设置           | `18` | `word[15:0]` | 无符号数      | 显示   | [UI_TM_GROUP_CFG_C_MODUL_DC3_SET](#ui_tm_group_cfg_c_modul_dc3_set) |
| `doppler_pre`   | 预报多普勒值              | `19` | `word[15:0]` | 无符号数      | 显示   | [UI_TM_GROUP_CFG_C_DOPPLER_PRE](#ui_tm_group_cfg_c_doppler_pre)     |
| `dat_sz`        | SZ 数据输入               | `20` | `word[7:0]`  | 无符号数      | 显示   | [UI_TM_GROUP_CFG_C_DAT_SZ](#ui_tm_group_cfg_c_dat_sz)               |

## 参数表格

### UI_TM_GROUP_RUNTIME_C_TXM1_T_M_OUT

- 原始字段：`txm1_t_m_out`
- UI名称：发射1温度
- 显示类型：数值显示
- 截取位置：`word[15:0]`
- 数据宽度：`16 bit`

| 接收值   | UI显示          | 说明               |
| -------- | --------------- | ------------------ |
| `原始值` | 16 bit 无符号数 | 按无符号十进制显示 |

### UI_TM_GROUP_RUNTIME_C_TXM1_C_M_OUT

- 原始字段：`txm1_c_m_out`
- UI名称：发射1状态参数
- 显示类型：数值显示
- 截取位置：`word[15:0]`
- 数据宽度：`16 bit`

| 接收值   | UI显示          | 说明               |
| -------- | --------------- | ------------------ |
| `原始值` | 16 bit 无符号数 | 按无符号十进制显示 |

### UI_TM_GROUP_RUNTIME_C_LO1_T_M_OUT

- 原始字段：`lo1_t_m_out`
- UI名称：本振1温度
- 显示类型：数值显示
- 截取位置：`word[15:0]`
- 数据宽度：`16 bit`

| 接收值   | UI显示          | 说明               |
| -------- | --------------- | ------------------ |
| `原始值` | 16 bit 无符号数 | 按无符号十进制显示 |

### UI_TM_GROUP_RUNTIME_C_LO1_C_M_OUT

- 原始字段：`lo1_c_m_out`
- UI名称：本振1状态参数
- 显示类型：数值显示
- 截取位置：`word[15:0]`
- 数据宽度：`16 bit`

| 接收值   | UI显示          | 说明               |
| -------- | --------------- | ------------------ |
| `原始值` | 16 bit 无符号数 | 按无符号十进制显示 |

### UI_TM_GROUP_RUNTIME_C_TEC1_T_M_OUT

- 原始字段：`tec1_t_m_out`
- UI名称：TEC1温度
- 显示类型：数值显示
- 截取位置：`word[15:0]`
- 数据宽度：`16 bit`

| 接收值   | UI显示          | 说明               |
| -------- | --------------- | ------------------ |
| `原始值` | 16 bit 无符号数 | 按无符号十进制显示 |

### UI_TM_GROUP_RUNTIME_C_TEC1_C_2V5_M_OUT

- 原始字段：`tec1_c_2v5_m_out`
- UI名称：TEC1状态参数
- 显示类型：数值显示
- 截取位置：`word[15:0]`
- 数据宽度：`16 bit`

| 接收值   | UI显示          | 说明               |
| -------- | --------------- | ------------------ |
| `原始值` | 16 bit 无符号数 | 按无符号十进制显示 |

### UI_TM_GROUP_RUNTIME_C_MOD_PD_YC_OUT

- 原始字段：`mod_pd_yc_out`
- UI名称：调制器状态参数1
- 显示类型：数值显示
- 截取位置：`word[15:0]`
- 数据宽度：`16 bit`

| 接收值   | UI显示          | 说明               |
| -------- | --------------- | ------------------ |
| `原始值` | 16 bit 无符号数 | 按无符号十进制显示 |

### UI_TM_GROUP_RUNTIME_C_HMC_MOD_PD_YC_OUT

- 原始字段：`hmc_mod_pd_yc_out`
- UI名称：调制器状态参数2
- 显示类型：数值显示
- 截取位置：`word[15:0]`
- 数据宽度：`16 bit`

| 接收值   | UI显示          | 说明               |
| -------- | --------------- | ------------------ |
| `原始值` | 16 bit 无符号数 | 按无符号十进制显示 |

### UI_TM_GROUP_RUNTIME_C_TXM2_T_M_OUT

- 原始字段：`txm2_t_m_out`
- UI名称：发射2温度
- 显示类型：数值显示
- 截取位置：`word[15:0]`
- 数据宽度：`16 bit`

| 接收值   | UI显示          | 说明               |
| -------- | --------------- | ------------------ |
| `原始值` | 16 bit 无符号数 | 按无符号十进制显示 |

### UI_TM_GROUP_RUNTIME_C_TXM2_C_M_OUT

- 原始字段：`txm2_c_m_out`
- UI名称：发射2状态参数
- 显示类型：数值显示
- 截取位置：`word[15:0]`
- 数据宽度：`16 bit`

| 接收值   | UI显示          | 说明               |
| -------- | --------------- | ------------------ |
| `原始值` | 16 bit 无符号数 | 按无符号十进制显示 |

### UI_TM_GROUP_RUNTIME_C_LO2_T_M_OUT

- 原始字段：`lo2_t_m_out`
- UI名称：本振2温度
- 显示类型：数值显示
- 截取位置：`word[15:0]`
- 数据宽度：`16 bit`

| 接收值   | UI显示          | 说明               |
| -------- | --------------- | ------------------ |
| `原始值` | 16 bit 无符号数 | 按无符号十进制显示 |

### UI_TM_GROUP_RUNTIME_C_LO2_C_M_OUT

- 原始字段：`lo2_c_m_out`
- UI名称：本振2状态参数
- 显示类型：数值显示
- 截取位置：`word[15:0]`
- 数据宽度：`16 bit`

| 接收值   | UI显示          | 说明               |
| -------- | --------------- | ------------------ |
| `原始值` | 16 bit 无符号数 | 按无符号十进制显示 |

### UI_TM_GROUP_RUNTIME_C_TEC2_T_M_OUT

- 原始字段：`tec2_t_m_out`
- UI名称：TEC2温度
- 显示类型：数值显示
- 截取位置：`word[15:0]`
- 数据宽度：`16 bit`

| 接收值   | UI显示          | 说明               |
| -------- | --------------- | ------------------ |
| `原始值` | 16 bit 无符号数 | 按无符号十进制显示 |

### UI_TM_GROUP_RUNTIME_C_TEC2_C_2V5_M_OUT

- 原始字段：`tec2_c_2v5_m_out`
- UI名称：TEC2状态参数
- 显示类型：数值显示
- 截取位置：`word[15:0]`
- 数据宽度：`16 bit`

| 接收值   | UI显示          | 说明               |
| -------- | --------------- | ------------------ |
| `原始值` | 16 bit 无符号数 | 按无符号十进制显示 |

### UI_TM_GROUP_CFG_C_TXM_ON

- 原始字段：`txm_on`
- UI名称：发射激光器开关
- 显示类型：枚举状态
- 截取位置：`word[1:0]`
- 数据宽度：`2 bit`

| 接收值 | UI显示  | 说明             |
| ------ | ------- | ---------------- |
| `0`    | 关闭    | TXM1/TXM2 均关闭 |
| `1`    | TXM1 开 | 打开 TXM1        |
| `2`    | TXM2 开 | 打开 TXM2        |
| `3`    | 异常    | 异常命令         |

### UI_TM_GROUP_CFG_C_LO_ON

- 原始字段：`lo_on`
- UI名称：本振激光器开关
- 显示类型：枚举状态
- 截取位置：`word[1:0]`
- 数据宽度：`2 bit`

| 接收值 | UI显示 | 说明           |
| ------ | ------ | -------------- |
| `0`    | 关闭   | LO1/LO2 均关闭 |
| `1`    | LO1 开 | 打开 LO1       |
| `2`    | LO2 开 | 打开 LO2       |
| `3`    | 异常   | 异常命令       |

### UI_TM_GROUP_CFG_C_WAVE_SET_ON

- 原始字段：`wave_set_on`
- UI名称：参数包/手动温度选择
- 显示类型：选择状态
- 截取位置：`word[0]`
- 数据宽度：`1 bit`

| 接收值 | UI显示   | 说明                    |
| ------ | -------- | ----------------------- |
| `0`    | 参数包   | 使用参数包/默认温度路径 |
| `1`    | 手动温度 | 使用手动温度设置值      |

### UI_TM_GROUP_CFG_C_TEC_ON1

- 原始字段：`tec_on1`
- UI名称：TEC1 开关
- 显示类型：使能状态
- 截取位置：`word[0]`
- 数据宽度：`1 bit`

| 接收值 | UI显示      | 说明              |
| ------ | ----------- | ----------------- |
| `0`    | 关闭/未使能 | TEC1 关闭或未使能 |
| `1`    | 开启/使能   | TEC1 开启或使能   |

### UI_TM_GROUP_CFG_C_TEC_ON2

- 原始字段：`tec_on2`
- UI名称：TEC2 开关
- 显示类型：使能状态
- 截取位置：`word[0]`
- 数据宽度：`1 bit`

| 接收值 | UI显示      | 说明              |
| ------ | ----------- | ----------------- |
| `0`    | 关闭/未使能 | TEC2 关闭或未使能 |
| `1`    | 开启/使能   | TEC2 开启或使能   |

### UI_TM_GROUP_CFG_C_MODU_MODE

- 原始字段：`modu_mode`
- UI名称：调制模式
- 显示类型：枚举状态
- 截取位置：`word[1:0]`
- 数据宽度：`2 bit`

| 接收值 | UI显示   | 说明             |
| ------ | -------- | ---------------- |
| `0`    | 模式OOK  | 调制模式编码OOK  |
| `1`    | 模式BPSK | 调制模式编码BPSK |
| `2`    | 模式QPSK | 调制模式编码QPSK |
| `3`    | 异常命令 | 异常命令         |

### UI_TM_GROUP_CFG_C_VOL_AUTO

- 原始字段：`vol_auto`
- UI名称：调制开始
- 显示类型：启动状态
- 截取位置：`word[0]`
- 数据宽度：`1 bit`

| 接收值 | UI显示      | 说明           |
| ------ | ----------- | -------------- |
| `0`    | 停止/不开始 | 调制开始位为 0 |
| `1`    | 开始        | 调制开始位为 1 |

### UI_TM_GROUP_CFG_C_DOPPLER_ON

- 原始字段：`doppler_on`
- UI名称：多普勒功能开关
- 显示类型：使能状态
- 截取位置：`word[0]`
- 数据宽度：`1 bit`

| 接收值 | UI显示      | 说明                   |
| ------ | ----------- | ---------------------- |
| `0`    | 关闭/未使能 | 多普勒功能关闭或未使能 |
| `1`    | 开启/使能   | 多普勒功能开启或使能   |

### UI_TM_GROUP_CFG_C_SAOMIAO_ON

- 原始字段：`saomiao_on`
- UI名称：扫描开关
- 显示类型：使能状态
- 截取位置：`word[0]`
- 数据宽度：`1 bit`

| 接收值 | UI显示      | 说明                 |
| ------ | ----------- | -------------------- |
| `0`    | 关闭/未使能 | 扫描功能关闭或未使能 |
| `1`    | 开启/使能   | 扫描功能开启或使能   |

### UI_TM_GROUP_CFG_C_GENZONG_ON

- 原始字段：`genzong_on`
- UI名称：跟踪开关
- 显示类型：使能状态
- 截取位置：`word[0]`
- 数据宽度：`1 bit`

| 接收值 | UI显示      | 说明                 |
| ------ | ----------- | -------------------- |
| `0`    | 关闭/未使能 | 跟踪功能关闭或未使能 |
| `1`    | 开启/使能   | 跟踪功能开启或使能   |

### UI_TM_GROUP_CFG_C_FLAG_MOD

- 原始字段：`flag_mod`
- UI名称：调制标志
- 显示类型：标志状态
- 截取位置：`word[0]`
- 数据宽度：`1 bit`

| 接收值 | UI显示 | 说明         |
| ------ | ------ | ------------ |
| `0`    | 未置位 | 调制标志为 0 |
| `1`    | 置位   | 调制标志为 1 |

### UI_TM_GROUP_CFG_C_FLAG_SZ

- 原始字段：`flag_sz`
- UI名称：SZ 标志输入
- 显示类型：标志状态
- 截取位置：`word[0]`
- 数据宽度：`1 bit`

| 接收值 | UI显示 | 说明            |
| ------ | ------ | --------------- |
| `0`    | 未置位 | SZ 标志输入为 0 |
| `1`    | 置位   | SZ 标志输入为 1 |

### UI_TM_GROUP_CFG_C_TXM1_SET

- 原始字段：`txm1_set`
- UI名称：发射激光器1温度手动设置值
- 显示类型：数值显示
- 截取位置：`word[15:0]`
- 数据宽度：`16 bit`

| 接收值   | UI显示          | 说明               |
| -------- | --------------- | ------------------ |
| `原始值` | 16 bit 无符号数 | 按无符号十进制显示 |

### UI_TM_GROUP_CFG_C_TXM2_SET

- 原始字段：`txm2_set`
- UI名称：发射激光器2温度手动设置值
- 显示类型：数值显示
- 截取位置：`word[15:0]`
- 数据宽度：`16 bit`

| 接收值   | UI显示          | 说明               |
| -------- | --------------- | ------------------ |
| `原始值` | 16 bit 无符号数 | 按无符号十进制显示 |

### UI_TM_GROUP_CFG_C_LO1_SET

- 原始字段：`lo1_set`
- UI名称：本振激光器1温度手动设置值
- 显示类型：数值显示
- 截取位置：`word[15:0]`
- 数据宽度：`16 bit`

| 接收值   | UI显示          | 说明               |
| -------- | --------------- | ------------------ |
| `原始值` | 16 bit 无符号数 | 按无符号十进制显示 |

### UI_TM_GROUP_CFG_C_LO2_SET

- 原始字段：`lo2_set`
- UI名称：本振激光器2温度手动设置值
- 显示类型：数值显示
- 截取位置：`word[15:0]`
- 数据宽度：`16 bit`

| 接收值   | UI显示          | 说明               |
| -------- | --------------- | ------------------ |
| `原始值` | 16 bit 无符号数 | 按无符号十进制显示 |

### UI_TM_GROUP_CFG_C_MODUL_DC1_SET

- 原始字段：`modul_dc1_set`
- UI名称：调制器 DC1 设置
- 显示类型：数值显示
- 截取位置：`word[15:0]`
- 数据宽度：`16 bit`

| 接收值   | UI显示          | 说明               |
| -------- | --------------- | ------------------ |
| `原始值` | 16 bit 无符号数 | 按无符号十进制显示 |

### UI_TM_GROUP_CFG_C_MODUL_DC2_SET

- 原始字段：`modul_dc2_set`
- UI名称：调制器 DC2 设置
- 显示类型：数值显示
- 截取位置：`word[15:0]`
- 数据宽度：`16 bit`

| 接收值   | UI显示          | 说明               |
| -------- | --------------- | ------------------ |
| `原始值` | 16 bit 无符号数 | 按无符号十进制显示 |

### UI_TM_GROUP_CFG_C_MODUL_DC3_SET

- 原始字段：`modul_dc3_set`
- UI名称：调制器 DC3 设置
- 显示类型：数值显示
- 截取位置：`word[15:0]`
- 数据宽度：`16 bit`

| 接收值   | UI显示          | 说明               |
| -------- | --------------- | ------------------ |
| `原始值` | 16 bit 无符号数 | 按无符号十进制显示 |

### UI_TM_GROUP_CFG_C_DOPPLER_PRE

- 原始字段：`doppler_pre`
- UI名称：预报多普勒值
- 显示类型：数值显示
- 截取位置：`word[15:0]`
- 数据宽度：`16 bit`

| 接收值   | UI显示          | 说明               |
| -------- | --------------- | ------------------ |
| `原始值` | 16 bit 无符号数 | 按无符号十进制显示 |

### UI_TM_GROUP_CFG_C_DAT_SZ

- 原始字段：`dat_sz`
- UI名称：SZ 数据输入
- 显示类型：数值显示
- 截取位置：`word[7:0]`
- 数据宽度：`8 bit`

| 接收值   | UI显示         | 说明               |
| -------- | -------------- | ------------------ |
| `原始值` | 8 bit 无符号数 | 按无符号十进制显示 |
