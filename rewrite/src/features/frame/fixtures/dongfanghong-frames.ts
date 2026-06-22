/**
 * 东方红上位机重写 - 遥控遥测帧定义（基于 docs/相关指令/遥控遥测20260609v2/）
 *
 * ============================================================================
 * 协议骨架（docs: 主机软件遥控遥测帧结构说明.md + 应用层协议头与消息语义说明.md）
 * ============================================================================
 *
 * RS422 固定帧（外层链路帧，遥控/遥测共用）：
 *   sync(4B, 0x1ACFFC1D) + length(4B, payload 字节数, 4 字节对齐)
 *   + payload(N x 4B word) + checksum(4B, 累加和回卷)
 *
 * 字节序：每个 32-bit word 高字节先发送（big-endian word），字节内 LSB-first。
 *
 * 应用层 header word0（payload 第 1 个 word）位域：
 *   [31:28] version    = 0x1
 *   [27:24] msg_type   = 0x1 遥控 / 0x2 遥测
 *   [23:20] module_id  = 4-bit 模块编号
 *   [19:12] group_id   = 8-bit 组编号
 *   [11:4]  param_count= 8-bit 参数/数据 word 数
 *   [3:0]   reserve    = 0x0
 *
 * Header 在本文件中建模为单个 uint32 字段（用 description 说明位域），不拆 6 个子字段。
 *
 * ============================================================================
 * 合并方案与 A/B/C 分类（遥控方向）
 * ============================================================================
 *
 * docs 中的每条 RC group（按 module_id + group_id 唯一）建模为一份独立 FrameAsset。
 * 按 payload word 数分为三类字段模板：
 *
 *   - A 类单参（payload = 1 word）：header + 1 个 uint32 参数字。
 *     word0 的语义在不同 group 间不同构：可能是 enum（rate_sel）、bit-mask（txm_on）、
 *     使能位（cal_loop_enable）、数值（txm1_set 的 16-bit 温度值，占 word[15:0]）。
 *     因此 A 类内部仍按 group 独立写字段表，复用的只是"header + 1 word"的骨架。
 *
 *   - B 类无参脉冲（payload = 0 word，param_count=0）：仅 header，无参数字。
 *     复位、清零类指令。payloadFields 为空，整帧只有 sync/length/header/checksum
 *     4 个骨架字段。UI 上由 send feature 的帧级"发送"按钮显式触发，不需要也不保留
 *     任何 payload 字段（旧版本曾用 radio 单选 "触发" 假装按钮，已被移除——
 *     详见 makePulseFrameAssetDescription）。
 *
 *   - C 类多参 MAP（payload = N word，N >= 2）：header + N 个 uint32 参数字。
 *     每条指令字段表独立，每 word 一个字段。当前 docs 里只有 comm_tx MAP（10 word）、
 *     comm_rx MAP（8 word）、comm_rx VALUE（3 word）、clock_manager MAP（2 word）四条。
 *
 * 实际意义：A/B/C 合并主要是"减少 FrameAsset 条数"和"统一 header/payload 骨架"，
 * 字段表本身每条 group 一份，不跨 group 共享字段定义。
 *
 * ============================================================================
 * 遥测方向（每个 module_id + group_id 一份独立字段表）
 * ============================================================================
 *
 * 每个 TM group 建模为一份独立 FrameAsset，物理解析共享同一份 RS422 帧壳，
 * 字段语义在每条 FrameAsset 的字段表里按 word 顺序展开。
 *
 * 注意 1：FrameAsset schema 没有 sub-bit 字段类型。当多个状态位共享同一 word
 * （例如 clk_mgmt runtime 的 clock_lock_status[2:0] 都在 word0）时，
 * 每个 bit 单独建模为一个 uint32 字段（length=4），description 标注
 * "word0 bit[X]"，由消费方按 bit 位置做掩码解析。
 *
 * 注意 2：comm_rx 的 TM_GROUP_COMM_RX_IQ_C（group_id 0x82）是 IQ 数据流，
 * 固定 12 word（I 路 6 word 192 bit + Q 路 6 word 192 bit）。
 *
 * 注意 3：应用层模块ID与遥测组说明.md 表里的 param_count 与 UI 字段定义里的
 * 实际字段数存在不一致（例如 comm_rx runtime 表里写 14 word，UI 字段定义列了
 * 22 word）。本文件采用 UI 字段定义的 word 数为准，因为它直接对应可解析的状态字；
 * 模块表里的 param_count 可能是较旧口径或聚合后的 word 数，需后续与 RTL 对齐。
 *
 * ============================================================================
 * 温度设置类（laser 的 TXM1/2_SET、LO1/2_SET）
 * ============================================================================
 *
 * docs UI 字段定义标注为 16 bit 无符号数，按无符号十进制显示，"负数不允许"。
 * 没有给出 factor / unit / 物理量程；因此本文件不写 factor 和 unit，
 * 只把 word0 建模成 uint32 字段并在 description 中标注"低 16 bit 有效"。
 *
 * ============================================================================
 * FrameAsset identifierRules
 * ============================================================================
 *
 * 每个 RC/TM FrameAsset 通过 header 的 module_id + group_id 唯一区分。
 * header 是 payload 第 1 个 word（fields[2]，物理字节偏移 8）。
 * 本文件使用 identifierRules 在 header 字段上做 mask 匹配：
 *   - module_id 位 [23:20]，mask = 0x00F00000
 *   - group_id  位 [19:12]，mask = 0x0000FF00
 * 两条 rule 用 logicOperator="and" 串联。
 *
 * FrameAsset schema 中 startIndex/endIndex 是字节偏移；header 占字节 [8..11]。
 *
 * ============================================================================
 * 字段模板复用情况
 * ============================================================================
 *
 * 共用的字段构造（在文件内部 helper 函数封装，不导出）：
 *   - makeSyncField()        RS422 sync word（不可配置，固定 0x1ACFFC1D）
 *   - makeLengthField()      payload length word（不可配置，运行时计算）
 *   - makeHeaderField()      应用层 header word（不可配置，按 group 写入值）
 *   - makeChecksumField()    checksum word（不可配置，运行时累加和回卷）
 *   - makeRcParamWord()      RC 参数 word（uint32，可配置，input/select/radio）
 *   - makeTmStatusWord()     TM 状态 word（uint32，只读，options 列位含义）
 *
 * 字段层面的"同构"仅限骨架（dataType=uint32, length=4），具体 options/描述每 group 独立。
 */

import type { FrameAsset, FrameFieldDefinition, IdentifierRule } from '../core';

// ---------------------------------------------------------------------------
// 物理层常量
// ---------------------------------------------------------------------------

const RS422_SYNC_VALUE = '0x1ACFFC1D';

const APP_HEADER_VERSION = 0x1;
const APP_MSG_TYPE_REMOTE_CMD = 0x1;
const APP_MSG_TYPE_TELEMETRY = 0x2;

function buildHeaderWord(moduleId: number, groupId: number, paramCount: number, msgType: number): string {
  const word =
    (APP_HEADER_VERSION << 28) |
    (msgType << 24) |
    ((moduleId & 0xf) << 20) |
    ((groupId & 0xff) << 12) |
    ((paramCount & 0xff) << 4);
  return `0x${word.toString(16).padStart(8, '0').toUpperCase()}`;
}

function rcHeader(moduleId: number, groupId: number, paramCount: number): string {
  return buildHeaderWord(moduleId, groupId, paramCount, APP_MSG_TYPE_REMOTE_CMD);
}

function tmHeader(moduleId: number, groupId: number, paramCount: number): string {
  return buildHeaderWord(moduleId, groupId, paramCount, APP_MSG_TYPE_TELEMETRY);
}

// ---------------------------------------------------------------------------
// 物理层字段（4 个 helper，所有 FrameAsset 共用骨架）
// ---------------------------------------------------------------------------

function makeSyncField(): FrameFieldDefinition {
  return {
    id: 'sync',
    name: 'RS422 帧头',
    dataType: 'uint32',
    length: 4,
    description: 'RS422 固定帧同步字 0x1ACFFC1D，高字节先发送',
    inputType: 'input',
    configurable: false,
    options: [],
    dataParticipationType: 'direct',
    defaultValue: RS422_SYNC_VALUE,
    bigEndian: true,
  };
}

function makeLengthField(wordCount: number): FrameFieldDefinition {
  const payloadBytes = (1 + wordCount) * 4;
  return {
    id: 'length',
    name: 'payload 字节数',
    dataType: 'uint32',
    length: 4,
    description: `应用层 payload 字节数 = (1 header + ${wordCount} data word) x 4 = ${payloadBytes}`,
    inputType: 'input',
    configurable: false,
    options: [],
    dataParticipationType: 'direct',
    defaultValue: `0x${payloadBytes.toString(16).padStart(8, '0').toUpperCase()}`,
    bigEndian: true,
  };
}

function makeHeaderField(defaultValue: string, moduleId: number, groupId: number): FrameFieldDefinition {
  return {
    id: 'header',
    name: '应用层 header word0',
    dataType: 'uint32',
    length: 4,
    description: `位域 [31:28]version=1 [27:24]msg_type [23:20]module_id=0x${moduleId.toString(16).toUpperCase()} [19:12]group_id=0x${groupId.toString(16).toUpperCase()} [11:4]param_count [3:0]reserve=0`,
    inputType: 'input',
    configurable: false,
    options: [],
    dataParticipationType: 'direct',
    defaultValue,
    bigEndian: true,
  };
}

function makeChecksumField(): FrameFieldDefinition {
  return {
    id: 'checksum',
    name: 'checksum',
    dataType: 'uint32',
    length: 4,
    description: 'frame_header + length + 所有 payload word 的 32-bit 累加和，溢出自然回卷',
    inputType: 'input',
    configurable: false,
    options: [],
    dataParticipationType: 'direct',
    defaultValue: '0x00000000',
    bigEndian: true,
  };
}

// ---------------------------------------------------------------------------
// 应用层字段 helper（RC 参数 word、TM 状态 word）
// ---------------------------------------------------------------------------

interface ParamOption {
  value: string;
  label: string;
  isDefault?: boolean;
}

function makeRcParamWord(
  id: string,
  name: string,
  description: string,
  opts: {
    defaultValue?: string;
    options?: ParamOption[];
    inputType?: 'input' | 'select' | 'radio';
  } = {},
): FrameFieldDefinition {
  const inputType = opts.inputType ?? (opts.options && opts.options.length > 0 ? 'select' : 'input');
  return {
    id,
    name,
    dataType: 'uint32',
    length: 4,
    description,
    inputType,
    configurable: true,
    options: opts.options ?? [],
    dataParticipationType: 'direct',
    defaultValue: opts.defaultValue ?? '0x00000000',
    bigEndian: true,
  };
}

function makeTmStatusWord(
  id: string,
  name: string,
  description: string,
  opts: { options?: ParamOption[] } = {},
): FrameFieldDefinition {
  return {
    id,
    name,
    dataType: 'uint32',
    length: 4,
    description,
    inputType: 'input',
    configurable: false,
    options: opts.options ?? [],
    dataParticipationType: 'direct',
    defaultValue: '0x00000000',
    bigEndian: true,
  };
}

// 64-bit 计数字段：合并原 high/low 两个 uint32 word 为单个 uint64 字段。
// length=8 占 2 word，paramCount 仍按协议层 word 数填写。
function makeTmStatusUint64Word(
  id: string,
  name: string,
  description: string,
): FrameFieldDefinition {
  return {
    id,
    name,
    dataType: 'uint64',
    length: 8,
    description,
    inputType: 'input',
    configurable: false,
    options: [],
    dataParticipationType: 'direct',
    defaultValue: '0x0000000000000000',
    bigEndian: true,
  };
}

