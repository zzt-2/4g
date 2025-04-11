/**
 * 帧配置导入导出相关工具函数
 */
import type { FrameDefinition, FieldDefinition } from "../types/frames";

/**
 * 导出帧定义为JSON格式
 * @param frames 需要导出的帧定义数组
 * @param prettyPrint 是否美化输出
 * @returns JSON字符串
 */
export const exportFramesToJson = (
  frames: FrameDefinition[],
  prettyPrint = true
): string => {
  if (!frames || frames.length === 0) {
    return "[]";
  }

  try {
    return JSON.stringify(frames, null, prettyPrint ? 2 : 0);
  } catch (error) {
    console.error("导出帧定义为JSON时出错:", error);
    throw new Error(
      "导出失败: " + (error instanceof Error ? error.message : String(error))
    );
  }
};

/**
 * 从JSON字符串导入帧定义
 * @param jsonString JSON字符串
 * @returns 帧定义数组
 */
export const importFramesFromJson = (jsonString: string): FrameDefinition[] => {
  if (!jsonString || jsonString.trim() === "") {
    return [];
  }

  try {
    const parsed = JSON.parse(jsonString);

    if (!Array.isArray(parsed)) {
      throw new Error("JSON数据必须是帧定义数组");
    }

    // 验证每个帧定义
    return parsed.map(validateFrameDefinition);
  } catch (error) {
    console.error("从JSON导入帧定义时出错:", error);
    throw new Error(
      "导入失败: " + (error instanceof Error ? error.message : String(error))
    );
  }
};

/**
 * 验证帧定义
 * @param frame 需要验证的帧定义
 * @returns 验证后的帧定义
 * @throws 如果帧定义无效
 */
const validateFrameDefinition = (frame: any): FrameDefinition => {
  if (!frame || typeof frame !== "object") {
    throw new Error("帧定义必须是一个对象");
  }

  // 必需字段
  const requiredFields = [
    "id",
    "name",
    "protocolType",
    "deviceType",
    "fields",
    "byteOrder",
    "checksumType",
  ];
  for (const field of requiredFields) {
    if (frame[field] === undefined) {
      throw new Error(`帧定义缺少必需的字段: ${field}`);
    }
  }

  // 验证字段数组
  if (!Array.isArray(frame.fields)) {
    throw new Error("字段定义必须是一个数组");
  }

  // 验证每个字段
  const validatedFields = frame.fields.map(validateFieldDefinition);

  // 返回验证后的帧定义
  return {
    ...frame,
    fields: validatedFields,
    createdAt: frame.createdAt || Date.now(),
    updatedAt: frame.updatedAt || Date.now(),
    usageCount: frame.usageCount || 0,
  };
};

/**
 * 验证字段定义
 * @param field 需要验证的字段定义
 * @returns 验证后的字段定义
 * @throws 如果字段定义无效
 */
const validateFieldDefinition = (field: any): FieldDefinition => {
  if (!field || typeof field !== "object") {
    throw new Error("字段定义必须是一个对象");
  }

  // 必需字段
  const requiredFields = ["id", "name", "dataType", "length"];
  for (const requiredField of requiredFields) {
    if (field[requiredField] === undefined) {
      throw new Error(`字段定义缺少必需的字段: ${requiredField}`);
    }
  }

  return field as FieldDefinition;
};

/**
 * 将帧定义导出为CSV格式
 * @param frames 帧定义数组
 * @returns CSV字符串
 */
export const exportFramesToCsv = (frames: FrameDefinition[]): string => {
  if (!frames || frames.length === 0) {
    return "";
  }

  // CSV标题行
  const headers = [
    "ID",
    "名称",
    "描述",
    "协议类型",
    "设备类型",
    "字节顺序",
    "校验类型",
    "包含长度字段",
    "标签",
    "备注",
    "创建时间",
    "更新时间",
    "使用次数",
  ];

  // 拼接CSV内容
  const csvRows = [headers.join(",")];

  for (const frame of frames) {
    const tags = frame.tags ? frame.tags.join("|") : "";
    const createdDate = new Date(frame.createdAt).toISOString();
    const updatedDate = new Date(frame.updatedAt).toISOString();

    // 转义特殊字符
    const escapeCsvField = (field: string | undefined): string => {
      if (field === undefined || field === null) return "";
      const strValue = String(field);
      if (
        strValue.includes(",") ||
        strValue.includes('"') ||
        strValue.includes("\n")
      ) {
        return `"${strValue.replace(/"/g, '""')}"`;
      }
      return strValue;
    };

    const row = [
      escapeCsvField(frame.id),
      escapeCsvField(frame.name),
      escapeCsvField(frame.description),
      escapeCsvField(frame.protocolType),
      escapeCsvField(frame.deviceType),
      escapeCsvField(frame.byteOrder),
      escapeCsvField(frame.checksumType),
      frame.includesLengthField ? "true" : "false",
      escapeCsvField(tags),
      escapeCsvField(frame.notes),
      escapeCsvField(createdDate),
      escapeCsvField(updatedDate),
      String(frame.usageCount),
    ];

    csvRows.push(row.join(","));

    // 为每个字段添加一行
    if (frame.fields && frame.fields.length > 0) {
      // 字段表头
      csvRows.push("");
      csvRows.push(
        "字段ID,字段名称,数据类型,长度,是否常量,是否必填,是否校验和字段,是否长度字段,默认值,描述"
      );

      for (const field of frame.fields) {
        const fieldRow = [
          escapeCsvField(field.id),
          escapeCsvField(field.name),
          escapeCsvField(field.dataType),
          String(field.length),
          field.isConstant ? "true" : "false",
          field.isRequired ? "true" : "false",
          field.isChecksumField ? "true" : "false",
          field.isLengthField ? "true" : "false",
          escapeCsvField(
            field.defaultValue !== undefined ? String(field.defaultValue) : ""
          ),
          escapeCsvField(field.description),
        ];

        csvRows.push(fieldRow.join(","));
      }

      csvRows.push(""); // 添加空行分隔不同的帧
    }
  }

  return csvRows.join("\n");
};

