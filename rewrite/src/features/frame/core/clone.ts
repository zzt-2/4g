import type {
  ExpressionDefinition,
  FrameAsset,
  FrameFieldDefinition,
  FrameOptionDefinition,
  IdentifierRule,
  ReadonlyDeep,
  ReadonlyFrameAsset,
  ReadonlyFrameFieldDefinition,
} from './types';

export function cloneExpressionDefinition(expression: ReadonlyDeep<ExpressionDefinition>): ExpressionDefinition {
  return {
    expressions: expression.expressions.map((item) => ({ ...item })),
    variables: expression.variables.map((item) => ({ ...item })),
  };
}

export function cloneFrameOption(option: ReadonlyDeep<FrameOptionDefinition>): FrameOptionDefinition {
  return { ...option };
}

export function cloneFrameField(field: ReadonlyFrameFieldDefinition): FrameFieldDefinition {
  return {
    ...field,
    options: field.options.map(cloneFrameOption),
    ...(field.validOption ? { validOption: { ...field.validOption } } : {}),
    ...(field.expressionConfig
      ? { expressionConfig: cloneExpressionDefinition(field.expressionConfig) }
      : {}),
  };
}

function cloneIdentifierRules(rules: readonly ReadonlyDeep<IdentifierRule>[]): IdentifierRule[] {
  return rules.map((rule) => ({ ...rule }));
}

export function cloneFrameAsset(frame: ReadonlyFrameAsset): FrameAsset {
  return {
    ...frame,
    fields: frame.fields.map(cloneFrameField),
    ...(frame.options ? { options: { ...frame.options } } : {}),
    ...(frame.identifierRules ? { identifierRules: cloneIdentifierRules(frame.identifierRules) } : {}),
  };
}

export function cloneFrameAssets(frames: readonly ReadonlyFrameAsset[]): FrameAsset[] {
  return frames.map(cloneFrameAsset);
}