// B 类无参脉冲帧的描述文本（不产生 payload 字段）。
// FrameAsset schema 没有 trigger inputType；物理上 B 类脉冲 payload = 0 word，
// payloadFields 留空即可。RTL 收到该 group 后产生脉冲，软件不应保持开关状态；
// UI 上由 send feature 的帧级"发送"按钮显式触发。
function makePulseFrameAssetDescription(action: string, rtlSignal: string): string {
  return `B 类无参脉冲（${action}）：payload 仅含 header，param_count=0。RTL 收到 ${rtlSignal} 后产生脉冲；在 send 页面右侧"发送"按钮显式触发，不保持任何开关状态。`;
}

// ---------------------------------------------------------------------------
// identifierRules helper：sync + header word0 精确匹配
// ---------------------------------------------------------------------------

function headerIdentifierRules(moduleId: number, groupId: number, paramCount: number, msgType: number): IdentifierRule[] {
  const headerWord = buildHeaderWord(moduleId, groupId, paramCount, msgType);
  return [
    { startIndex: 0, endIndex: 3, operator: 'eq', value: RS422_SYNC_VALUE, logicOperator: 'and' },
    { startIndex: 8, endIndex: 11, operator: 'eq', value: headerWord, logicOperator: 'and' },
  ];
}

// ---------------------------------------------------------------------------
// FrameAsset helper：RC group（A/B/C 三类共用一个 builder）
// ---------------------------------------------------------------------------

interface RcGroupSpec {
  id: string;
  name: string;
  moduleId: number;
  moduleIdLabel: string;
  groupId: number;
  paramCount: number;
  payloadFields: FrameFieldDefinition[];
  description?: string;
}

function buildRcFrameAsset(spec: RcGroupSpec): FrameAsset {
  // wordCount 用 spec.paramCount（协议层 word 数），不能用 payloadFields.length
  // 因为 uint64 字段 length=8 占 2 word，会让字段数与 word 数不一致
  const wordCount = spec.paramCount;
  const headerDefaultValue = rcHeader(spec.moduleId, spec.groupId, spec.paramCount);
  const fields: FrameFieldDefinition[] = [
    makeSyncField(),
    makeLengthField(wordCount),
    makeHeaderField(headerDefaultValue, spec.moduleId, spec.groupId),
    ...spec.payloadFields,
    makeChecksumField(),
  ];
  fields[fields.length - 1] = {
    ...fields[fields.length - 1],
    validOption: {
      isChecksum: true,
      startFieldIndex: 0,
      endFieldIndex: fields.length - 2,
      checksumMethod: 'sum32',
    },
  };
  return {
    id: spec.id,
    name: spec.name,
    direction: 'send',
    fields,
    description:
      spec.description ??
      `遥控 ${spec.moduleIdLabel} group_id=0x${spec.groupId.toString(16).toUpperCase()} param_count=${spec.paramCount} payload_word=${wordCount}`,
    frameType: 'dongfanghong-rc',
    protocol: 'rs422-fixed',
    // send 路径帧级总开关：autoChecksum 让 checksum.ts:143 实算校验位
    // （否则 frame.options 缺失 → patchOptions 取 undefined → 校验位恒 0）。
    // includeLengthField=false：length 字段 defaultValue 已是静态正确的 payload 字节数，
    // 开了反而会被 total-frame-length 语义覆盖（且 lengthFieldId 不在 FrameOptionsDefinition 里会留 warning）。
    // bigEndian=true：全部字段大端，与 fields[].bigEndian 一致。
    options: { autoChecksum: true, bigEndian: true, includeLengthField: false },
    identifierRules: headerIdentifierRules(spec.moduleId, spec.groupId, spec.paramCount, APP_MSG_TYPE_REMOTE_CMD),
  };
}

function buildTmFrameAsset(spec: {
  id: string;
  name: string;
  moduleId: number;
  moduleIdLabel: string;
  groupId: number;
  paramCount: number;
  payloadFields: FrameFieldDefinition[];
  description?: string;
}): FrameAsset {
  // wordCount 用 spec.paramCount（协议层 word 数），不能用 payloadFields.length
  // 因为 uint64 字段 length=8 占 2 word，会让字段数与 word 数不一致
  const wordCount = spec.paramCount;
  const headerDefaultValue = tmHeader(spec.moduleId, spec.groupId, spec.paramCount);
  const fields: FrameFieldDefinition[] = [
    makeSyncField(),
    makeLengthField(wordCount),
    makeHeaderField(headerDefaultValue, spec.moduleId, spec.groupId),
    ...spec.payloadFields,
    makeChecksumField(),
  ];
  fields[fields.length - 1] = {
    ...fields[fields.length - 1],
    validOption: {
      isChecksum: true,
      startFieldIndex: 0,
      endFieldIndex: fields.length - 2,
      checksumMethod: 'sum32',
    },
  };
  return {
    id: spec.id,
    name: spec.name,
    direction: 'receive',
    fields,
    description:
      spec.description ??
      `遥测 ${spec.moduleIdLabel} group_id=0x${spec.groupId.toString(16).toUpperCase()} param_count=${spec.paramCount} payload_word=${wordCount}`,
    frameType: 'dongfanghong-tm',
    protocol: 'rs422-fixed',
    // 遥测帧不设 options：send-service 只跑在 direction='send' 路径上，
    // applyBuildPostPatch 永不会被 TM 帧调用，autoChecksum/includeLengthField 无意义。
    // （TM 帧的 checksum 字段供解析侧展示用，不参与发送侧算校验。）
    identifierRules: headerIdentifierRules(spec.moduleId, spec.groupId, spec.paramCount, APP_MSG_TYPE_TELEMETRY),
  };
}

// ===========================================================================
// 遥控 FrameAsset（direction = 'send'）
// ===========================================================================

// --- clock_manager_block (module_id = 0x0) --------------------------------

const rcClkMgmtMap = buildRcFrameAsset({
  id: 'rc-clk-map',
  name: '时钟管理 - 时钟来源 MAP',
  moduleId: 0x0,
  moduleIdLabel: 'clock_manager_block',
  groupId: 0x10,
  paramCount: 2,
  payloadFields: [
    makeRcParamWord(
      'pps-src',
      'PPS 来源选择',
      'word0 bit[0]：0=内参考，1=外参考',
      {
        defaultValue: '0x00000000',
        options: [
          { value: '0x00000000', label: '内参考', isDefault: true },
          { value: '0x00000001', label: '外参考' },
        ],
      },
    ),
    makeRcParamWord(
      'ref-src',
      '参考时钟来源选择',
      'word0 bit[0]：0=内参考，1=外参考',
      {
        defaultValue: '0x00000000',
        options: [
          { value: '0x00000000', label: '内参考', isDefault: true },
          { value: '0x00000001', label: '外参考' },
        ],
      },
    ),
  ],
});

// --- adc_rx_block (module_id = 0x1) ---------------------------------------

const rcAdcMap = buildRcFrameAsset({
  id: 'rc-adc-map',
  name: 'ADC 接收 - 校准环路 MAP',
  moduleId: 0x1,
  moduleIdLabel: 'adc_rx_block',
  groupId: 0x10,
  paramCount: 1,
  payloadFields: [
    makeRcParamWord(
      'cal-loop',
      'ADC 校准环路使能配置',
      'word0 bit[0]：0=关闭，1=开启',
      {
        defaultValue: '0x00000000',
        options: [
          { value: '0x00000000', label: '关闭', isDefault: true },
          { value: '0x00000001', label: '开启' },
        ],
      },
    ),
  ],
});

const rcAdcPulseReset = buildRcFrameAsset({
  id: 'rc-adc-pulse-reset',
  name: 'ADC 接收 - 复位脉冲',
  moduleId: 0x1,
  moduleIdLabel: 'adc_rx_block',
  groupId: 0x12,
  paramCount: 0,
  payloadFields: [],
  description: makePulseFrameAssetDescription('ADC 复位', 'ADC_RX_PARAM_RESET_C'),
});

// --- gt_tx_block (module_id = 0x2) ----------------------------------------

const rcGtPulseReset = buildRcFrameAsset({
  id: 'rc-gt-pulse-reset',
  name: 'GT 发送 - 复位脉冲',
  moduleId: 0x2,
  moduleIdLabel: 'gt_tx_block',
  groupId: 0x12,
  paramCount: 0,
  payloadFields: [],
  description: makePulseFrameAssetDescription('GT 复位', 'GT_TX_PARAM_RESET_C'),
});

// --- cxp_yewu_block (module_id = 0x3) -------------------------------------

const rcCxpPulseReset = buildRcFrameAsset({
  id: 'rc-cxp-pulse-reset',
  name: 'CXP 业务 - 业务复位脉冲',
  moduleId: 0x3,
  moduleIdLabel: 'cxp_yewu_block',
  groupId: 0x12,
  paramCount: 0,
  payloadFields: [],
  description: makePulseFrameAssetDescription('业务复位', 'CXP_PARAM_RESET_C'),
});

// --- laser_ctrl_block (module_id = 0x4) -----------------------------------
// 全部为 A 类单参（payload = 1 word）

const rcLaserTxmOn = buildRcFrameAsset({
  id: 'rc-laser-txm-on',
  name: '激光器 - 发射激光器开关',
  moduleId: 0x4,
  moduleIdLabel: 'laser_ctrl_block',
  groupId: 0x10,
  paramCount: 1,
  payloadFields: [
    makeRcParamWord(
      'txm-on',
      '发射激光器开关',
      'word0 bit[1:0]：00=均关闭，01=TXM1 开，10=TXM2 开，11=异常',
      {
        defaultValue: '0x00000000',
        options: [
          { value: '0x00000000', label: '关闭', isDefault: true },
          { value: '0x00000001', label: 'TXM1 开' },
          { value: '0x00000002', label: 'TXM2 开' },
        ],
      },
    ),
  ],
});

const rcLaserLoOn = buildRcFrameAsset({
  id: 'rc-laser-lo-on',
  name: '激光器 - 本振激光器开关',
  moduleId: 0x4,
  moduleIdLabel: 'laser_ctrl_block',
  groupId: 0x11,
  paramCount: 1,
  payloadFields: [
    makeRcParamWord(
      'lo-on',
      '本振激光器开关',
      'word0 bit[1:0]：00=均关闭，01=LO1 开，10=LO2 开，11=异常',
      {
        defaultValue: '0x00000000',
        options: [
          { value: '0x00000000', label: '关闭', isDefault: true },
          { value: '0x00000001', label: 'LO1 开' },
          { value: '0x00000002', label: 'LO2 开' },
        ],
      },
    ),
  ],
});

const rcLaserWaveSetOn = buildRcFrameAsset({
  id: 'rc-laser-wave-set-on',
  name: '激光器 - 参数包/手动温度选择',
  moduleId: 0x4,
  moduleIdLabel: 'laser_ctrl_block',
  groupId: 0x12,
  paramCount: 1,
  payloadFields: [
    makeRcParamWord(
      'wave-set-on',
      '参数包/手动温度选择',
      'word0 bit[0]：0=使用参数包/默认温度路径，1=使用手动温度设置值',
      {
        defaultValue: '0x00000000',
        options: [
          { value: '0x00000000', label: '参数包', isDefault: true },
          { value: '0x00000001', label: '手动温度' },
        ],
      },
    ),
  ],
});

const rcLaserTecOn1 = buildRcFrameAsset({
  id: 'rc-laser-tec-on1',
  name: '激光器 - TEC1 开关',
  moduleId: 0x4,
  moduleIdLabel: 'laser_ctrl_block',
  groupId: 0x13,
  paramCount: 1,
  payloadFields: [
    makeRcParamWord(
      'tec-on1',
      'TEC1 开关',
      'word0 bit[0]：0=关闭/禁用，1=开启/使能',
      {
        defaultValue: '0x00000000',
        options: [
          { value: '0x00000000', label: '关闭/禁用', isDefault: true },
          { value: '0x00000001', label: '开启/使能' },
        ],
      },
    ),
  ],
});

