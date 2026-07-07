import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const pkg = require('../../desktop/package.json') as {
  build: {
    nsis?: { artifactName?: string }
    dmg?: { artifactName?: string }
  }
}

describe('desktop/package.json build.artifactName 계약 (Task 10 CI · 웹 다운로드 링크)', () => {
  it('nsis.artifactName 은 고정된 버전 없는 파일명이어야 한다', () => {
    expect(pkg.build.nsis?.artifactName).toBe('Splendor-Tray-Setup.exe')
  })

  it('dmg.artifactName 은 고정된 버전 없는 파일명이어야 한다', () => {
    expect(pkg.build.dmg?.artifactName).toBe('Splendor-Tray.dmg')
  })

  it('artifactName 에 ${version} 플레이스홀더가 남아있지 않아야 한다', () => {
    expect(pkg.build.nsis?.artifactName).not.toContain('${version}')
    expect(pkg.build.dmg?.artifactName).not.toContain('${version}')
  })
})
