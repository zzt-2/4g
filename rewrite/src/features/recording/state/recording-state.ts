// 录制状态容器(仿 storage-highspeed-state.ts)。immutable snapshot + setter,
// 状态在全局(service 持有),组件卸载不影响录制(解决诉求①:切路由不中断)。
import type { RecordingState, RecordingStats } from '../core'

export interface RecordingStateContainer {
  getSnapshot(): RecordingState
  setRecording(on: boolean): RecordingState
  setRecordCount(count: number): RecordingState
  setStats(stats: RecordingStats | null): RecordingState
  reset(): RecordingState
}

export function createRecordingState(): RecordingStateContainer {
  let isRecording = false
  let recordCount = 0
  let sessionStartTime: number | null = null
  let stats: RecordingStats | null = null

  const snapshot = (): RecordingState => ({
    isRecording,
    recordCount,
    sessionStartTime,
    stats: stats ? { ...stats } : null,
  })

  return {
    getSnapshot: snapshot,
    setRecording(on) {
      isRecording = on
      // 首次开录记起始时间;停止清零(下次开录重新计时 + 计数)。
      if (on && sessionStartTime === null) sessionStartTime = Date.now()
      if (!on) {
        sessionStartTime = null
        recordCount = 0
      }
      return snapshot()
    },
    setRecordCount(count) {
      recordCount = count
      return snapshot()
    },
    setStats(next) {
      stats = next
      return snapshot()
    },
    reset() {
      isRecording = false
      recordCount = 0
      sessionStartTime = null
      stats = null
      return snapshot()
    },
  }
}