const rcLaserTecOn2 = buildRcFrameAsset({
  id: 'rc-laser-tec-on2',
  name: '激光器 - TEC2 开关',
  moduleId: 0x4,
  moduleIdLabel: 'laser_ctrl_block',
  groupId: 0x14,
  paramCount: 1,
  payloadFields: [
    makeRcParamWord(
      'tec-on2',
      'TEC2 开关',
      'word0 bit[0]：0=关闭/禁用，1=开启/使能',
      {
        defaultValue: '0x00000000',
        options: [
          { value: '0x00000000', label: '关闭/禁用', isDefault: true },
          { value: '0x00000001', label: '开启/使能' },
        ],
      },
    ),
  ],
});

const rcLaserModuMode = buildRcFrameAsset({
  id: 'rc-laser-modu-mode',
  name: '激光器 - 调制模式',
  moduleId: 0x4,
  moduleIdLabel: 'laser_ctrl_block',
  groupId: 0x15,
  paramCount: 1,
  payloadFields: [
    makeRcParamWord(
      'modu-mode',
      '调制模式',
      'word0 bit[1:0]：0=OOK，1=BPSK，2=QPSK，3=异常命令',
      {
        defaultValue: '0x00000000',
        options: [
          { value: '0x00000000', label: 'OOK', isDefault: true },
          { value: '0x00000001', label: 'BPSK' },
          { value: '0x00000002', label: 'QPSK' },
        ],
      },
    ),
  ],
});

const rcLaserVolAuto = buildRcFrameAsset({
  id: 'rc-laser-vol-auto',
  name: '激光器 - 调制开始',
  moduleId: 0x4,
  moduleIdLabel: 'laser_ctrl_block',
  groupId: 0x16,
  paramCount: 1,
  payloadFields: [
    makeRcParamWord(
      'vol-auto',
      '调制开始',
      'word0 bit[0]：0=停止/不开始，1=开始',
      {
        defaultValue: '0x00000000',
        options: [
          { value: '0x00000000', label: '停止/不开始', isDefault: true },
          { value: '0x00000001', label: '开始' },
        ],
      },
    ),
  ],
});

const rcLaserTxm1Set = buildRcFrameAsset({
  id: 'rc-laser-txm1-set',
  name: '激光器 - 发射激光器1温度手动设置值',
  moduleId: 0x4,
  moduleIdLabel: 'laser_ctrl_block',
  groupId: 0x20,
  paramCount: 1,
  payloadFields: [
    makeRcParamWord(
      'txm1-set',
      '发射激光器1温度手动设置值',
      'word0 bit[15:0] 有效，按无符号十进制填写，负数不允许。docs 未提供 factor/unit，按裸值下发',
      { defaultValue: '0x00008000' },
    ),
  ],
});

const rcLaserTxm2Set = buildRcFrameAsset({
  id: 'rc-laser-txm2-set',
  name: '激光器 - 发射激光器2温度手动设置值',
  moduleId: 0x4,
  moduleIdLabel: 'laser_ctrl_block',
  groupId: 0x21,
  paramCount: 1,
  payloadFields: [
    makeRcParamWord(
      'txm2-set',
      '发射激光器2温度手动设置值',
      'word0 bit[15:0] 有效，按无符号十进制填写，负数不允许',
      { defaultValue: '0x00008000' },
    ),
  ],
});

const rcLaserLo1Set = buildRcFrameAsset({
  id: 'rc-laser-lo1-set',
  name: '激光器 - 本振激光器1温度手动设置值',
  moduleId: 0x4,
  moduleIdLabel: 'laser_ctrl_block',
  groupId: 0x22,
  paramCount: 1,
  payloadFields: [
    makeRcParamWord(
      'lo1-set',
      '本振激光器1温度手动设置值',
      'word0 bit[15:0] 有效，按无符号十进制填写，负数不允许',
      { defaultValue: '0x00008000' },
    ),
  ],
});

const rcLaserLo2Set = buildRcFrameAsset({
  id: 'rc-laser-lo2-set',
  name: '激光器 - 本振激光器2温度手动设置值',
  moduleId: 0x4,
  moduleIdLabel: 'laser_ctrl_block',
  groupId: 0x23,
  paramCount: 1,
  payloadFields: [
    makeRcParamWord(
      'lo2-set',
      '本振激光器2温度手动设置值',
      'word0 bit[15:0] 有效，按无符号十进制填写，负数不允许',
      { defaultValue: '0x00008000' },
    ),
  ],
});

// --- biz_rx (module_id = 0x5) ---------------------------------------------

const rcBizRxMap = buildRcFrameAsset({
  id: 'rc-biz-rx-map',
  name: '业务接收 - 使能配置 MAP',
  moduleId: 0x5,
  moduleIdLabel: 'yewu_rece_from_cxp_block',
  groupId: 0x10,
  paramCount: 1,
  payloadFields: [
    makeRcParamWord(
      'enable',
      '业务接收使能配置',
      'word0 bit[0]：0=关闭/禁用，1=开启/使能',
      {
        defaultValue: '0x00000000',
        options: [
          { value: '0x00000000', label: '关闭/禁用', isDefault: true },
          { value: '0x00000001', label: '开启/使能' },
        ],
      },
    ),
  ],
});

const rcBizRxPulseClear = buildRcFrameAsset({
  id: 'rc-biz-rx-pulse-clear',
  name: '业务接收 - 计数复位脉冲',
  moduleId: 0x5,
  moduleIdLabel: 'yewu_rece_from_cxp_block',
  groupId: 0x12,
  paramCount: 0,
  payloadFields: [],
  description: makePulseFrameAssetDescription('计数复位', 'BIZ_RX_PARAM_COUNT_CLEAR_C'),
});

const rcBizRxPulseReset = buildRcFrameAsset({
  id: 'rc-biz-rx-pulse-reset',
  name: '业务接收 - 业务接收复位脉冲',
  moduleId: 0x5,
  moduleIdLabel: 'yewu_rece_from_cxp_block',
  groupId: 0x13,
  paramCount: 0,
  payloadFields: [],
  description: makePulseFrameAssetDescription('业务接收复位', 'BIZ_RX_PARAM_RESET_C'),
});

// --- biz_tx (module_id = 0x6) ---------------------------------------------

const rcBizTxMap = buildRcFrameAsset({
  id: 'rc-biz-tx-map',
  name: '业务发送 - 使能配置 MAP',
  moduleId: 0x6,
  moduleIdLabel: 'yewu_send_to_cxp_block',
  groupId: 0x10,
  paramCount: 1,
  payloadFields: [
    makeRcParamWord(
      'enable',
      '业务发送使能配置',
      'word0 bit[0]：0=关闭/禁用，1=开启/使能',
      {
        defaultValue: '0x00000000',
        options: [
          { value: '0x00000000', label: '关闭/禁用', isDefault: true },
          { value: '0x00000001', label: '开启/使能' },
        ],
      },
    ),
  ],
});

const rcBizTxPulseClear = buildRcFrameAsset({
  id: 'rc-biz-tx-pulse-clear',
  name: '业务发送 - 计数复位脉冲',
  moduleId: 0x6,
  moduleIdLabel: 'yewu_send_to_cxp_block',
  groupId: 0x12,
  paramCount: 0,
  payloadFields: [],
  description: makePulseFrameAssetDescription('计数复位', 'BIZ_TX_PARAM_COUNT_CLEAR_C'),
});

const rcBizTxPulseReset = buildRcFrameAsset({
  id: 'rc-biz-tx-pulse-reset',
  name: '业务发送 - 业务发送复位脉冲',
  moduleId: 0x6,
  moduleIdLabel: 'yewu_send_to_cxp_block',
  groupId: 0x13,
  paramCount: 0,
  payloadFields: [],
  description: makePulseFrameAssetDescription('业务发送复位', 'BIZ_TX_PARAM_RESET_C'),
});

// --- comm_tx (module_id = 0x7) --------------------------------------------
// C 类多参 MAP（10 word）

const rcCommTxMap = buildRcFrameAsset({
  id: 'rc-comm-tx-map',
  name: '通信发送 - 发送链路配置 MAP',
  moduleId: 0x7,
  moduleIdLabel: 'comm_tx_block',
  groupId: 0x10,
  paramCount: 10,
  payloadFields: [
    makeRcParamWord(
      'rate',
      '发送速率选择',
      'word0 bit[7:0]：00=312M, 01=625M, 02=1.25G, 03=2.5G（默认）, 04=5G, 80=OOK 20M, A0=OOK 10M, C0=OOK 1M',
      {
        defaultValue: '0x00000003',
        options: [
          { value: '0x00000000', label: '312M' },
          { value: '0x00000001', label: '625M' },
          { value: '0x00000002', label: '1.25G' },
          { value: '0x00000003', label: '2.5G', isDefault: true },
          { value: '0x00000004', label: '5G' },
          { value: '0x00000080', label: 'OOK 20M' },
          { value: '0x000000A0', label: 'OOK 10M' },
          { value: '0x000000C0', label: 'OOK 1M' },
        ],
      },
    ),
    makeRcParamWord(
      'scramble',
      '扰码使能',
      'word0 bit[0]：0=关闭/禁用，1=开启/使能',
      {
        defaultValue: '0x00000001',
        options: [
          { value: '0x00000000', label: '关闭/禁用' },
          { value: '0x00000001', label: '开启/使能', isDefault: true },
        ],
      },
    ),
    makeRcParamWord(
      'encode',
      '编码类型选择',
      'word0 bit[0]：0=RS（默认），1=LDPC（需确认 LDPC DCP/source 绑定和 LDPC_ENCODE_EN 后实际生效）',
      {
        defaultValue: '0x00000000',
        options: [
          { value: '0x00000000', label: 'RS', isDefault: true },
          { value: '0x00000001', label: 'LDPC' },
        ],
      },
    ),
    makeRcParamWord(
      'ber-inject',
      '误码注入模式',
      'word0 bit[3:0]：0=不注入（默认），1=轻量误码，2=重度误码，3=随机误码，4~15=保留',
      {
        defaultValue: '0x00000000',
        options: [
          { value: '0x00000000', label: '不注入', isDefault: true },
          { value: '0x00000001', label: '轻量误码' },
          { value: '0x00000002', label: '重度误码' },
          { value: '0x00000003', label: '随机误码' },
        ],
      },
    ),
    makeRcParamWord(
      'crc-error',
      'CRC 故障注入控制',
      'word0 bit[3:0]：0=不注入（默认），1=注入编码值（具体错误模式 RTL 未定义）',
      {
        defaultValue: '0x00000000',
        options: [
          { value: '0x00000000', label: '不注入', isDefault: true },
          { value: '0x00000001', label: '注入编码值' },
        ],
      },
    ),
    makeRcParamWord(
      'header-error',
      '帧头故障注入控制',
      'word0 bit[3:0]：0=不注入（默认），1=注入编码值（具体错误模式 RTL 未定义）',
      {
        defaultValue: '0x00000000',
        options: [
          { value: '0x00000000', label: '不注入', isDefault: true },
          { value: '0x00000001', label: '注入编码值' },
        ],
      },
    ),
    makeRcParamWord(
      'data-type-error',
      '数据类型故障注入控制',
      'word0 bit[3:0]：0=不注入（默认），1=注入编码值（具体错误模式 RTL 未定义）',
      {
        defaultValue: '0x00000000',
        options: [
          { value: '0x00000000', label: '不注入', isDefault: true },
          { value: '0x00000001', label: '注入编码值' },
        ],
      },
    ),
    makeRcParamWord(
      'field-pos-error',
      '字段位置故障注入控制',
      'word0 bit[3:0]：0=不注入（默认），1=注入编码值（具体错误模式 RTL 未定义）',
      {
        defaultValue: '0x00000000',
        options: [
          { value: '0x00000000', label: '不注入', isDefault: true },
          { value: '0x00000001', label: '注入编码值' },
        ],
      },
    ),
    makeRcParamWord(
      'encode-error',
      '编码故障注入控制',
      'word0 bit[3:0]：0=不注入（默认），1=注入编码值（具体错误模式 RTL 未定义）',
      {
        defaultValue: '0x00000000',
        options: [
          { value: '0x00000000', label: '不注入', isDefault: true },
          { value: '0x00000001', label: '注入编码值' },
        ],
      },
    ),
    makeRcParamWord(
      'data-link-break',
      '数据断链异常注入控制',
      'word0 bit[0]：0=正常（默认），1=注入断链',
      {
        defaultValue: '0x00000000',
        options: [
          { value: '0x00000000', label: '正常', isDefault: true },
          { value: '0x00000001', label: '注入断链' },
        ],
      },
    ),
  ],
});

