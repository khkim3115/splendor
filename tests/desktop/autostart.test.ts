import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { loginItemArgs, startsHidden } = require('../../desktop/lib/autostart.cjs') as {
  loginItemArgs: (hidden: boolean) => { openAtLogin: boolean; openAsHidden: boolean; args: string[] }
  startsHidden: (argv: string[]) => boolean
}

describe('autostart', () => {
  it('자동실행 ON: openAtLogin·openAsHidden·--hidden 인자', () => {
    expect(loginItemArgs(true)).toEqual({
      openAtLogin: true,
      openAsHidden: true,
      args: ['--hidden'],
    })
  })
  it('자동실행 OFF', () => {
    expect(loginItemArgs(false)).toEqual({
      openAtLogin: false,
      openAsHidden: false,
      args: [],
    })
  })
  it('startsHidden: --hidden 이 argv 에 있으면 true', () => {
    expect(startsHidden(['electron', '.', '--hidden'])).toBe(true)
    expect(startsHidden(['electron', '.'])).toBe(false)
  })
})
