import type { SendRequest, SendBuildIssue } from './types';

export function validateSendRequest(request: SendRequest): SendBuildIssue[] {
  const issues: SendBuildIssue[] = [];

  if (!request.frameId) {
    issues.push({
      severity: 'error',
      code: 'send.request.missingFrameId',
      message: 'frameId is required.',
    });
  }

  if (!request.targetId) {
    issues.push({
      severity: 'error',
      code: 'send.request.missingTargetId',
      message: 'targetId is required.',
    });
  }

  if (!request.context?.source) {
    issues.push({
      severity: 'error',
      code: 'send.request.missingSource',
      message: 'context.source is required.',
    });
  }

  return issues;
}