const rcCommTxPulseReset = buildRcFrameAsset({
  id: 'rc-comm-tx-pulse-reset',
  name: '通信发送 - 发送复位脉冲',
  moduleId: 0x7,
  moduleIdLabel: 'comm_tx_block',
  groupId: 0x12,
  paramCount: 0,
  payloadFields: [],
  description: makePulseFrameAssetDescription('发送复位', 'COMM_TX_PARAM_RESET_C'),
});

const rcCommTxPulseClear = buildRcFrameAsset({
  id: 'rc-comm-tx-pulse-clear',
  name: '通信发送 - 计数复位脉冲',
  moduleId: 0x7,
  moduleIdLabel: 'comm_tx_block',
  groupId: 0x13,
  paramCount: 0,
  payloadFields: [],
  description: makePulseFrameAssetDescription('计数复位', 'COMM_TX_PARAM_COUNT_CLEAR_C'),
});

// --- comm_rx (module_id = 0x8) --------------------------------------------
// C 类多参 MAP（8 word） + VALUE（3 word）

const rcCommRxMap = buildRcFrameAsset({
  id: 'rc-comm-rx-map',
  name: '通信接收 - 接收链路配置 MAP',
  moduleId: 0x8,
  moduleIdLabel: 'comm_rx_block',
  groupId: 0x10,
  paramCount: 8,
  payloadFields: [
    makeRcParamWord(
      'rate',
      '接收链路速率选择',
      'word0 bit[7:0]：00=312M, 01=625M, 02=1.25G, 03=2.5G（默认）, 04=5G, 80=OOK 20M, A0=OOK 10M, C0=OOK 1M（1M 当前 RTL 未实现）',
      {
        defaultValue: '0x00000003',
        options: [
          { value: '0x00000000', label: '312M' },
          { value: '0x00000001', label: '625M' },
          { value: '0x00000002', label: '1.25G' },
          { value: '0x00000003', label: '2.5G', isDefault: true },
          { value: '0x00000004', label: '5G' },
          { value: '0x00000080', label: 'OOK 20M' },
          { value: '0x000000A0', label: 'OOK 10M' },
          { value: '0x000000C0', label: 'OOK 1M' },
        ],
      },
    ),
    makeRcParamWord(
      'decode',
      '解码选择',
      'word0 bit[0]：0=RS（默认），1=LDPC（需确认 LDPC DCP/source 绑定和 LDPC_DeCode_EN 后实际生效）',
      {
        defaultValue: '0x00000000',
        options: [
          { value: '0x00000000', label: 'RS', isDefault: true },
          { value: '0x00000001', label: 'LDPC' },
        ],
      },
    ),
    makeRcParamWord(
      'descramble',
      '接收解扰使能',
      'word0 bit[0]：0=关闭，1=开启（默认）',
      {
        defaultValue: '0x00000001',
        options: [
          { value: '0x00000000', label: '关闭' },
          { value: '0x00000001', label: '开启', isDefault: true },
        ],
      },
    ),
    makeRcParamWord(
      'filter',
      '载波滤波使能',
      'word0 bit[0]：0=关闭，1=开启（默认）',
      {
        defaultValue: '0x00000001',
        options: [
          { value: '0x00000000', label: '关闭' },
          { value: '0x00000001', label: '开启', isDefault: true },
        ],
      },
    ),
    makeRcParamWord(
      'loop-bw',
      '定时环路带宽选择',
      'word0 bit[2:0]：0~7 带宽编码（默认 3，具体带宽值 RTL 未定义）',
      {
        defaultValue: '0x00000003',
        options: [
          { value: '0x00000000', label: '带宽编码 0' },
          { value: '0x00000001', label: '带宽编码 1' },
          { value: '0x00000002', label: '带宽编码 2' },
          { value: '0x00000003', label: '带宽编码 3', isDefault: true },
          { value: '0x00000004', label: '带宽编码 4' },
          { value: '0x00000005', label: '带宽编码 5' },
          { value: '0x00000006', label: '带宽编码 6' },
          { value: '0x00000007', label: '带宽编码 7' },
        ],
      },
    ),
    makeRcParamWord(
      'timing-filter',
      '定时滤波使能',
      'word0 bit[0]：0=关闭（默认），1=开启',
      {
        defaultValue: '0x00000000',
        options: [
          { value: '0x00000000', label: '关闭', isDefault: true },
          { value: '0x00000001', label: '开启' },
        ],
      },
    ),
    makeRcParamWord(
      'auto-reset',
      '自动复位使能',
      'word0 bit[0]：0=关闭，1=开启（默认）',
      {
        defaultValue: '0x00000001',
        options: [
          { value: '0x00000000', label: '关闭' },
          { value: '0x00000001', label: '开启', isDefault: true },
        ],
      },
    ),
    makeRcParamWord(
      'loop-enable',
      '接收链路环回使能',
      'word0 bit[0]：0=关闭（默认），1=开启',
      {
        defaultValue: '0x00000000',
        options: [
          { value: '0x00000000', label: '关闭', isDefault: true },
          { value: '0x00000001', label: '开启' },
        ],
      },
    ),
  ],
});

const rcCommRxValue = buildRcFrameAsset({
  id: 'rc-comm-rx-value',
  name: '通信接收 - 阈值配置 VALUE',
  moduleId: 0x8,
  moduleIdLabel: 'comm_rx_block',
  groupId: 0x11,
  paramCount: 3,
  payloadFields: [
    makeRcParamWord(
      'sync-corr-peak-th',
      '帧同步相关峰阈值',
      'word0 bit[6:0]：7 bit 无符号数，默认 0x20',
      { defaultValue: '0x00000020' },
    ),
    makeRcParamWord(
      'lock-th',
      '帧锁定门限值',
      'word0 bit[15:0]：16 bit 无符号数，默认 0x0020',
      { defaultValue: '0x00000020' },
    ),
    makeRcParamWord(
      'unlock-th',
      '帧失锁门限值',
      'word0 bit[15:0]：16 bit 无符号数，默认 0x0004',
      { defaultValue: '0x00000004' },
    ),
  ],
});

const rcCommRxPulseRangeRst = buildRcFrameAsset({
  id: 'rc-comm-rx-pulse-range-rst',
  name: '通信接收 - 测距复位脉冲',
  moduleId: 0x8,
  moduleIdLabel: 'comm_rx_block',
  groupId: 0x12,
  paramCount: 0,
  payloadFields: [],
  description: makePulseFrameAssetDescription('测距复位', 'COMM_RX_PARAM_RANGE_RESET_C'),
});

const rcCommRxPulseCountClr = buildRcFrameAsset({
  id: 'rc-comm-rx-pulse-count-clr',
  name: '通信接收 - 计数复位脉冲',
  moduleId: 0x8,
  moduleIdLabel: 'comm_rx_block',
  groupId: 0x13,
  paramCount: 0,
  payloadFields: [],
  description: makePulseFrameAssetDescription('计数复位', 'COMM_RX_PARAM_COUNT_CLEAR_C'),
});

const rcCommRxPulseManualRst = buildRcFrameAsset({
  id: 'rc-comm-rx-pulse-manual-rst',
  name: '通信接收 - 全体复位脉冲',
  moduleId: 0x8,
  moduleIdLabel: 'comm_rx_block',
  groupId: 0x14,
  paramCount: 0,
  payloadFields: [],
  description: makePulseFrameAssetDescription('全体复位', 'COMM_RX_PARAM_MANUAL_RESET_C'),
});

// ===========================================================================
// 遥测 FrameAsset（direction = 'receive'）
// ===========================================================================
// 每个 TM group 一份独立 FrameAsset，字段按 word 顺序展开。
// 多 bit 共享同一 word 时，每个 bit 单独建一个 uint32 字段，description 标注
// "wordN bit[X]"，由消费方按 bit 位置做掩码解析（FrameAsset schema 无 sub-bit 字段）。

function tmStatusField(id: string, name: string, bitDesc: string, options?: ParamOption[]): FrameFieldDefinition {
  return makeTmStatusWord(id, name, bitDesc, options ? { options } : {});
}

// --- clk_mgmt (module_id = 0x0) -------------------------------------------
// runtime: clock_lock_status[2:0] 共享 word0（3 个 bit-status）
// 注：UI 字段定义里 clk_mgmt runtime 不占独立 word，3 个 bit 都在 word0；
// 但应用层模块ID与遥测组说明.md 说 clk_mgmt cfg param_count=2，runtime 未列出。
// 为保证 header param_count 不为 0（RS422 帧要求 payload_length != 0），
// 这里 runtime 设 param_count=1，字段保留 word0 一个 uint32 + 3 个 bit 描述。
// （bit 描述与 word0 字段并存；消费方按 bit 解析。）

const tmClkMgmtRuntime = buildTmFrameAsset({
  id: 'tm-clk-runtime',
  name: '时钟管理 - 运行态锁定状态',
  moduleId: 0x0,
  moduleIdLabel: 'clock_manager_block',
  groupId: 0x80,
  paramCount: 1,
  payloadFields: [
    tmStatusField(
      'clock-lock-status-word0',
      'clock_lock_status word0',
      'word0：bit[2]=lmk100M锁定，bit[1]=adc数据时钟锁定，bit[0]=adc核时钟锁定',
    ),
    tmStatusField('clock-lock-status-2', 'lmk100M 锁定', 'word0 bit[2]：0=未锁定，1=锁定', [
      { value: '0', label: '未锁定' },
      { value: '1', label: '锁定' },
    ]),
    tmStatusField('clock-lock-status-1', 'adc 数据时钟锁定', 'word0 bit[1]：0=未锁定，1=锁定', [
      { value: '0', label: '未锁定' },
      { value: '1', label: '锁定' },
    ]),
    tmStatusField('clock-lock-status-0', 'adc 核时钟锁定', 'word0 bit[0]：0=未锁定，1=锁定', [
      { value: '0', label: '未锁定' },
      { value: '1', label: '锁定' },
    ]),
  ],
});

const tmClkMgmtCfg = buildTmFrameAsset({
  id: 'tm-clk-cfg',
  name: '时钟管理 - 配置回读',
  moduleId: 0x0,
  moduleIdLabel: 'clock_manager_block',
  groupId: 0x81,
  paramCount: 2,
  payloadFields: [
    tmStatusField('pps-source-sel', 'PPS 来源选择', 'word0 bit[0]：0=内参考，1=外参考', [
      { value: '0', label: '内参考' },
      { value: '1', label: '外参考' },
    ]),
    tmStatusField('ref-source-sel', '参考时钟来源选择', 'word1 bit[0]：0=内参考，1=外参考', [
      { value: '0', label: '内参考' },
      { value: '1', label: '外参考' },
    ]),
  ],
});

// --- adc_rx (module_id = 0x1) ---------------------------------------------

