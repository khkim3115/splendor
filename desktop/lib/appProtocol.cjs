'use strict'
const path = require('path')

/**
 * app:// 요청 URL 을 dist 내부 절대 파일 경로로 해석한다(순수 함수).
 * - 'app://splendor/' 루트 → tray.html
 * - 쿼리·해시 제거, URL 디코딩
 * - distRoot 밖으로 탈출(.. / %2e%2e / 인코딩 슬래시)하면 { notFound: true }
 *
 * 보안 주의: WHATWG `new URL('app://…')` 은 표준 스킴이라 `pathname` 에서
 * `..` 세그먼트를 authority 기준으로 이미 정규화(collapse)해버린다
 * (예: 'app://splendor/../secret' → pathname '/secret'). 따라서 파서에
 * 의존해 탈출을 막을 수 없다. raw(디코딩 전) 경로에서 쿼리·해시만 잘라내고,
 * 디코딩 후 각 세그먼트를 직접 검사해 '..'(및 인코딩 변형)을 거부한다.
 * 최종적으로 정규화된 절대경로가 distRoot 내부인지 재확인한다(이중 방어).
 *
 * @param {string} url
 * @param {string} distRoot 절대 경로
 * @returns {{filePath: string} | {notFound: true}}
 */
function resolveAppRequest(url, distRoot) {
  if (typeof url !== 'string') return { notFound: true }

  // app://splendor/<path>?query#hash 에서 host 뒤 raw 경로만 취한다.
  // URL.pathname 은 '..' 을 정규화하므로 정규식으로 직접 추출한다.
  const m = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^/]*(\/[^?#]*)?/.exec(url)
  if (!m) return { notFound: true }
  let rawPath = m[1] || '/' // 경로 없으면 루트

  let decoded
  try {
    decoded = decodeURIComponent(rawPath)
  } catch {
    return { notFound: true } // 잘못된 % 인코딩
  }

  const rel = decoded.replace(/^\/+/, '')

  // 세그먼트 단위 탈출 검사 — 디코딩 후 '..'(또는 '.') 세그먼트가 있으면 거부.
  // 백슬래시도 경로 구분자로 취급(Windows)해 우회를 막는다.
  const segments = rel.split(/[/\\]+/)
  if (segments.some((s) => s === '..' || s === '.')) {
    return { notFound: true }
  }

  const relPath = rel === '' || rel.endsWith('/') ? rel + 'tray.html' : rel
  const filePath = path.normalize(path.join(distRoot, relPath))

  // 이중 방어: 정규화된 절대경로가 distRoot 내부인지 재확인.
  const rootWithSep = distRoot.endsWith(path.sep) ? distRoot : distRoot + path.sep
  if (filePath !== distRoot && !filePath.startsWith(rootWithSep)) {
    return { notFound: true }
  }
  return { filePath }
}

module.exports = { resolveAppRequest }
