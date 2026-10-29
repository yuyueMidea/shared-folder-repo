export interface LangOption {
  id: string
  label: string
  exts: string[]
}

export const LANGUAGES: LangOption[] = [
  { id: 'plaintext', label: '纯文本', exts: ['txt', 'log'] },
  { id: 'javascript', label: 'JavaScript', exts: ['js', 'mjs', 'cjs', 'jsx'] },
  { id: 'typescript', label: 'TypeScript', exts: ['ts', 'tsx', 'mts', 'cts'] },
  { id: 'json', label: 'JSON', exts: ['json', 'jsonc', 'map'] },
  { id: 'html', label: 'HTML / Vue', exts: ['html', 'htm', 'vue', 'svelte'] },
  { id: 'css', label: 'CSS', exts: ['css'] },
  { id: 'scss', label: 'SCSS', exts: ['scss'] },
  { id: 'less', label: 'Less', exts: ['less'] },
  { id: 'markdown', label: 'Markdown', exts: ['md', 'markdown'] },
  { id: 'yaml', label: 'YAML', exts: ['yml', 'yaml'] },
  { id: 'xml', label: 'XML', exts: ['xml', 'svg', 'xsd'] },
  { id: 'sql', label: 'SQL', exts: ['sql'] },
  { id: 'python', label: 'Python', exts: ['py'] },
  { id: 'java', label: 'Java', exts: ['java'] },
  { id: 'kotlin', label: 'Kotlin', exts: ['kt', 'kts'] },
  { id: 'go', label: 'Go', exts: ['go'] },
  { id: 'rust', label: 'Rust', exts: ['rs'] },
  { id: 'c', label: 'C', exts: ['c', 'h'] },
  { id: 'cpp', label: 'C++', exts: ['cpp', 'cc', 'cxx', 'hpp'] },
  { id: 'csharp', label: 'C#', exts: ['cs'] },
  { id: 'php', label: 'PHP', exts: ['php'] },
  { id: 'ruby', label: 'Ruby', exts: ['rb'] },
  { id: 'swift', label: 'Swift', exts: ['swift'] },
  { id: 'shell', label: 'Shell', exts: ['sh', 'bash', 'zsh'] },
  { id: 'powershell', label: 'PowerShell', exts: ['ps1'] },
  { id: 'dockerfile', label: 'Dockerfile', exts: ['dockerfile'] },
  { id: 'ini', label: 'INI / Config', exts: ['ini', 'conf', 'env', 'toml'] }
]

/** 根据文件名推断语言，无法识别时返回 null */
export function detectLanguage(filename: string): string | null {
  const lower = filename.toLowerCase()
  if (lower === 'dockerfile') return 'dockerfile'
  const ext = lower.includes('.') ? lower.split('.').pop()! : ''
  return LANGUAGES.find((l) => l.exts.includes(ext))?.id ?? null
}
