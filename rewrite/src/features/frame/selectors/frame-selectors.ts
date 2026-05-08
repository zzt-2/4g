import {
  cloneFrameAsset,
  type FrameDirection,
  type FrameFieldDefinition,
  type ReadonlyFrameAsset,
} from '../core';

export interface FrameAssetSnapshot {
  readonly frames: readonly ReadonlyFrameAsset[];
  readonly selectedFrameId?: string;
}

export type FrameAssetSource = FrameAssetSnapshot | readonly ReadonlyFrameAsset[];

export interface FrameAssetQuery {
  readonly query?: string;
  readonly direction?: FrameDirection;
  readonly favoriteOnly?: boolean;
}

export interface FrameAssetSummary {
  readonly id: string;
  readonly name: string;
  readonly direction: FrameDirection;
  readonly fieldCount: number;
  readonly description?: string;
  readonly frameType?: string;
  readonly protocol?: string;
  readonly isFavorite: boolean;
}

export interface FrameReferenceOption {
  readonly value: string;
  readonly label: string;
  readonly direction: FrameDirection;
  readonly fieldCount: number;
  readonly isFavorite: boolean;
}

export interface FrameFieldReference {
  readonly frameId: string;
  readonly frameName: string;
  readonly direction: FrameDirection;
  readonly fieldId: string;
  readonly fieldName: string;
  readonly dataType: FrameFieldDefinition['dataType'];
  readonly inputType: FrameFieldDefinition['inputType'];
  readonly dataParticipationType: FrameFieldDefinition['dataParticipationType'];
}

export interface FrameFieldReferenceQuery {
  readonly frameId?: string;
  readonly direction?: FrameDirection;
}

function getFrames(source: FrameAssetSource): readonly ReadonlyFrameAsset[] {
  return Array.isArray(source) ? source : source.frames;
}

function getSelectedFrameId(source: FrameAssetSource): string | undefined {
  return Array.isArray(source) ? undefined : source.selectedFrameId;
}

function normalizeQuery(query: string | undefined): string {
  return query?.trim().toLowerCase() ?? '';
}

function matchesQuery(frame: ReadonlyFrameAsset, query: FrameAssetQuery | undefined): boolean {
  if (query?.direction && frame.direction !== query.direction) {
    return false;
  }

  if (query?.favoriteOnly && frame.isFavorite !== true) {
    return false;
  }

  const text = normalizeQuery(query?.query);
  if (!text) {
    return true;
  }

  return [
    frame.id,
    frame.name,
    frame.description,
    frame.frameType,
    frame.protocol,
  ].some((value) => value?.toLowerCase().includes(text));
}

function toSummary(frame: ReadonlyFrameAsset): FrameAssetSummary {
  return {
    id: frame.id,
    name: frame.name,
    direction: frame.direction,
    fieldCount: frame.fields.length,
    description: frame.description,
    frameType: frame.frameType,
    protocol: frame.protocol,
    isFavorite: frame.isFavorite === true,
  };
}

export function listFrameAssetSummaries(
  source: FrameAssetSource,
  query?: FrameAssetQuery,
): FrameAssetSummary[] {
  return getFrames(source).filter((frame) => matchesQuery(frame, query)).map(toSummary);
}

export function findFrameAssets(
  source: FrameAssetSource,
  query?: FrameAssetQuery,
): ReadonlyFrameAsset[] {
  return getFrames(source)
    .filter((frame) => matchesQuery(frame, query))
    .map(cloneFrameAsset);
}

export function getFrameAsset(
  source: FrameAssetSource,
  frameId: string,
): ReadonlyFrameAsset | undefined {
  const frame = getFrames(source).find((item) => item.id === frameId);
  return frame ? cloneFrameAsset(frame) : undefined;
}

export function getSelectedFrameAsset(source: FrameAssetSource): ReadonlyFrameAsset | undefined {
  const selectedFrameId = getSelectedFrameId(source);
  return selectedFrameId ? getFrameAsset(source, selectedFrameId) : undefined;
}

export function selectFrameReferenceOptions(
  source: FrameAssetSource,
  query?: FrameAssetQuery,
): FrameReferenceOption[] {
  return getFrames(source)
    .filter((frame) => matchesQuery(frame, query))
    .map((frame) => ({
      value: frame.id,
      label: frame.name,
      direction: frame.direction,
      fieldCount: frame.fields.length,
      isFavorite: frame.isFavorite === true,
    }));
}

export function selectFieldReferenceOptions(
  source: FrameAssetSource,
  query: FrameFieldReferenceQuery = {},
): FrameFieldReference[] {
  return getFrames(source)
    .filter((frame) => {
      if (query.frameId && frame.id !== query.frameId) {
        return false;
      }

      return query.direction ? frame.direction === query.direction : true;
    })
    .flatMap((frame) =>
      frame.fields.map((field) => ({
        frameId: frame.id,
        frameName: frame.name,
        direction: frame.direction,
        fieldId: field.id,
        fieldName: field.name,
        dataType: field.dataType,
        inputType: field.inputType,
        dataParticipationType: field.dataParticipationType,
      })),
    );
}
