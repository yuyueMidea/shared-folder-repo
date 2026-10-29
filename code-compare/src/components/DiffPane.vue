<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type * as Monaco from 'monaco-editor'
import { loadMonaco, themeId } from '../monaco/loader'
import type { DiffStats, Side, ThemeName } from '../types'

const props = defineProps<{
  language: string
  theme: ThemeName
  sideBySide: boolean
  ignoreTrim: boolean
  wordWrap: boolean
  collapseUnchanged: boolean
  fontSize: number
}>()

const original = defineModel<string>('original', { required: true })
const modified = defineModel<string>('modified', { required: true })

const emit = defineEmits<{
  stats: [stats: DiffStats]
  dropFiles: [files: File[], side: Side]
}>()

const stage = ref<HTMLDivElement>()
const host = ref<HTMLDivElement>()
const ready = ref(false)
const loadError = ref('')
const dragSide = ref<Side | null>(null)

let monaco: typeof Monaco | undefined
let editor: Monaco.editor.IStandaloneDiffEditor | undefined
let originalModel: Monaco.editor.ITextModel | undefined
let modifiedModel: Monaco.editor.ITextModel | undefined
let disposed = false

function dynamicOptions(): Monaco.editor.IDiffEditorOptions {
  return {
    renderSideBySide: props.sideBySide,
    ignoreTrimWhitespace: props.ignoreTrim,
    wordWrap: props.wordWrap ? 'on' : 'off',
    fontSize: props.fontSize,
    hideUnchangedRegions: {
      enabled: props.collapseUnchanged,
      contextLineCount: 3,
      minimumLineCount: 4,
      revealLineCount: 20
    }
  }
}

function emitStats() {
  const changes = editor?.getLineChanges() ?? []
  let added = 0
  let removed = 0
  for (const c of changes) {
    if (c.modifiedEndLineNumber > 0) added += c.modifiedEndLineNumber - c.modifiedStartLineNumber + 1
    if (c.originalEndLineNumber > 0) removed += c.originalEndLineNumber - c.originalStartLineNumber + 1
  }
  emit('stats', { changes: changes.length, added, removed })
}

onMounted(async () => {
  try {
    const m = await loadMonaco()
    if (disposed || !host.value) return
    monaco = m

    originalModel = m.editor.createModel(original.value, props.language)
    modifiedModel = m.editor.createModel(modified.value, props.language)

    editor = m.editor.createDiffEditor(host.value, {
      ...dynamicOptions(),
      theme: themeId(props.theme),
      automaticLayout: true,
      originalEditable: true,
      enableSplitViewResizing: true,
      renderOverviewRuler: true,
      renderIndicators: true,
      renderMarginRevertIcon: true,
      diffAlgorithm: 'advanced',
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, "PingFang SC", "Microsoft YaHei", monospace',
      fontLigatures: false,
      padding: { top: 8, bottom: 8 }
    })
    editor.setModel({ original: originalModel, modified: modifiedModel })

    // 编辑器 -> 外部状态
    originalModel.onDidChangeContent(() => {
      const v = originalModel!.getValue()
      if (v !== original.value) original.value = v
    })
    modifiedModel.onDidChangeContent(() => {
      const v = modifiedModel!.getValue()
      if (v !== modified.value) modified.value = v
    })

    editor.onDidUpdateDiff(emitStats)
    ready.value = true
    emitStats()
  } catch (err) {
    console.error(err)
    loadError.value = '编辑器加载失败，请刷新页面重试。'
  }
})

// 外部状态 -> 编辑器（导入文件、交换、清空等）
watch(original, (v) => {
  if (originalModel && originalModel.getValue() !== v) originalModel.setValue(v)
})
watch(modified, (v) => {
  if (modifiedModel && modifiedModel.getValue() !== v) modifiedModel.setValue(v)
})

watch(
  () => props.language,
  (lang) => {
    if (!monaco) return
    if (originalModel) monaco.editor.setModelLanguage(originalModel, lang)
    if (modifiedModel) monaco.editor.setModelLanguage(modifiedModel, lang)
  }
)

watch(
  () => props.theme,
  (t) => monaco?.editor.setTheme(themeId(t))
)

watch(
  () => [props.sideBySide, props.ignoreTrim, props.wordWrap, props.fontSize, props.collapseUnchanged],
  () => editor?.updateOptions(dynamicOptions())
)

onBeforeUnmount(() => {
  disposed = true
  editor?.dispose()
  originalModel?.dispose()
  modifiedModel?.dispose()
})

// ---- 拖拽文件导入 ----
function hasFiles(e: DragEvent) {
  return !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')
}

function sideFromEvent(e: DragEvent): Side {
  if (!props.sideBySide || !stage.value) return 'modified'
  const rect = stage.value.getBoundingClientRect()
  return e.clientX < rect.left + rect.width / 2 ? 'original' : 'modified'
}

function onDragOver(e: DragEvent) {
  if (!hasFiles(e)) return
  e.preventDefault()
  e.stopPropagation()
  dragSide.value = sideFromEvent(e)
}

function onDragLeave(e: DragEvent) {
  if (!stage.value?.contains(e.relatedTarget as Node | null)) dragSide.value = null
}

function onDrop(e: DragEvent) {
  if (!hasFiles(e)) return
  e.preventDefault()
  e.stopPropagation()
  const side = sideFromEvent(e)
  dragSide.value = null
  const files = Array.from(e.dataTransfer?.files ?? [])
  if (files.length) emit('dropFiles', files, side)
}

defineExpose({
  goToDiff: (target: 'next' | 'previous') => {
    editor?.goToDiff(target)
    editor?.focus()
  }
})
</script>

<template>
  <div
    ref="stage"
    class="stage"
    @dragover.capture="onDragOver"
    @dragleave="onDragLeave"
    @drop.capture="onDrop"
  >
    <div ref="host" class="host" />
    <div v-if="!ready" class="loading" role="status">
      {{ loadError || '正在加载编辑器…' }}
    </div>
    <div v-if="dragSide" class="drop" aria-hidden="true">
      <template v-if="sideBySide">
        <span :class="{ hot: dragSide === 'original' }">松开，导入到左侧</span>
        <span :class="{ hot: dragSide === 'modified' }">松开，导入到右侧</span>
      </template>
      <span v-else class="hot">松开，导入到修改后</span>
    </div>
  </div>
</template>