const tmAdcRuntime = buildTmFrameAsset({
  id: 'tm-adc-runtime',
  name: 'ADC 接收 - 运行态',
  moduleId: 0x1,
  moduleIdLabel: 'adc_rx_block',
  groupId: 0x80,
  paramCount: 7,
  payloadFields: [
    tmStatusField('reset-status', 'ADC 复位状态', 'word0 bit[0]：0=空闲，1=复位中/已接受', [
      { value: '0', label: '空闲' },
      { value: '1', label: '复位中/已接受' },
    ]),
    tmStatusField('power-good-status', '时钟/电源正常状态', 'word1 bit[0]：0=异常，1=正常', [
      { value: '0', label: '异常' },
      { value: '1', label: '正常' },
    ]),
    tmStatusField('lmx-locked-status', 'LMX 锁定状态', 'word2 bit[0]：0=未锁定，1=锁定', [
      { value: '0', label: '未锁定' },
      { value: '1', label: '锁定' },
    ]),
    tmStatusField('lmk-locked-status', 'LMK 锁定状态', 'word3 bit[0]：0=未锁定，1=锁定', [
      { value: '0', label: '未锁定' },
      { value: '1', label: '锁定' },
    ]),
    tmStatusField('data-valid-status', '数据有效状态', 'word4 bit[0]：0=无效，1=有效', [
      { value: '0', label: '无效' },
      { value: '1', label: '有效' },
    ]),
    tmStatusField(
      'board-status-word5',
      'board_status word5',
      'word5：bit[4]=LMX1, bit[3]=LMK12, bit[2]=SPI完成, bit[1]=采样有效, bit[0]=ADC上电',
    ),
    tmStatusField('rx-power-value', '接收功率测量值', 'word6 bit[31:0]：32 bit 无符号数'),
  ],
});

const tmAdcCfg = buildTmFrameAsset({
  id: 'tm-adc-cfg',
  name: 'ADC 接收 - 配置回读',
  moduleId: 0x1,
  moduleIdLabel: 'adc_rx_block',
  groupId: 0x81,
  paramCount: 1,
  payloadFields: [
    tmStatusField('cal-loop-enable', 'ADC 校准环路使能配置', 'word0 bit[0]：0=未使能，1=使能', [
      { value: '0', label: '未使能' },
      { value: '1', label: '使能' },
    ]),
  ],
});

// --- gt_tx (module_id = 0x2) ----------------------------------------------

const tmGtRuntime = buildTmFrameAsset({
  id: 'tm-gt-runtime',
  name: 'GT 发送 - 运行态',
  moduleId: 0x2,
  moduleIdLabel: 'gt_tx_block',
  groupId: 0x80,
  paramCount: 2,
  payloadFields: [
    tmStatusField('reset-status', 'GT 复位状态', 'word0 bit[0]：0=空闲，1=复位中/已接受', [
      { value: '0', label: '空闲' },
      { value: '1', label: '复位中/已接受' },
    ]),
    tmStatusField('power-good-status', 'GT 电源/时钟正常状态', 'word1 bit[0]：0=异常，1=正常', [
      { value: '0', label: '异常' },
      { value: '1', label: '正常' },
    ]),
  ],
});

// --- cxp_yewu (module_id = 0x3) -------------------------------------------

const tmCxpRuntime = buildTmFrameAsset({
  id: 'tm-cxp-runtime',
  name: 'CXP 业务 - 运行态',
  moduleId: 0x3,
  moduleIdLabel: 'cxp_yewu_block',
  groupId: 0x80,
  paramCount: 2,
  payloadFields: [
    tmStatusField('reset-status', 'CXP 复位状态', 'word0 bit[0]：0=空闲，1=复位中/已接受', [
      { value: '0', label: '空闲' },
      { value: '1', label: '复位中/已接受' },
    ]),
    tmStatusField('handshake-status', 'CXP 握手状态', 'word1 bit[0]：0=未握手，1=握手有效', [
      { value: '0', label: '未握手' },
      { value: '1', label: '握手有效' },
    ]),
  ],
});

// --- laser_ctrl (module_id = 0x4) ----------------------------------------

const tmLaserRuntime = buildTmFrameAsset({
  id: 'tm-laser-runtime',
  name: '激光器控制 - 运行态',
  moduleId: 0x4,
  moduleIdLabel: 'laser_ctrl_block',
  groupId: 0x80,
  paramCount: 14,
  payloadFields: [
    tmStatusField('txm1-t-m-out', '发射1温度', 'word0 bit[15:0]：16 bit 无符号数'),
    tmStatusField('txm1-c-m-out', '发射1状态参数', 'word1 bit[15:0]：16 bit 无符号数'),
    tmStatusField('lo1-t-m-out', '本振1温度', 'word2 bit[15:0]：16 bit 无符号数'),
    tmStatusField('lo1-c-m-out', '本振1状态参数', 'word3 bit[15:0]：16 bit 无符号数'),
    tmStatusField('tec1-t-m-out', 'TEC1 温度', 'word4 bit[15:0]：16 bit 无符号数'),
    tmStatusField('tec1-c-2v5-m-out', 'TEC1 状态参数', 'word5 bit[15:0]：16 bit 无符号数'),
    tmStatusField('mod-pd-yc-out', '调制器状态参数1', 'word6 bit[15:0]：16 bit 无符号数'),
    tmStatusField('hmc-mod-pd-yc-out', '调制器状态参数2', 'word7 bit[15:0]：16 bit 无符号数'),
    tmStatusField('txm2-t-m-out', '发射2温度', 'word8 bit[15:0]：16 bit 无符号数'),
    tmStatusField('txm2-c-m-out', '发射2状态参数', 'word9 bit[15:0]：16 bit 无符号数'),
    tmStatusField('lo2-t-m-out', '本振2温度', 'word10 bit[15:0]：16 bit 无符号数'),
    tmStatusField('lo2-c-m-out', '本振2状态参数', 'word11 bit[15:0]：16 bit 无符号数'),
    tmStatusField('tec2-t-m-out', 'TEC2 温度', 'word12 bit[15:0]：16 bit 无符号数'),
    tmStatusField('tec2-c-2v5-m-out', 'TEC2 状态参数', 'word13 bit[15:0]：16 bit 无符号数'),
  ],
});

const tmLaserCfg = buildTmFrameAsset({
  id: 'tm-laser-cfg',
  name: '激光器控制 - 配置回读',
  moduleId: 0x4,
  moduleIdLabel: 'laser_ctrl_block',
  groupId: 0x81,
  paramCount: 21,
  payloadFields: [
    tmStatusField('txm-on', '发射激光器开关', 'word0 bit[1:0]：0=关闭, 1=TXM1 开, 2=TXM2 开, 3=异常', [
      { value: '0', label: '关闭' },
      { value: '1', label: 'TXM1 开' },
      { value: '2', label: 'TXM2 开' },
      { value: '3', label: '异常' },
    ]),
    tmStatusField('lo-on', '本振激光器开关', 'word1 bit[1:0]：0=关闭, 1=LO1 开, 2=LO2 开, 3=异常', [
      { value: '0', label: '关闭' },
      { value: '1', label: 'LO1 开' },
      { value: '2', label: 'LO2 开' },
      { value: '3', label: '异常' },
    ]),
    tmStatusField('wave-set-on', '参数包/手动温度选择', 'word2 bit[0]：0=参数包, 1=手动温度', [
      { value: '0', label: '参数包' },
      { value: '1', label: '手动温度' },
    ]),
    tmStatusField('tec-on1', 'TEC1 开关', 'word3 bit[0]：0=关闭/未使能, 1=开启/使能', [
      { value: '0', label: '关闭/未使能' },
      { value: '1', label: '开启/使能' },
    ]),
    tmStatusField('tec-on2', 'TEC2 开关', 'word4 bit[0]：0=关闭/未使能, 1=开启/使能', [
      { value: '0', label: '关闭/未使能' },
      { value: '1', label: '开启/使能' },
    ]),
    tmStatusField('modu-mode', '调制模式', 'word5 bit[1:0]：0=OOK, 1=BPSK, 2=QPSK, 3=异常命令', [
      { value: '0', label: '模式OOK' },
      { value: '1', label: '模式BPSK' },
      { value: '2', label: '模式QPSK' },
      { value: '3', label: '异常命令' },
    ]),
    tmStatusField('vol-auto', '调制开始', 'word6 bit[0]：0=停止/不开始, 1=开始', [
      { value: '0', label: '停止/不开始' },
      { value: '1', label: '开始' },
    ]),
    tmStatusField('doppler-on', '多普勒功能开关', 'word7 bit[0]：0=关闭/未使能, 1=开启/使能', [
      { value: '0', label: '关闭/未使能' },
      { value: '1', label: '开启/使能' },
    ]),
    tmStatusField('saomiao-on', '扫描开关', 'word8 bit[0]：0=关闭/未使能, 1=开启/使能', [
      { value: '0', label: '关闭/未使能' },
      { value: '1', label: '开启/使能' },
    ]),
    tmStatusField('genzong-on', '跟踪开关', 'word9 bit[0]：0=关闭/未使能, 1=开启/使能', [
      { value: '0', label: '关闭/未使能' },
      { value: '1', label: '开启/使能' },
    ]),
    tmStatusField('flag-mod', '调制标志', 'word10 bit[0]：0=未置位, 1=置位', [
      { value: '0', label: '未置位' },
      { value: '1', label: '置位' },
    ]),
    tmStatusField('flag-sz', 'SZ 标志输入', 'word11 bit[0]：0=未置位, 1=置位', [
      { value: '0', label: '未置位' },
      { value: '1', label: '置位' },
    ]),
    tmStatusField('txm1-set', '发射激光器1温度手动设置值', 'word12 bit[15:0]：16 bit 无符号数'),
    tmStatusField('txm2-set', '发射激光器2温度手动设置值', 'word13 bit[15:0]：16 bit 无符号数'),
    tmStatusField('lo1-set', '本振激光器1温度手动设置值', 'word14 bit[15:0]：16 bit 无符号数'),
    tmStatusField('lo2-set', '本振激光器2温度手动设置值', 'word15 bit[15:0]：16 bit 无符号数'),
    tmStatusField('modul-dc1-set', '调制器 DC1 设置', 'word16 bit[15:0]：16 bit 无符号数'),
    tmStatusField('modul-dc2-set', '调制器 DC2 设置', 'word17 bit[15:0]：16 bit 无符号数'),
    tmStatusField('modul-dc3-set', '调制器 DC3 设置', 'word18 bit[15:0]：16 bit 无符号数'),
    tmStatusField('doppler-pre', '预报多普勒值', 'word19 bit[15:0]：16 bit 无符号数'),
    tmStatusField('dat-sz', 'SZ 数据输入', 'word20 bit[7:0]：8 bit 无符号数'),
  ],
});

// --- biz_rx (module_id = 0x5) ---------------------------------------------

const tmBizRxRuntime = buildTmFrameAsset({
  id: 'tm-biz-rx-runtime',
  name: '业务接收 - 运行态',
  moduleId: 0x5,
  moduleIdLabel: 'yewu_rece_from_cxp_block',
  groupId: 0x80,
  paramCount: 6,
  payloadFields: [
    tmStatusField('total-count', '总接收帧计数', 'word0 bit[31:0]：32 bit 无符号数'),
    tmStatusField('error-frame-count', '错误帧计数', 'word1 bit[31:0]：32 bit 无符号数'),
    tmStatusField('isl-frame-count', 'isl 接收帧计数', 'word2 bit[31:0]：32 bit 无符号数'),
    tmStatusField('pg-frame-count', 'pg 接收帧计数', 'word3 bit[31:0]：32 bit 无符号数'),
    tmStatusField('reset-status', '复位状态', 'word4 bit[0]：0=空闲, 1=复位中/已接受', [
      { value: '0', label: '空闲' },
      { value: '1', label: '复位中/已接受' },
    ]),
    tmStatusField('flow-ctrl-status', '流控状态', 'word5 bit[0]：0=无流控, 1=流控有效', [
      { value: '0', label: '无流控' },
      { value: '1', label: '流控有效' },
    ]),
  ],
});

