import { ref } from 'vue';

export function useTaskReport() {
  const isReporting = ref(false);
  const showReportDialog = ref(false);

  function reportTasks(): Promise<void> {
    throw new Error('Not implemented');
  }

  return {
    isReporting,
    showReportDialog,
    reportTasks,
  };
}
