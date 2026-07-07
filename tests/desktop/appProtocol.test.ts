import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const { resolveAppRequest } = require('../../desktop/lib/appProtocol.cjs') as {
  resolveAppRequest: (
    url: string,
    distRoot: string,
  ) => { filePath: string } | { notFound: true }
}

// 플랫폼 절대경로(win: C:\dist, posix: /dist) 로 정규화 — path.join 비교가 OS 독립적이도록
const DIST = path.resolve('dist')

describe('resolveAppRequest', () => {
  it('루트("/")는 tray.html 로 매핑한다', () => {
    expect(resolveAppRequest('app://splendor/', DIST)).toEqual({
      filePath: path.join(DIST, 'tray.html'),
    })
  })

  it('tray.html 을 직접 요청하면 dist/tray.html', () => {
    expect(resolveAppRequest('app://splendor/tray.html', DIST)).toEqual({
      filePath: path.join(DIST, 'tray.html'),
    })
  })

  it('assets 하위 ESM 워커 청크를 서빙한다', () => {
    expect(resolveAppRequest('app://splendor/assets/worker-abc123.js', DIST)).toEqual({
      filePath: path.join(DIST, 'assets', 'worker-abc123.js'),
    })
  })

  it('쿼리스트링·해시를 제거한다', () => {
    expect(resolveAppRequest('app://splendor/assets/x.js?v=1#h', DIST)).toEqual({
      filePath: path.join(DIST, 'assets', 'x.js'),
    })
  })

  it('URL 인코딩된 경로를 디코딩한다', () => {
    expect(resolveAppRequest('app://splendor/assets/a%20b.js', DIST)).toEqual({
      filePath: path.join(DIST, 'assets', 'a b.js'),
    })
  })

  it('디렉터리 탈출(..)은 notFound', () => {
    expect(resolveAppRequest('app://splendor/../secret.txt', DIST)).toEqual({
      notFound: true,
    })
  })

  it('인코딩된 탈출(%2e%2e)도 notFound', () => {
    expect(resolveAppRequest('app://splendor/%2e%2e/secret.txt', DIST)).toEqual({
      notFound: true,
    })
  })

  it('중첩 탈출(a/b/../../../secret)도 notFound', () => {
    expect(resolveAppRequest('app://splendor/a/b/../../../secret.txt', DIST)).toEqual({
      notFound: true,
    })
  })

  it('백슬래시 탈출(..%5c)도 notFound', () => {
    expect(resolveAppRequest('app://splendor/..%5csecret.txt', DIST)).toEqual({
      notFound: true,
    })
  })

  it('잘못된 % 인코딩은 notFound', () => {
    expect(resolveAppRequest('app://splendor/%zz.js', DIST)).toEqual({
      notFound: true,
    })
  })

  it('중첩 assets 경로를 그대로 매핑한다', () => {
    expect(resolveAppRequest('app://splendor/assets/chunks/x-1.mjs', DIST)).toEqual({
      filePath: path.join(DIST, 'assets', 'chunks', 'x-1.mjs'),
    })
  })

  it('존재 여부는 검사하지 않는다 — 경로만 해석(부재 파일도 filePath 반환)', () => {
    // 실제 파일 부재는 net.fetch 가 404 로 처리(리졸버는 순수 경로 해석만).
    expect(resolveAppRequest('app://splendor/does-not-exist.js', DIST)).toEqual({
      filePath: path.join(DIST, 'does-not-exist.js'),
    })
  })
})