const tmBizRxCfg = buildTmFrameAsset({
  id: 'tm-biz-rx-cfg',
  name: '业务接收 - 配置回读',
  moduleId: 0x5,
  moduleIdLabel: 'yewu_rece_from_cxp_block',
  groupId: 0x81,
  paramCount: 1,
  payloadFields: [
    tmStatusField('enable', '业务接收使能配置', 'word0 bit[0]：0=未使能, 1=使能', [
      { value: '0', label: '未使能' },
      { value: '1', label: '使能' },
    ]),
  ],
});

// --- biz_tx (module_id = 0x6) ---------------------------------------------

const tmBizTxRuntime = buildTmFrameAsset({
  id: 'tm-biz-tx-runtime',
  name: '业务发送 - 运行态',
  moduleId: 0x6,
  moduleIdLabel: 'yewu_send_to_cxp_block',
  groupId: 0x80,
  paramCount: 4,
  payloadFields: [
    tmStatusField('total-count', '发送业务帧总计数', 'word0 bit[31:0]：32 bit 无符号数'),
    tmStatusField('link-status-frame-count', '链路状态帧计数', 'word1 bit[31:0]：32 bit 无符号数'),
    tmStatusField('flow-ctrl-frame-count', '流控帧计数', 'word2 bit[31:0]：32 bit 无符号数'),
    tmStatusField('reset-status', '复位状态', 'word3 bit[0]：0=空闲, 1=复位中/已接受', [
      { value: '0', label: '空闲' },
      { value: '1', label: '复位中/已接受' },
    ]),
  ],
});

const tmBizTxCfg = buildTmFrameAsset({
  id: 'tm-biz-tx-cfg',
  name: '业务发送 - 配置回读',
  moduleId: 0x6,
  moduleIdLabel: 'yewu_send_to_cxp_block',
  groupId: 0x81,
  paramCount: 1,
  payloadFields: [
    tmStatusField('enable', '业务发送使能配置', 'word0 bit[0]：0=未使能, 1=使能', [
      { value: '0', label: '未使能' },
      { value: '1', label: '使能' },
    ]),
  ],
});

// --- comm_tx (module_id = 0x7) --------------------------------------------

const tmCommTxRuntime = buildTmFrameAsset({
  id: 'tm-comm-tx-runtime',
  name: '通信发送 - 运行态',
  moduleId: 0x7,
  moduleIdLabel: 'comm_tx_block',
  groupId: 0x80,
  paramCount: 8,
  payloadFields: [
    tmStatusField('idle-frame-count-sec', '空闲帧每秒计数', 'word0 bit[31:0]：32 bit 无符号数'),
    tmStatusField('biz-frame-count-sec', '业务帧每秒计数', 'word1 bit[31:0]：32 bit 无符号数'),
    tmStatusField('biz-frame-count-total', '业务帧累计计数', 'word2 bit[31:0]：32 bit 无符号数'),
    tmStatusField('reset-status', '复位状态', 'word3 bit[0]：0=空闲, 1=复位中/已接受', [
      { value: '0', label: '空闲' },
      { value: '1', label: '复位中/已接受' },
    ]),
    tmStatusField(
      'ber-inject-mode-status',
      '当前误码注入模式状态',
      'word4 bit[3:0]：0=不注入, 1=轻量误码, 2=重度误码, 3=随机误码, 4~15=保留',
      [
        { value: '0', label: '不注入' },
        { value: '1', label: '轻量误码' },
        { value: '2', label: '重度误码' },
        { value: '3', label: '随机误码' },
      ],
    ),
    tmStatusField(
      'error-inject-word5',
      '故障注入状态 word5',
      'word5：bit[15:12]=CRC, bit[11:8]=帧头, bit[7:4]=数据类型, bit[3:0]=字段位置；各 nibble 0=不注入, 1~15=注入编码值（具体模式 RTL 未定义）',
    ),
    tmStatusField(
      'error-inject-word6',
      '故障注入状态 word6',
      'word6：bit[7:4]=编码故障注入, bit[3:0]=配置编码类型；各 nibble 0=不注入或 RS, 1=注入或 LDPC',
    ),
    tmStatusField(
      'actual-encode-sel-status',
      '实际编码类型状态',
      'word7 bit[3:0]：0=RS, 1=LDPC, 其它=保留/未知',
      [
        { value: '0', label: 'RS' },
        { value: '1', label: 'LDPC' },
      ],
    ),
  ],
});

const tmCommTxCfg = buildTmFrameAsset({
  id: 'tm-comm-tx-cfg',
  name: '通信发送 - 配置回读',
  moduleId: 0x7,
  moduleIdLabel: 'comm_tx_block',
  groupId: 0x81,
  paramCount: 10,
  payloadFields: [
    tmStatusField(
      'rate-sel',
      '发送速率选择',
      'word0 bit[7:0]：0=312M, 1=625M, 2=1.25G, 3=2.5G, 4=5G, 0x80=OOK 20M, 0xA0=OOK 10M, 0xC0=OOK 1M',
      [
        { value: '0', label: '312M' },
        { value: '1', label: '625M' },
        { value: '2', label: '1.25G' },
        { value: '3', label: '2.5G' },
        { value: '4', label: '5G' },
        { value: '128', label: 'OOK 20M' },
        { value: '160', label: 'OOK 10M' },
        { value: '192', label: 'OOK 1M' },
      ],
    ),
    tmStatusField('scramble-enable', '扰码使能', 'word1 bit[0]：0=未使能, 1=使能', [
      { value: '0', label: '未使能' },
      { value: '1', label: '使能' },
    ]),
    tmStatusField('encode-sel', '编码类型选择', 'word2 bit[0]：0=RS, 1=LDPC', [
      { value: '0', label: 'RS' },
      { value: '1', label: 'LDPC' },
    ]),
    tmStatusField(
      'ber-inject-mode',
      '误码注入模式',
      'word3 bit[3:0]：0=不注入, 1=轻量误码, 2=重度误码, 3=随机误码, 4~15=保留',
      [
        { value: '0', label: '不注入' },
        { value: '1', label: '轻量误码' },
        { value: '2', label: '重度误码' },
        { value: '3', label: '随机误码' },
      ],
    ),
    tmStatusField('crc-error-inject', 'CRC 故障注入控制', 'word4 bit[3:0]：0=不注入, 1~15=注入编码值', [
      { value: '0', label: '不注入' },
    ]),
    tmStatusField('header-error-inject', '帧头故障注入控制', 'word5 bit[3:0]：0=不注入, 1~15=注入编码值', [
      { value: '0', label: '不注入' },
    ]),
    tmStatusField('data-type-error-inject', '数据类型故障注入控制', 'word6 bit[3:0]：0=不注入, 1~15=注入编码值', [
      { value: '0', label: '不注入' },
    ]),
    tmStatusField('field-pos-error-inject', '字段位置故障注入控制', 'word7 bit[3:0]：0=不注入, 1~15=注入编码值', [
      { value: '0', label: '不注入' },
    ]),
    tmStatusField('encode-error-inject', '编码故障注入控制', 'word8 bit[3:0]：0=不注入, 1~15=注入编码值', [
      { value: '0', label: '不注入' },
    ]),
    tmStatusField('data-link-break-inject', '数据断链异常注入控制', 'word9 bit[0]：0=正常, 1=注入断链', [
      { value: '0', label: '正常' },
      { value: '1', label: '注入断链' },
    ]),
  ],
});

// --- comm_rx (module_id = 0x8) --------------------------------------------
// runtime: 22 word（其中 4 个 64-bit 计数字段已合并为 uint64 length=8，各占 2 word）
// cfg: 11 word
// iq: 12 word（I 路 6 word + Q 路 6 word，固定 192+192 bit）

const tmCommRxRuntime = buildTmFrameAsset({
  id: 'tm-comm-rx-runtime',
  name: '通信接收 - 运行态',
  moduleId: 0x8,
  moduleIdLabel: 'comm_rx_block',
  groupId: 0x80,
  paramCount: 22,
  payloadFields: [
    tmStatusField('signal-power', '接收信号功率测量值', 'word0 bit[15:0]：16 bit 无符号数'),
    tmStatusField('carrier-freq-offset-est', '载波频偏粗估计值', 'word1 bit[31:0]：32 bit 补码（有符号）'),
    tmStatusField('carrier-lock-state', '载波锁定状态', 'word2 bit[0]：0=未锁定, 1=锁定', [
      { value: '0', label: '未锁定' },
      { value: '1', label: '锁定' },
    ]),
    tmStatusField('symbol-lock-state', '符号锁定状态', 'word3 bit[0]：0=未锁定, 1=锁定', [
      { value: '0', label: '未锁定' },
      { value: '1', label: '锁定' },
    ]),
    tmStatusField('frame-lock-state', '帧锁定状态', 'word4 bit[0]：0=未锁定, 1=锁定', [
      { value: '0', label: '未锁定' },
      { value: '1', label: '锁定' },
    ]),
    tmStatusField('frame-count-sec', '每秒帧总计数', 'word5 bit[31:0]：32 bit 无符号数'),
    tmStatusField('error-frame-count-sec', '每秒错误帧计数', 'word6 bit[31:0]：32 bit 无符号数'),
    tmStatusField('air-frame-count-sec', '每秒空口帧计数', 'word7 bit[31:0]：32 bit 无符号数'),
    tmStatusField('biz-frame-count-sec', '每秒业务帧计数', 'word8 bit[31:0]：32 bit 无符号数'),
    makeTmStatusUint64Word(
      'pre-total-bit-count-sec',
      '译码前总比特计数',
      'word9-10 bit[63:0]：64 bit 无符号数（多 word 数值高位在前，由 high/low 合并）',
    ),
    makeTmStatusUint64Word(
      'pre-dec-err-bits-sec',
      '译码前误码计数',
      'word11-12 bit[63:0]：64 bit 无符号数',
    ),
    makeTmStatusUint64Word(
      'post-total-bit-count-sec',
      '译码后总比特计数',
      'word13-14 bit[63:0]：64 bit 无符号数',
    ),
    makeTmStatusUint64Word(
      'post-dec-err-bits-sec',
      '译码后误码计数',
      'word15-16 bit[63:0]：64 bit 无符号数',
    ),
    tmStatusField('coarse-range-value', '粗测距值', 'word17 bit[31:0]：32 bit 无符号数'),
    tmStatusField('fine-range-value', '细测距值', 'word18 bit[31:0]：32 bit 无符号数'),
    tmStatusField('ranging-reset-status', '测距复位接受/忙状态', 'word19 bit[0]：0=空闲, 1=复位中/已接受', [
      { value: '0', label: '空闲' },
      { value: '1', label: '复位中/已接受' },
    ]),
    tmStatusField('manual-reset-status', '手动接收复位接受/忙状态', 'word20 bit[0]：0=空闲, 1=复位中/已接受', [
      { value: '0', label: '空闲' },
      { value: '1', label: '复位中/已接受' },
    ]),
    tmStatusField('ook-lock-state', 'OOK 判决锁定状态', 'word21 bit[0]：0=未锁定（或非 OOK 模式）, 1=锁定', [
      { value: '0', label: '未锁定' },
      { value: '1', label: '锁定' },
    ]),
  ],
});

