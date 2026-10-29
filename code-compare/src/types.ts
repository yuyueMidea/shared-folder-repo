export type Side = 'original' | 'modified'
export type ThemeName = 'dark' | 'light'

export interface DiffStats {
  changes: number
  added: number
  removed: number
}
