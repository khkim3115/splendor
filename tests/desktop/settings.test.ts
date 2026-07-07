import { afterEach, describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const require = createRequire(import.meta.url)
const { readSettings, writeSettings, DEFAULTS } = require('../../desktop/lib/settings.cjs') as {
  readSettings: (d: string) => Record<string, unknown>
  writeSettings: (d: string, p: Record<string, unknown>) => Record<string, unknown>
  DEFAULTS: Record<string, unknown>
}

const dirs: string[] = []
function tmpDir() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'splendor-settings-'))
  dirs.push(d)
  return d
}
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true })
})

describe('settings', () => {
  it('파일이 없으면 기본값을 반환', () => {
    expect(readSettings(tmpDir())).toEqual(DEFAULTS)
  })
  it('patch 를 저장하고 다시 읽으면 병합된다', () => {
    const d = tmpDir()
    writeSettings(d, { theme: 'light', opacity: 55 })
    const s = readSettings(d)
    expect(s.theme).toBe('light')
    expect(s.opacity).toBe(55)
    expect(s.bossKey).toBe('CommandOrControl+Alt+Space') // 기본값 유지
  })
  it('손상된 JSON 은 기본값으로 폴백', () => {
    const d = tmpDir()
    fs.writeFileSync(path.join(d, 'settings.json'), '{ not json', 'utf8')
    expect(readSettings(d)).toEqual(DEFAULTS)
  })
})
