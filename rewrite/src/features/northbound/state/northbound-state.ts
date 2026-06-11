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
  // P2.1: customerTaskId (envelope.taskId / T_xxx) ↔ instanceId mapping.
  // testCaseResultReport must echo the customer-issued taskId, not the local instanceId.
  mapTaskId(instanceId: string, customerTaskId: string): void;
  getCustomerTaskId(instanceId: string): string | undefined;
  getInstanceIdByCustomerTaskId(customerTaskId: string): string | undefined;
  removeTaskIdMapping(instanceId: string): void;
  getSnapshot(): NorthboundSessionSnapshot;
  setServerRunning(running: boolean): void;
  clear(): void;
}

export function createNorthboundState(): NorthboundStateContainer {
  const testCaseToInstance = new Map<string, string>();
  const instanceToTestCase = new Map<string, string>();
  const instanceToCustomerTaskId = new Map<string, string>();
  const customerTaskIdToInstance = new Map<string, string>();
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

    mapTaskId(instanceId: string, customerTaskId: string): void {
      instanceToCustomerTaskId.set(instanceId, customerTaskId);
      customerTaskIdToInstance.set(customerTaskId, instanceId);
    },

    getCustomerTaskId(instanceId: string): string | undefined {
      return instanceToCustomerTaskId.get(instanceId);
    },

    getInstanceIdByCustomerTaskId(customerTaskId: string): string | undefined {
      return customerTaskIdToInstance.get(customerTaskId);
    },

    removeTaskIdMapping(instanceId: string): void {
      const customerTaskId = instanceToCustomerTaskId.get(instanceId);
      instanceToCustomerTaskId.delete(instanceId);
      if (customerTaskId) customerTaskIdToInstance.delete(customerTaskId);
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
      instanceToCustomerTaskId.clear();
      customerTaskIdToInstance.clear();
      serverRunning = false;
    },
  };
}