const tmCommRxCfg = buildTmFrameAsset({
  id: 'tm-comm-rx-cfg',
  name: '通信接收 - 配置回读',
  moduleId: 0x8,
  moduleIdLabel: 'comm_rx_block',
  groupId: 0x81,
  paramCount: 11,
  payloadFields: [
    tmStatusField(
      'rate-sel',
      '接收链路速率选择寄存值',
      'word0 bit[7:0]：0=312M, 1=625M, 2=1.25G, 3=2.5G, 4=5G, 0x80=OOK 20M, 0xA0=OOK 10M, 0xC0=OOK 1M（1M 未实现）',
      [
        { value: '0', label: '312M' },
        { value: '1', label: '625M' },
        { value: '2', label: '1.25G' },
        { value: '3', label: '2.5G' },
        { value: '4', label: '5G' },
        { value: '128', label: 'OOK 20M' },
        { value: '160', label: 'OOK 10M' },
        { value: '192', label: 'OOK 1M' },
      ],
    ),
    tmStatusField('decode-sel', '解码选择', 'word1 bit[0]：0=RS, 1=LDPC', [
      { value: '0', label: 'RS' },
      { value: '1', label: 'LDPC' },
    ]),
    tmStatusField('descramble-enable', '接收解扰使能位', 'word2 bit[0]：0=未使能, 1=使能', [
      { value: '0', label: '未使能' },
      { value: '1', label: '使能' },
    ]),
    tmStatusField('carrier-filter-enable', '载波滤波使能位', 'word3 bit[0]：0=未使能, 1=使能', [
      { value: '0', label: '未使能' },
      { value: '1', label: '使能' },
    ]),
    tmStatusField(
      'timing-loop-bw-sel',
      '定时环路带宽选择编码',
      'word4 bit[2:0]：0~7 带宽编码（具体带宽值 RTL 未定义）',
      [
        { value: '0', label: '带宽编码 0' },
        { value: '1', label: '带宽编码 1' },
        { value: '2', label: '带宽编码 2' },
        { value: '3', label: '带宽编码 3' },
        { value: '4', label: '带宽编码 4' },
        { value: '5', label: '带宽编码 5' },
        { value: '6', label: '带宽编码 6' },
        { value: '7', label: '带宽编码 7' },
      ],
    ),
    tmStatusField('timing-filter-enable', '定时滤波使能位', 'word5 bit[0]：0=未使能, 1=使能', [
      { value: '0', label: '未使能' },
      { value: '1', label: '使能' },
    ]),
    tmStatusField('frame-sync-corr-peak-th', '帧同步相关峰阈值', 'word6 bit[6:0]：7 bit 无符号数'),
    tmStatusField('frame-lock-threshold', '帧锁定门限值', 'word7 bit[15:0]：16 bit 无符号数'),
    tmStatusField('frame-unlock-threshold', '帧失锁门限值', 'word8 bit[15:0]：16 bit 无符号数'),
    tmStatusField('auto-reset-enable', '自动复位使能位', 'word9 bit[0]：0=未使能, 1=使能', [
      { value: '0', label: '未使能' },
      { value: '1', label: '使能' },
    ]),
    tmStatusField('loop-enable', '接收链路环回使能位', 'word10 bit[0]：0=未使能, 1=使能', [
      { value: '0', label: '未使能' },
      { value: '1', label: '使能' },
    ]),
  ],
});

const tmCommRxIq = buildTmFrameAsset({
  id: 'tm-comm-rx-iq',
  name: '通信接收 - IQ 数据流',
  moduleId: 0x8,
  moduleIdLabel: 'comm_rx_block',
  groupId: 0x82,
  paramCount: 12,
  payloadFields: [
    tmStatusField(
      'rx-iq-i-data-191-160',
      'I 路遥测采样 [191:160]',
      'word0 bit[31:0]：rx_iq_i_data 192 bit 字段的 [191:160] 分片',
    ),
    tmStatusField(
      'rx-iq-i-data-159-128',
      'I 路遥测采样 [159:128]',
      'word1 bit[31:0]：rx_iq_i_data 192 bit 字段的 [159:128] 分片',
    ),
    tmStatusField(
      'rx-iq-i-data-127-96',
      'I 路遥测采样 [127:96]',
      'word2 bit[31:0]：rx_iq_i_data 192 bit 字段的 [127:96] 分片',
    ),
    tmStatusField(
      'rx-iq-i-data-95-64',
      'I 路遥测采样 [95:64]',
      'word3 bit[31:0]：rx_iq_i_data 192 bit 字段的 [95:64] 分片',
    ),
    tmStatusField(
      'rx-iq-i-data-63-32',
      'I 路遥测采样 [63:32]',
      'word4 bit[31:0]：rx_iq_i_data 192 bit 字段的 [63:32] 分片',
    ),
    tmStatusField(
      'rx-iq-i-data-31-0',
      'I 路遥测采样 [31:0]',
      'word5 bit[31:0]：rx_iq_i_data 192 bit 字段的 [31:0] 分片',
    ),
    tmStatusField(
      'rx-iq-q-data-191-160',
      'Q 路遥测采样 [191:160]',
      'word6 bit[31:0]：rx_iq_q_data 192 bit 字段的 [191:160] 分片',
    ),
    tmStatusField(
      'rx-iq-q-data-159-128',
      'Q 路遥测采样 [159:128]',
      'word7 bit[31:0]：rx_iq_q_data 192 bit 字段的 [159:128] 分片',
    ),
    tmStatusField(
      'rx-iq-q-data-127-96',
      'Q 路遥测采样 [127:96]',
      'word8 bit[31:0]：rx_iq_q_data 192 bit 字段的 [127:96] 分片',
    ),
    tmStatusField(
      'rx-iq-q-data-95-64',
      'Q 路遥测采样 [95:64]',
      'word9 bit[31:0]：rx_iq_q_data 192 bit 字段的 [95:64] 分片',
    ),
    tmStatusField(
      'rx-iq-q-data-63-32',
      'Q 路遥测采样 [63:32]',
      'word10 bit[31:0]：rx_iq_q_data 192 bit 字段的 [63:32] 分片',
    ),
    tmStatusField(
      'rx-iq-q-data-31-0',
      'Q 路遥测采样 [31:0]',
      'word11 bit[31:0]：rx_iq_q_data 192 bit 字段的 [31:0] 分片',
    ),
  ],
  description:
    '通信接收 IQ 数据流（group_id=0x82）：固定 12 word = I 路 6 word（192 bit）+ Q 路 6 word（192 bit）。' +
    'docs UI 字段定义标注每个分片为 32 bit 无符号数；实际 IQ 采样可能需要消费方按 16-bit I/Q 交错或定点格式重组，' +
    'docs 未给出量化系数和位宽细节，本文件只承载 word 切片结构。',
});

// ===========================================================================
// 收发回环图表测试帧（测试专用，非真实业务帧）
//
// 用途：display 的两类图表缺"能收发联调"的测试帧——
//   - waveform 图需要帧有会变化的数值字段；
//   - scatter 图（星座图）需要 I 路字段 + Q 路字段。
// 现有 47 帧里 rc-* 无数值数据字段，唯一能测星座的是 tm-comm-rx-iq，缺测波形的帧。
//
// 收发模式：回环自测（串口 TX/RX 短接，或单进程内 send 编码→receive 解析）。
// 每个测试帧造【一对】send + receive，二者 header word0 逐字节相同——
// receive 帧的 identifierRules（sync[0:3] + header[8:11] 双 eq 规则）才能匹配上
// send 编码发出的字节（matchReceiveFrame 按这两段逐字节比较）。
// send 帧数值字段 configurable:true（可在 send 页面编辑后发出），receive 帧同名字段
// configurable:false（仅解析展示，喂给图表）。
//
// header word0 协议语义说明：两帧都用 msg_type=0x2（遥测头）。
// 理由——回环的本质是"软件模拟下位机回传遥测"，receive 帧 msg_type=0x2 正确；
// send 帧在此场景只是个"字节发生器"（把可编辑数值编码成字节回环），无真机校验
// msg_type，取遥测头是为了和 receive 帧 header 逐字节一致以触发 identifierRules 匹配。
// 真实业务里 send=0x1/receive=0x2 是不同 header 的独立帧，与此测试场景无关。
//
// 分配 moduleId=0xF（测试专用高位，避开真实模块 0x0–0x8），3 对 header word0 与现有帧无冲突：
//   - waveform-6       : group_id=0x90, header 0x12F90060, 6 个 uint32 数值，测波形
//   - waveform-8       : group_id=0x91, header 0x12F91080, 8 个 uint32 数值，测波形
//   - constellation    : group_id=0x92, 1 I bytes + 1 Q bytes（各 24 字节），测星座
// 注：造帧背景见 .sessions 调研；display 图表设计见 codestable/features/2026-06-11-display-group-management。
// ===========================================================================

// send 测试帧数值字段：复用 makeRcParamWord（uint32 configurable:true），但显式传 defaultValue。
function testSendWord(id: string, name: string, bitDesc: string, defaultValue: string): FrameFieldDefinition {
  return makeRcParamWord(id, name, bitDesc, { defaultValue });
}

// receive 测试帧数值字段：复用 makeTmStatusWord（uint32 configurable:false），显式传 defaultValue。
function testRecvWord(id: string, name: string, bitDesc: string, defaultValue: string): FrameFieldDefinition {
  return makeTmStatusWord(id, name, bitDesc, { defaultValue });
}

// 星座图 I/Q bytes 字段：承载多个采样的字节流，scatter 按 bitWidth 从中切多点
// （见 display/core/sampling.ts extractValuesFromHex）。length=24 字节：bitWidth=8 切 24 点，
// bitWidth=12 切 16 点（对齐旧版 sampleCount=16）。send 帧 configurable 可编辑 hex。
function makeTestBytesField(
  id: string,
  name: string,
  description: string,
  byteLength: number,
  defaultValue: string,
  configurable: boolean,
): FrameFieldDefinition {
  return {
    id,
    name,
    dataType: 'bytes',
    length: byteLength,
    description,
    inputType: 'input',
    configurable,
    options: [],
    dataParticipationType: 'direct',
    defaultValue,
    bigEndian: true,
  };
}

interface TestChartPairSpec {
  /** 共同 header 的 groupId（moduleId 固定 0xF，msgType 固定 0x2 遥测头）。 */
  groupId: number;
  paramCount: number;
  /** send 帧 id（rc-test-*）。 */
  sendId: string;
  /** receive 帧 id（tm-test-*）。 */
  recvId: string;
  name: string;
  /** payload 字段定义；send/recv 共用同一组 (id,name,desc,defaultValue)，仅 configurable 不同。 */
  fields: { id: string; name: string; bitDesc: string; defaultValue: string }[];
  description: string;
}

// 造一对 send + receive 测试帧（同 header word0，同字段结构）。
// 用 buildRcFrameAsset/buildTmFrameAsset 各自生成骨架后，把 send 帧的 header 强制改成
// 遥测头（msg_type=0x2），使其与 receive 帧 header 逐字节相同 → identifierRules 回环匹配成立。
function buildTestChartPair(spec: TestChartPairSpec): { send: FrameAsset; recv: FrameAsset } {
  const sendPayload: FrameFieldDefinition[] = spec.fields.map((f) =>
    testSendWord(f.id, f.name, f.bitDesc, f.defaultValue),
  );
  const recvPayload: FrameFieldDefinition[] = spec.fields.map((f) =>
    testRecvWord(f.id, f.name, f.bitDesc, f.defaultValue),
  );

  const send = buildRcFrameAsset({
    id: spec.sendId,
    name: `测试(发) - ${spec.name}`,
    moduleId: 0xF,
    moduleIdLabel: 'test_block',
    groupId: spec.groupId,
    paramCount: spec.paramCount,
    payloadFields: sendPayload,
    description: spec.description,
  });
  // 强制 send 帧 header 为遥测头（msg_type=0x2），与 receive 帧 header 逐字节一致。
  // 否则 buildRcFrameAsset 默认用 rcHeader（msg_type=0x1），回环时 identifierRules 匹配不上。
  const telemetryHeader = tmHeader(0xF, spec.groupId, spec.paramCount);
  send.fields[2] = makeHeaderField(telemetryHeader, 0xF, spec.groupId);
  send.identifierRules = headerIdentifierRules(0xF, spec.groupId, spec.paramCount, APP_MSG_TYPE_TELEMETRY);

  const recv = buildTmFrameAsset({
    id: spec.recvId,
    name: `测试(收) - ${spec.name}`,
    moduleId: 0xF,
    moduleIdLabel: 'test_block',
    groupId: spec.groupId,
    paramCount: spec.paramCount,
    payloadFields: recvPayload,
    description: spec.description,
  });

  return { send, recv };
}

