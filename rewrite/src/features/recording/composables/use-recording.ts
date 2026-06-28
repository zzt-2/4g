// 录制 Vue composable:把全局 RecordingService 包成响应式状态供组件用。
// 状态在 service(全局),组件卸载只清 polling timer,不影响录制(治诉求①)。
// 计时靠 sessionStartTime 算相对值,polling 定时同步计数 + stats。
import { computed, onUnmounted, ref } from 'vue'
import type { RecordingService } from '../services/recording-service'

export function useRecording(service: RecordingService) {
  const snapshot = ref(service.getSnapshot())

  const sync = () => {
    snapshot.value = service.getSnapshot()
  }

  const isRecording = computed(() => snapshot.value.isRecording)
  const recordCount = computed(() => snapshot.value.recordCount)

  // 计时:基于 sessionStartTime 算相对时长(mm:ss / Ns / Nms)。polling 每秒刷新 snapshot
  // 触发重算,无需独立计时器。
  const recordElapsed = computed(() => {
    if (!snapshot.value.isRecording || !snapshot.value.sessionStartTime) return '--'
    const ms = Date.now() - snapshot.value.sessionStartTime
    if (ms < 1000) return `${ms}ms`
    if (ms < 60_000) return `${(ms / 1000).toFixed(0)}s`
    const m = Math.floor(ms / 60_000)
    const s = Math.floor((ms % 60_000) / 1000)
    return `${m}m ${s}s`
  })

  // 录制期间每秒轮询:同步内存计数 + 拉主进程磁盘 stats(供 UI 显示已存帧数/文件大小)。
  // polling 在组件卸载时停(切走页面),但录制本身在 service 全局继续——切回时
  // 重新 mount 的组件会用 service.getSnapshot() 拿到持续累积的计数(治诉求①)。
  let timer: ReturnType<typeof setInterval> | null = null
  function ensurePolling() {
    if (timer) return
    timer = setInterval(async () => {
      await service.refreshStats()
      sync()
    }, 1000)
  }
  function stopPolling() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  async function start() {
    await service.start()
    sync()
    ensurePolling()
  }
  async function stop() {
    await service.stop()
    stopPolling()
    sync()
  }

  onUnmounted(() => stopPolling())

  return { isRecording, recordCount, recordElapsed, start, stop }
}