/**
 * 从CSV导入帧定义
 * 注意：这是一个基础实现，实际需要更复杂的CSV解析
 * @param csvString CSV字符串
 * @returns 帧定义数组
 */
export const importFramesFromCsv = (csvString: string): FrameDefinition[] => {
  // 注意: 实际应用中需要更健壮的CSV解析
  throw new Error("暂未实现从CSV导入帧定义功能");
};

/**
 * 导出帧定义为XML格式
 * @param frames 帧定义数组
 * @returns XML字符串
 */
export const exportFramesToXml = (frames: FrameDefinition[]): string => {
  if (!frames || frames.length === 0) {
    return "<Frames></Frames>";
  }

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<Frames>\n';

  for (const frame of frames) {
    xml += `  <Frame id="${escapeXml(frame.id)}" name="${escapeXml(
      frame.name
    )}">\n`;

    // 添加帧属性
    if (frame.description) {
      xml += `    <Description>${escapeXml(frame.description)}</Description>\n`;
    }

    xml += `    <ProtocolType>${escapeXml(
      frame.protocolType
    )}</ProtocolType>\n`;
    xml += `    <DeviceType>${escapeXml(frame.deviceType)}</DeviceType>\n`;
    xml += `    <ByteOrder>${escapeXml(frame.byteOrder)}</ByteOrder>\n`;
    xml += `    <ChecksumType>${escapeXml(
      frame.checksumType
    )}</ChecksumType>\n`;
    xml += `    <IncludesLengthField>${frame.includesLengthField}</IncludesLengthField>\n`;

    if (frame.lengthFieldPosition) {
      xml += `    <LengthFieldPosition>${escapeXml(
        frame.lengthFieldPosition
      )}</LengthFieldPosition>\n`;
    }

    if (frame.tags && frame.tags.length > 0) {
      xml += "    <Tags>\n";
      for (const tag of frame.tags) {
        xml += `      <Tag>${escapeXml(tag)}</Tag>\n`;
      }
      xml += "    </Tags>\n";
    }

    if (frame.notes) {
      xml += `    <Notes>${escapeXml(frame.notes)}</Notes>\n`;
    }

    xml += `    <CreatedAt>${frame.createdAt}</CreatedAt>\n`;
    xml += `    <UpdatedAt>${frame.updatedAt}</UpdatedAt>\n`;
    xml += `    <UsageCount>${frame.usageCount}</UsageCount>\n`;

    // 添加字段
    xml += "    <Fields>\n";
    for (const field of frame.fields) {
      xml += `      <Field id="${escapeXml(field.id)}" name="${escapeXml(
        field.name
      )}">\n`;
      xml += `        <DataType>${escapeXml(field.dataType)}</DataType>\n`;
      xml += `        <Length>${field.length}</Length>\n`;

      if (field.description) {
        xml += `        <Description>${escapeXml(
          field.description
        )}</Description>\n`;
      }

      if (field.defaultValue !== undefined) {
        xml += `        <DefaultValue>${escapeXml(
          String(field.defaultValue)
        )}</DefaultValue>\n`;
      }

      if (field.isConstant) {
        xml += `        <IsConstant>${field.isConstant}</IsConstant>\n`;
      }

      if (field.isRequired) {
        xml += `        <IsRequired>${field.isRequired}</IsRequired>\n`;
      }

      if (field.isChecksumField) {
        xml += `        <IsChecksumField>${field.isChecksumField}</IsChecksumField>\n`;
      }

      if (field.isLengthField) {
        xml += `        <IsLengthField>${field.isLengthField}</IsLengthField>\n`;
      }

      if (field.min !== undefined) {
        xml += `        <Min>${field.min}</Min>\n`;
      }

      if (field.max !== undefined) {
        xml += `        <Max>${field.max}</Max>\n`;
      }

      if (field.scale !== undefined) {
        xml += `        <Scale>${field.scale}</Scale>\n`;
      }

      if (field.enumValues && field.enumValues.length > 0) {
        xml += "        <EnumValues>\n";
        for (const enumValue of field.enumValues) {
          xml += `          <EnumValue value="${enumValue.value}">\n`;
          xml += `            <Name>${escapeXml(enumValue.name)}</Name>\n`;
          if (enumValue.description) {
            xml += `            <Description>${escapeXml(
              enumValue.description
            )}</Description>\n`;
          }
          xml += "          </EnumValue>\n";
        }
        xml += "        </EnumValues>\n";
      }

      if (field.notes) {
        xml += `        <Notes>${escapeXml(field.notes)}</Notes>\n`;
      }

      xml += "      </Field>\n";
    }
    xml += "    </Fields>\n";

    xml += "  </Frame>\n";
  }

  xml += "</Frames>";
  return xml;
};

/**
 * 转义XML特殊字符
 * @param str 需要转义的字符串
 * @returns 转义后的字符串
 */
const escapeXml = (str: string): string => {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
};

/**
 * 从XML导入帧定义
 * @param xmlString XML字符串
 * @returns 帧定义数组
 */
export const importFramesFromXml = (xmlString: string): FrameDefinition[] => {
  // 注意: 实际应用中需要更健壮的XML解析
  throw new Error("暂未实现从XML导入帧定义功能");
};