const testWaveform6Pair = buildTestChartPair({
  groupId: 0x90,
  paramCount: 6,
  sendId: 'rc-test-waveform-6',
  recvId: 'tm-test-waveform-6',
  name: '波形图 6 通道数值',
  fields: [
    { id: 'ch0-voltage', name: '通道0 电压', bitDesc: 'word0 bit[31:0]：uint32 原始码值（单位 mV，模拟量）', defaultValue: '0x00000BB8' },
    { id: 'ch1-current', name: '通道1 电流', bitDesc: 'word1 bit[31:0]：uint32 原始码值（单位 mA，模拟量）', defaultValue: '0x000001F4' },
    { id: 'ch2-temp', name: '通道2 温度', bitDesc: 'word2 bit[31:0]：uint32 原始码值（单位 0.01℃，模拟量）', defaultValue: '0x00009C40' },
    { id: 'ch3-power', name: '通道3 功率', bitDesc: 'word3 bit[31:0]：uint32 原始码值（单位 0.1W，模拟量）', defaultValue: '0x00000064' },
    { id: 'ch4-pressure', name: '通道4 压力', bitDesc: 'word4 bit[31:0]：uint32 原始码值（单位 Pa，模拟量）', defaultValue: '0x0000EA60' },
    { id: 'ch5-snr', name: '通道5 信噪比', bitDesc: 'word5 bit[31:0]：uint32 原始码值（单位 0.01dB，模拟量）', defaultValue: '0x000007D0' },
  ],
  description:
    '收发回环测试帧（module_id=0xF test_block group_id=0x90）：send+receive 一对，header word0=0x12F90060 相同。' +
    '6 个 uint32 数值字段（电压/电流/温度/功率/压力/信噪比）。send 帧（rc-test-waveform-6）数值可编辑，' +
    '编码发出的字节经回环被 receive 帧（tm-test-waveform-6）按 identifierRules 匹配解析，喂 display waveform 图画曲线。',
});

const testWaveform8Pair = buildTestChartPair({
  groupId: 0x91,
  paramCount: 8,
  sendId: 'rc-test-waveform-8',
  recvId: 'tm-test-waveform-8',
  name: '波形图 8 通道数值',
  fields: [
    { id: 'ch0-sin', name: '通道0 正弦', bitDesc: 'word0 bit[31:0]：uint32 原始码值（建议发送侧填正弦采样）', defaultValue: '0x00008000' },
    { id: 'ch1-cos', name: '通道1 余弦', bitDesc: 'word1 bit[31:0]：uint32 原始码值（建议发送侧填余弦采样）', defaultValue: '0x00008000' },
    { id: 'ch2-triangle', name: '通道2 三角', bitDesc: 'word2 bit[31:0]：uint32 原始码值（建议发送侧填三角波采样）', defaultValue: '0x00000000' },
    { id: 'ch3-ramp', name: '通道3 锯齿', bitDesc: 'word3 bit[31:0]：uint32 原始码值（建议发送侧填锯齿波采样）', defaultValue: '0x00000000' },
    { id: 'ch4-square', name: '通道4 方波', bitDesc: 'word4 bit[31:0]：uint32 原始码值（建议发送侧填方波采样）', defaultValue: '0x00000000' },
    { id: 'ch5-noise', name: '通道5 噪声', bitDesc: 'word5 bit[31:0]：uint32 原始码值（建议发送侧填随机噪声）', defaultValue: '0x00000000' },
    { id: 'ch6-envelope', name: '通道6 包络', bitDesc: 'word6 bit[31:0]：uint32 原始码值（建议发送侧填包络采样）', defaultValue: '0x00000000' },
    { id: 'ch7-dc', name: '通道7 直流', bitDesc: 'word7 bit[31:0]：uint32 原始码值（建议发送侧填直流偏置）', defaultValue: '0x00008000' },
  ],
  description:
    '收发回环测试帧（module_id=0xF test_block group_id=0x91）：send+receive 一对，header word0=0x12F91080 相同。' +
    '8 个 uint32 数值字段，通道名标注建议波形（正弦/余弦/三角/锯齿/方波/噪声/包络/直流），便于多通道 waveform 图叠加对比。',
});

// 星座图对：I/Q 用 bytes 长字段承载多个采样，scatter 按 bitWidth 切多点（对接旧版
// extractValuesFromHex 语义，见 display/core/sampling.ts）。不复用 buildTestChartPair
// （它专为 uint32 数值字段设计）；这里单独用 buildRcFrameAsset/buildTmFrameAsset + bytes 字段。
//
// 长度选择：I/Q 各 length=24 字节（=6 word，paramCount 共 12 word）。
//   - bitWidth=8  → 每字段切 24 点
//   - bitWidth=12 → 每字段切 16 点（对齐旧版默认 sampleCount=16）
// checksum 对齐：I(24)+Q(24)=48 字节是 4 的倍数，满足 sum32 对齐。
// defaultValue 给一组示例 IQ 采样（16 个 12-bit 值，正弦/余弦），便于空跑有可见点。
const CONSTELLATION_IQ_BYTE_LENGTH = 24;
// 16 个 12-bit 有符号采样示例（正弦 I 路 / 余弦 Q 路，幅度 ±2047，围绕 0 有正有负）。
// 每 3 hex 字符一个 12-bit 补码值，16 值 × 3 = 48 hex 字符 = 24 字节（正好填满 length）。
// 负数用补码编码（如 -2047 → 0x801），scatter 按 bitWidth 切出后会还原成负数，画四象限星座图。
const CONSTELLATION_I_DEFAULT = '0x00030F5A77637FF7635A730F000CF1A5989D80189DA59CF1';
const CONSTELLATION_Q_DEFAULT = '0x7FF7635A730F000CF1A5989D80189DA59CF100030F5A7763';

function buildTestConstellationPair(): { send: FrameAsset; recv: FrameAsset } {
  const groupId = 0x92;
  // bytes 字段每个占 6 word，2 个字段 = 12 word
  const paramCount = (CONSTELLATION_IQ_BYTE_LENGTH * 2) / 4;

  const sendPayload: FrameFieldDefinition[] = [
    makeTestBytesField(
      'test-iq-i', 'I 路采样',
      `word0..5（24 字节）：I 路采样字节流，scatter 按 bitWidth 切多点（scatter iSource 选此）`,
      CONSTELLATION_IQ_BYTE_LENGTH, CONSTELLATION_I_DEFAULT, true,
    ),
    makeTestBytesField(
      'test-iq-q', 'Q 路采样',
      `word6..11（24 字节）：Q 路采样字节流，scatter 按 bitWidth 切多点（scatter qSource 选此）`,
      CONSTELLATION_IQ_BYTE_LENGTH, CONSTELLATION_Q_DEFAULT, true,
    ),
  ];
  const recvPayload: FrameFieldDefinition[] = [
    makeTestBytesField(
      'test-iq-i', 'I 路采样',
      `word0..5（24 字节）：I 路采样字节流，scatter 按 bitWidth 切多点（scatter iSource 选此）`,
      CONSTELLATION_IQ_BYTE_LENGTH, CONSTELLATION_I_DEFAULT, false,
    ),
    makeTestBytesField(
      'test-iq-q', 'Q 路采样',
      `word6..11（24 字节）：Q 路采样字节流，scatter 按 bitWidth 切多点（scatter qSource 选此）`,
      CONSTELLATION_IQ_BYTE_LENGTH, CONSTELLATION_Q_DEFAULT, false,
    ),
  ];

  const send = buildRcFrameAsset({
    id: 'rc-test-constellation',
    name: '测试(发) - 星座图 I/Q 数据流',
    moduleId: 0xF,
    moduleIdLabel: 'test_block',
    groupId,
    paramCount,
    payloadFields: sendPayload,
    description:
      '收发回环测试帧（module_id=0xF test_block group_id=0x92）：send+receive 一对。' +
      'I/Q 各 24 字节 bytes 字段，scatter 按 bitWidth 切多点（bitWidth=8 切 24 点，bitWidth=12 切 16 点）。' +
      'send 帧 I/Q 可编辑 hex，回环后 receive 帧解析，display scatter 选 iSource=test-iq-i、qSource=test-iq-q。',
  });
  // 强制 send 帧 header 为遥测头（msg_type=0x2），与 receive 帧 header 逐字节一致以触发回环匹配。
  const telemetryHeader = tmHeader(0xF, groupId, paramCount);
  send.fields[2] = makeHeaderField(telemetryHeader, 0xF, groupId);
  send.identifierRules = headerIdentifierRules(0xF, groupId, paramCount, APP_MSG_TYPE_TELEMETRY);

  const recv = buildTmFrameAsset({
    id: 'tm-test-constellation',
    name: '测试(收) - 星座图 I/Q 数据流',
    moduleId: 0xF,
    moduleIdLabel: 'test_block',
    groupId,
    paramCount,
    payloadFields: recvPayload,
    description:
      '收发回环测试帧（module_id=0xF test_block group_id=0x92）：send+receive 一对。' +
      'I/Q 各 24 字节 bytes 字段，scatter 按 bitWidth 切多点（bitWidth=8 切 24 点，bitWidth=12 切 16 点）。' +
      'send 帧 I/Q 可编辑 hex，回环后 receive 帧解析，display scatter 选 iSource=test-iq-i、qSource=test-iq-q。',
  });

  return { send, recv };
}

const testConstellationPair = buildTestConstellationPair();

const rcTestWaveform6 = testWaveform6Pair.send;
const tmTestWaveform6 = testWaveform6Pair.recv;
const rcTestWaveform8 = testWaveform8Pair.send;
const tmTestWaveform8 = testWaveform8Pair.recv;
const rcTestConstellation = testConstellationPair.send;
const tmTestConstellation = testConstellationPair.recv;

// ===========================================================================
// 汇总导出
// ===========================================================================

export const dongfanghongFrames: FrameAsset[] = [
  // 遥控（send）— 33 条（含 3 条测试帧）
  rcClkMgmtMap,
  rcAdcMap,
  rcAdcPulseReset,
  rcGtPulseReset,
  rcCxpPulseReset,
  rcLaserTxmOn,
  rcLaserLoOn,
  rcLaserWaveSetOn,
  rcLaserTecOn1,
  rcLaserTecOn2,
  rcLaserModuMode,
  rcLaserVolAuto,
  rcLaserTxm1Set,
  rcLaserTxm2Set,
  rcLaserLo1Set,
  rcLaserLo2Set,
  rcBizRxMap,
  rcBizRxPulseClear,
  rcBizRxPulseReset,
  rcBizTxMap,
  rcBizTxPulseClear,
  rcBizTxPulseReset,
  rcCommTxMap,
  rcCommTxPulseReset,
  rcCommTxPulseClear,
  rcCommRxMap,
  rcCommRxValue,
  rcCommRxPulseRangeRst,
  rcCommRxPulseCountClr,
  rcCommRxPulseManualRst,
  // 测试帧（send，与下方 receive 帧成回环对）— 3 条
  rcTestWaveform6,
  rcTestWaveform8,
  rcTestConstellation,
  // 遥测（receive）— 20 条（含 3 条测试帧）
  tmClkMgmtRuntime,
  tmClkMgmtCfg,
  tmAdcRuntime,
  tmAdcCfg,
  tmGtRuntime,
  tmCxpRuntime,
  tmLaserRuntime,
  tmLaserCfg,
  tmBizRxRuntime,
  tmBizRxCfg,
  tmBizTxRuntime,
  tmBizTxCfg,
  tmCommTxRuntime,
  tmCommTxCfg,
  tmCommRxRuntime,
  tmCommRxCfg,
  tmCommRxIq,
  // 测试帧（receive，测图表数据源）— 3 条
  tmTestWaveform6,
  tmTestWaveform8,
  tmTestConstellation,
];

export const dongfanghongFrameCount = dongfanghongFrames.length;
