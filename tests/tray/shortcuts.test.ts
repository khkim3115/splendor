import { describe, expect, it } from 'vitest'
import { resolveShortcut, type ShortcutContext } from '../../src/tray/shortcuts'

const gameCtx = (over: Partial<ShortcutContext> = {}): ShortcutContext => ({
  popoverOpen: false, screen: 'game', phase: 'play', myTurn: true,
  passOnly: false, undoable: false, hasPending: false, ...over,
})

describe('resolveShortcut', () => {
  it('Esc: 팝오버 열림이면 닫기, 아니면 숨기기', () => {
    expect(resolveShortcut({ key: 'Escape', hasModifier: false }, gameCtx({ popoverOpen: true })))
      .toEqual({ type: 'closePopover' })
    expect(resolveShortcut({ key: 'Escape', hasModifier: false }, gameCtx({ popoverOpen: false })))
      .toEqual({ type: 'hide' })
  })
  it('수식키 조합은 무시(Esc 제외)', () => {
    expect(resolveShortcut({ key: 'b', hasModifier: true }, gameCtx())).toEqual({ type: 'none' })
  })
  it('게임 화면 밖에서는 조작 단축키 없음', () => {
    expect(resolveShortcut({ key: 'b', hasModifier: false }, gameCtx({ screen: 'setup' })))
      .toEqual({ type: 'none' })
  })
  it('B/O/N → 펼침 토글(대소문자 무시)', () => {
    expect(resolveShortcut({ key: 'b', hasModifier: false }, gameCtx())).toEqual({ type: 'toggleExpand', panel: 'board' })
    expect(resolveShortcut({ key: 'O', hasModifier: false }, gameCtx())).toEqual({ type: 'toggleExpand', panel: 'opponents' })
    expect(resolveShortcut({ key: 'n', hasModifier: false }, gameCtx())).toEqual({ type: 'toggleExpand', panel: 'nobles' })
  })
  it('L → 언어 전환', () => {
    expect(resolveShortcut({ key: 'l', hasModifier: false }, gameCtx())).toEqual({ type: 'toggleLang' })
  })
  it('U → 무르기(가능할 때만)', () => {
    expect(resolveShortcut({ key: 'u', hasModifier: false }, gameCtx({ undoable: true }))).toEqual({ type: 'undo' })
    expect(resolveShortcut({ key: 'u', hasModifier: false }, gameCtx({ undoable: false }))).toEqual({ type: 'none' })
  })
  it('Enter → 대기 집기 확정(있을 때만)', () => {
    expect(resolveShortcut({ key: 'Enter', hasModifier: false }, gameCtx({ hasPending: true }))).toEqual({ type: 'confirm' })
    expect(resolveShortcut({ key: 'Enter', hasModifier: false }, gameCtx({ hasPending: false }))).toEqual({ type: 'none' })
  })
  it('P → 패스(내 차례·패스만 가능할 때)', () => {
    expect(resolveShortcut({ key: 'p', hasModifier: false }, gameCtx({ passOnly: true }))).toEqual({ type: 'pass' })
    expect(resolveShortcut({ key: 'p', hasModifier: false }, gameCtx({ passOnly: false }))).toEqual({ type: 'none' })
    expect(resolveShortcut({ key: 'p', hasModifier: false }, gameCtx({ passOnly: true, myTurn: false }))).toEqual({ type: 'none' })
  })
  it('1..5 → 토큰 집기 인덱스(내 차례·play 페이즈)', () => {
    expect(resolveShortcut({ key: '1', hasModifier: false }, gameCtx())).toEqual({ type: 'pick', index: 0 })
    expect(resolveShortcut({ key: '5', hasModifier: false }, gameCtx())).toEqual({ type: 'pick', index: 4 })
    expect(resolveShortcut({ key: '1', hasModifier: false }, gameCtx({ phase: 'discard' }))).toEqual({ type: 'none' })
    expect(resolveShortcut({ key: '1', hasModifier: false }, gameCtx({ myTurn: false }))).toEqual({ type: 'none' })
  })
  it('매핑 없는 키 → none', () => {
    expect(resolveShortcut({ key: 'z', hasModifier: false }, gameCtx())).toEqual({ type: 'none' })
  })
})
