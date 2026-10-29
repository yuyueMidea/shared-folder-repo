import { reactive, watch } from 'vue'
import type { ThemeName } from '../types'
import { SAMPLE_MODIFIED, SAMPLE_ORIGINAL } from '../utils/samples'

export interface Settings {
  original: string
  modified: string
  language: string
  theme: ThemeName
  sideBySide: boolean
  ignoreTrim: boolean
  wordWrap: boolean
  collapseUnchanged: boolean
  fontSize: number
}

const KEY = 'codediff:v1'

function defaults(): Settings {
  const prefersLight = window.matchMedia?.('(prefers-color-scheme: light)').matches
  return {
    original: SAMPLE_ORIGINAL,
    modified: SAMPLE_MODIFIED,
    language: 'typescript',
    theme: prefersLight ? 'light' : 'dark',
    sideBySide: true,
    ignoreTrim: false,
    wordWrap: false,
    collapseUnchanged: false,
    fontSize: 14
  }
}

function load(): Settings {
  const base = defaults()
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...base, ...JSON.parse(raw) }
  } catch {
    /* 忽略损坏的本地数据 */
  }
  return base
}

/** 设置与两侧内容，自动防抖写入 localStorage */
export function useSettings() {
  const state = reactive<Settings>(load())
  let timer = 0

  watch(
    state,
    () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        try {
          localStorage.setItem(KEY, JSON.stringify(state))
        } catch {
          /* 容量不足或隐私模式：忽略 */
        }
      }, 400)
    },
    { deep: true }
  )

  return state
}
