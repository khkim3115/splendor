'use strict'
// electron-builder afterPack 훅: mac 에서 ad-hoc 서명(codesign -s -). win/기타는 no-op.
// 유료 Apple 개발자 인증서 없이 배포하기 위한 방편 — 서명은 되어 있으나(코드 무결성
// 체크섬) 신원 인증은 아니므로 사용자는 최초 실행 시 "무시하고 열기" 를 눌러야 한다.
const { execFileSync } = require('child_process')
const path = require('path')

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin') return
  const appName = context.packager.appInfo.productFilename + '.app'
  const appPath = path.join(context.appOutDir, appName)
  execFileSync('codesign', ['--deep', '--force', '-s', '-', appPath], { stdio: 'inherit' })
  console.log('ad-hoc 서명 완료:', appPath)
}
