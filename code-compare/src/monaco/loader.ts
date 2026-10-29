import type * as Monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'

let cached: Promise<typeof Monaco> | null = null

/**
 * 懒加载 Monaco：
 * - 只引入编辑器核心 + 各语言的语法高亮（Monarch），不加载 TS/JSON/HTML 语言服务，
 *   因此对比代码片段时不会出现误报的红色波浪线，体积也更小。
 * - 因此只需要一个通用 editor.worker。
 */
export function loadMonaco(): Promise<typeof Monaco> {
  cached ??= (async () => {
    ;(self as unknown as { MonacoEnvironment: unknown }).MonacoEnvironment = {
      getWorker: () => new EditorWorker()
    }

    const [core] = await Promise.all([
      import('monaco-editor/esm/vs/editor/edcore.main'),
      import('monaco-editor/esm/vs/basic-languages/monaco.contribution'),
      // 字体需先就绪，否则 Monaco 会按回退字体测量字符宽度
      document.fonts?.load('14px "JetBrains Mono"').catch(() => undefined)
    ])

    const monaco = core as unknown as typeof Monaco
    defineThemes(monaco)
    return monaco
  })()
  return cached
}

function defineThemes(monaco: typeof Monaco) {
  monaco.editor.defineTheme('codediff-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#12161b',
      'editor.foreground': '#d7dce3',
      'editorLineNumber.foreground': '#4a5360',
      'editorLineNumber.activeForeground': '#9aa4b2',
      'editor.lineHighlightBackground': '#1a2027',
      'editor.lineHighlightBorder': '#00000000',
      'editorGutter.background': '#12161b',
      'diffEditor.insertedLineBackground': '#3fb9501c',
      'diffEditor.insertedTextBackground': '#3fb95047',
      'diffEditor.removedLineBackground': '#f851491c',
      'diffEditor.removedTextBackground': '#f8514947',
      'diffEditor.diagonalFill': '#2a313b',
      'diffEditor.border': '#262d37',
      'diffEditorGutter.insertedLineBackground': '#3fb95038',
      'diffEditorGutter.removedLineBackground': '#f8514938',
      'editorOverviewRuler.border': '#00000000'
    }
  })

  monaco.editor.defineTheme('codediff-light', {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#fbfbf9',
      'editor.foreground': '#1d2128',
      'editorLineNumber.foreground': '#a0a7b1',
      'editorLineNumber.activeForeground': '#4b5563',
      'editor.lineHighlightBackground': '#f1f1ed',
      'editor.lineHighlightBorder': '#00000000',
      'editorGutter.background': '#fbfbf9',
      'diffEditor.insertedLineBackground': '#1a7f3716',
      'diffEditor.insertedTextBackground': '#1a7f3733',
      'diffEditor.removedLineBackground': '#cf222e14',
      'diffEditor.removedTextBackground': '#cf222e30',
      'diffEditor.diagonalFill': '#dcdde0',
      'diffEditor.border': '#d9dbdf',
      'diffEditorGutter.insertedLineBackground': '#1a7f3730',
      'diffEditorGutter.removedLineBackground': '#cf222e2c',
      'editorOverviewRuler.border': '#00000000'
    }
  })
}

export const themeId = (t: 'dark' | 'light') => (t === 'dark' ? 'codediff-dark' : 'codediff-light')
