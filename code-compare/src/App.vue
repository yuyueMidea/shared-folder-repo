<script setup lang="ts">
import { ref, watchEffect } from 'vue'
import { createTwoFilesPatch } from 'diff'
import DiffPane from './components/DiffPane.vue'
import { useSettings } from './composables/useSettings'
import type { DiffStats, Side } from './types'
import { LANGUAGES, detectLanguage } from './utils/languages'
import { SAMPLE_MODIFIED, SAMPLE_ORIGINAL } from './utils/samples'

const MAX_BYTES = 2 * 1024 * 1024
const s = useSettings()
const pane = ref<InstanceType<typeof DiffPane> | null>(null)
const stats = ref<DiffStats>({ changes: 0, added: 0, removed: 0 })
const notice = ref('')
const originalInput = ref<HTMLInputElement>()
const modifiedInput = ref<HTMLInputElement>()
let noticeTimer = 0

watchEffect(() => {
  document.documentElement.dataset.theme = s.theme
})

function flash(msg: string) {
  notice.value = msg
  window.clearTimeout(noticeTimer)
  noticeTimer = window.setTimeout(() => (notice.value = ''), 3500)
}

const sideLabel = (side: Side) => (side === 'original' ? '左侧' : '右侧')

async function importFile(side: Side, file: File) {
  if (file.size > MAX_BYTES) return flash(`文件超过 2 MB，未导入：${file.name}`)
  const text = await file.text()
  if (text.includes('\u0000')) return flash(`看起来不是文本文件，未导入：${file.name}`)
  s[side] = text
  const lang = detectLanguage(file.name)
  if (lang) s.language = lang
  flash(`已导入到${sideLabel(side)}：${file.name}`)
}

async function onPick(side: Side, e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) await importFile(side, file)
}

async function onDropFiles(files: File[], side: Side) {
  // 一次拖入两个文件：依次放到左、右
  if (files.length >= 2) {
    await importFile('original', files[0])
    await importFile('modified', files[1])
    return
  }
  await importFile(side, files[0])
}

function swap() {
  ;[s.original, s.modified] = [s.modified, s.original]
}

function clearAll() {
  if ((s.original || s.modified) && !confirm('将清空左右两侧的内容，确定吗？')) return
  s.original = ''
  s.modified = ''
}

function loadSample() {
  if ((s.original || s.modified) && !confirm('将用示例覆盖当前内容，确定吗？')) return
  s.original = SAMPLE_ORIGINAL
  s.modified = SAMPLE_MODIFIED
  s.language = 'typescript'
}

function bumpFont(delta: number) {
  s.fontSize = Math.min(24, Math.max(10, s.fontSize + delta))
}

function buildPatch() {
  return createTwoFilesPatch('original', 'modified', s.original, s.modified, '', '', { context: 3 })
}

async function copyPatch() {
  if (s.original === s.modified) return flash('两侧内容相同，没有差异可复制')
  try {
    await navigator.clipboard.writeText(buildPatch())
    flash('已复制补丁（unified diff）')
  } catch {
    flash('复制失败，请检查浏览器的剪贴板权限')
  }
}

function downloadPatch() {
  if (s.original === s.modified) return flash('两侧内容相同，没有差异可下载')
  const url = URL.createObjectURL(new Blob([buildPatch()], { type: 'text/x-diff;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'changes.patch'
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="app">
    <header class="bar">
      <h1>代码对比</h1>
      <div class="group">
        <label class="field">
          <span>语言</span>
          <select v-model="s.language">
            <option v-for="l in LANGUAGES" :key="l.id" :value="l.id">{{ l.label }}</option>
          </select>
        </label>
        <div class="seg" role="group" aria-label="视图模式">
          <button type="button" :class="{ on: s.sideBySide }" :aria-pressed="s.sideBySide" @click="s.sideBySide = true">并排</button>
          <button type="button" :class="{ on: !s.sideBySide }" :aria-pressed="!s.sideBySide" @click="s.sideBySide = false">行内</button>
        </div>
        <label class="check"><input v-model="s.ignoreTrim" type="checkbox" />忽略首尾空白</label>
        <label class="check"><input v-model="s.collapseUnchanged" type="checkbox" />折叠未改动区域</label>
        <label class="check"><input v-model="s.wordWrap" type="checkbox" />自动换行</label>
        <div class="stepper" role="group" aria-label="字号">
          <button type="button" class="btn" aria-label="减小字号" @click="bumpFont(-1)">A−</button>
          <span>{{ s.fontSize }}</span>
          <button type="button" class="btn" aria-label="增大字号" @click="bumpFont(1)">A+</button>
        </div>
        <button type="button" class="btn" @click="s.theme = s.theme === 'dark' ? 'light' : 'dark'">
          {{ s.theme === 'dark' ? '切换浅色' : '切换深色' }}
        </button>
      </div>
    </header>

    <div class="bar actions">
      <button type="button" class="btn" @click="originalInput?.click()">导入左侧</button>
      <button type="button" class="btn" @click="modifiedInput?.click()">导入右侧</button>
      <button type="button" class="btn" @click="swap">交换左右</button>
      <button type="button" class="btn" @click="clearAll">清空</button>
      <button type="button" class="btn" @click="loadSample">载入示例</button>
      <span class="sep" aria-hidden="true" />
      <button type="button" class="btn" :disabled="!stats.changes" @click="pane?.goToDiff('previous')">上一处差异</button>
      <button type="button" class="btn primary" :disabled="!stats.changes" @click="pane?.goToDiff('next')">下一处差异</button>
      <span class="sep" aria-hidden="true" />
      <button type="button" class="btn" @click="copyPatch">复制补丁</button>
      <button type="button" class="btn" @click="downloadPatch">下载补丁</button>

      <div class="stats" aria-live="polite">
        <span v-if="stats.changes">{{ stats.changes }} 处差异</span>
        <span v-else>没有差异</span>
        <span class="add">+{{ stats.added }}</span>
        <span class="del">−{{ stats.removed }}</span>
      </div>

      <input ref="originalInput" type="file" hidden @change="onPick('original', $event)" />
      <input ref="modifiedInput" type="file" hidden @change="onPick('modified', $event)" />
    </div>

    <DiffPane
      ref="pane"
      v-model:original="s.original"
      v-model:modified="s.modified"
      :language="s.language"
      :theme="s.theme"
      :side-by-side="s.sideBySide"
      :ignore-trim="s.ignoreTrim"
      :word-wrap="s.wordWrap"
      :collapse-unchanged="s.collapseUnchanged"
      :font-size="s.fontSize"
      @stats="stats = $event"
      @drop-files="onDropFiles"
    />

    <footer class="foot">
      <span class="hint">左右两侧都可直接编辑，也可把文件拖进来；F7 / Shift+F7 跳转差异。内容只保存在本机浏览器。</span>
      <span class="notice" role="status">{{ notice }}</span>
    </footer>
  </div>
</template>
