import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const pkg = require('../../desktop/package.json') as {
  build: {
    files?: string[]
    nsis?: { artifactName?: string }
    dmg?: { artifactName?: string }
  }
}
const rootPkg = require('../../package.json') as {
  scripts?: Record<string, string>
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

describe('desktop/package.json build.files 완전성 (C1 — bosskey-preload.js 누락 시 보스키 변경 다이얼로그가 패키지 빌드에서 죽는다)', () => {
  it("build.files 에 'bosskey-preload.js' 가 포함되어야 한다 (main.js 가 BrowserWindow preload 로 참조)", () => {
    expect(pkg.build.files).toContain('bosskey-preload.js')
  })
})

describe('root package.json build:desktop 상대 base 가드 (I1 — app://splendor/tray.html 은 절대 /splendor/ 경로에서 404)', () => {
  it('build:desktop 스크립트는 상대 base(--base=./) 플래그를 포함해야 한다', () => {
    const script = rootPkg.scripts?.['build:desktop'] ?? ''
    expect(script).toMatch(/--base[=\s]\.\//)
  })
})
