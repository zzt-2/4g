export interface NorthboundSessionSnapshot {
  readonly activeTestCases: ReadonlyMap<string, { readonly instanceId: string; readonly status: string }>;
  readonly serverRunning: boolean;
}

export interface NorthboundStateContainer {
  mapTestCase(testCaseId: string, instanceId: string): void;
  getInstanceId(testCaseId: string): string | undefined;
  getTestCaseId(instanceId: string): string | undefined;
  removeMapping(testCaseId: string): void;
  hasTestCase(testCaseId: string): boolean;
  getSnapshot(): NorthboundSessionSnapshot;
  setServerRunning(running: boolean): void;
  clear(): void;
}

export function createNorthboundState(): NorthboundStateContainer {
  const testCaseToInstance = new Map<string, string>();
  const instanceToTestCase = new Map<string, string>();
  let serverRunning = false;

  return {
    mapTestCase(testCaseId: string, instanceId: string): void {
      testCaseToInstance.set(testCaseId, instanceId);
      instanceToTestCase.set(instanceId, testCaseId);
    },

    getInstanceId(testCaseId: string): string | undefined {
      return testCaseToInstance.get(testCaseId);
    },

    getTestCaseId(instanceId: string): string | undefined {
      return instanceToTestCase.get(instanceId);
    },

    removeMapping(testCaseId: string): void {
      const instanceId = testCaseToInstance.get(testCaseId);
      testCaseToInstance.delete(testCaseId);
      if (instanceId) instanceToTestCase.delete(instanceId);
    },

    hasTestCase(testCaseId: string): boolean {
      return testCaseToInstance.has(testCaseId);
    },

    getSnapshot(): NorthboundSessionSnapshot {
      const activeTestCases = new Map<string, { readonly instanceId: string; readonly status: string }>();
      for (const [testCaseId, instanceId] of testCaseToInstance) {
        activeTestCases.set(testCaseId, { instanceId, status: 'active' });
      }
      return { activeTestCases, serverRunning };
    },

    setServerRunning(running: boolean): void {
      serverRunning = running;
    },

    clear(): void {
      testCaseToInstance.clear();
      instanceToTestCase.clear();
      serverRunning = false;
    },
  };
}
