# 턴(라운드) UI — 설계 문서

- **이슈**: #14 턴 UI 추가 — "몇 번째 턴인지 볼 수 있으면 좋을듯"
- **날짜**: 2026-07-07
- **범위**: 순수 UI 추가. 엔진·스토어·세이브 스키마 무변경.

## 목표

현재 라운드 번호를 `TurnBanner`에 표시해 플레이어가 게임 진행 정도를 인지할 수 있게 한다.
스크린리더 사용자도 라운드 전환을 인지할 수 있어야 한다.

## 확정된 설계 결정

| 열린 질문 | 결정 |
|---|---|
| 표기 단위 | `N라운드`만 표시 (순번 병기 없음 — YAGNI) |
| 낭독 범위 | (b) 배너 전용 `aria-live` — 기존 로그 낭독(`describeEvent`) 톤 보존 |
| 라운드 오프셋 | `Math.floor(turn / n) + 1` — 사용자에겐 1라운드부터 |
| 마지막 라운드 | 라운드 숫자 유지 + 기존 `마지막 라운드!` 배지 병기 |

## 라운드 파생 공식의 근거

- `setup.ts`: `turn: 0`, `currentPlayer: startPlayer`. 즉 `turn 0`은 항상 선 플레이어의 첫 수.
- `apply.ts` `finishTurn`: 매 수(PASS 포함)마다 `turn: state.turn + 1`.
- 따라서 `n = players.length`일 때 `turn 0..n-1`은 라운드 1, `turn n..2n-1`은 라운드 2.
- `roundNumber = Math.floor(turn / n) + 1`은 `startPlayer` 인덱스와 무관하게 성립한다
  (라운드 경계가 선 플레이어 기준으로 정의되고, `turn 0`이 선 플레이어이기 때문).
- PASS도 `finishTurn`을 거쳐 `turn`을 증가시키므로 라운드 카운트에 자연히 포함된다.

## 아키텍처

### 신규: `src/ui/round.ts` (순수 함수)

```ts
import type { GameState } from '../engine'

export function roundNumber(view: Pick<GameState, 'turn' | 'config'>): number {
  return Math.floor(view.turn / view.config.players.length) + 1
}
```

- React를 import하지 않아 jsdom 없이 단위 테스트 가능.
- 엔진(`engine/helpers.ts`)이 아니라 UI에 배치 → 엔진 커버리지 게이트(라인95·브랜치90)에 영향 없음, 계층 경계(engine에 UI 개념 유입 금지) 준수.

### 변경: `src/ui/components/common/TurnBanner.tsx`

라운드 span을 배너 맨 앞에 추가한다.

```tsx
<div className="turn-banner">
  <span className="turn-round" role="status" aria-live="polite" aria-atomic="true">
    {roundNumber(view)}라운드
  </span>
  <span className="turn-name">{name}님의 차례</span>
  {kind?.type === 'ai' && <AiThinkingBadge thinking={aiThinking} />}
  {view.finalRound && <span className="final-round-badge">마지막 라운드!</span>}
  {canUndo && (<button …>↩ 한 수 무르기</button>)}
</div>
```

- **낭독(b)**: 보이는 라운드 span 자체가 `role="status" aria-live="polite" aria-atomic="true"`.
  텍스트가 바뀔 때(라운드 증가)만 낭독. 이름만 바뀌는 매 턴엔 조용. 마운트 시(1라운드)엔 낭독 안 함(표준 aria-live 동작).
  기존 `Announcer`의 로그 낭독은 별도 영역이라 톤 보존.
- **마지막 라운드 병기**: 기존 `finalRound` 배지 로직 그대로 → 숫자 + 배지 동시 표시.

### 변경: `src/ui/styles.css`

- `.turn-round` 스타일 추가(라운드 숫자 강조).
- `.turn-banner`에 `flex-wrap: wrap` 추가 → 모바일 세로(≤480px)에서 가로 스크롤 방지.

## 데이터 흐름

`GameScreen` → `TurnBanner`(이미 `view` 전달 중). 추가 배선 없음.
`playerView` 마스킹은 `turn`·`config`를 건드리지 않으므로 라운드 계산에 영향 없음.

## 테스트

- **단위 (jsdom 불필요)** `tests/ui/round.test.ts`
  - `roundNumber` 경계값: 2·3·4인전 각각 `turn 0→1`, `turn n-1→1`, `turn n→2`, `turn 2n→3`.
  - PASS로 인한 turn 증가도 동일 공식 → turn 값 기반이라 자동 커버.
- **UI (jsdom)** `tests/ui/turnBanner.test.tsx`
  - 새 게임 직후 `1라운드` 표시.
  - 2인전 각자 1수 → `2라운드`로 갱신.
  - 라운드 span이 `role="status"`이며 텍스트에 `라운드` 포함(접근성).
- **모바일** `preview_resize` 480px에서 `.turn-banner` 페이지 가로 스크롤 없음.
- **회귀** 기존 `m7.test.tsx`·`tests/ui/fullGame.test.tsx` 스냅샷·골든 리플레이 무회귀.
  `fullGame` 스냅샷이 배너 DOM을 포함하면 스냅샷 갱신 필요 — 구현 시 확인.

## 완료 기준 (DoD)

- [ ] 새 게임 시작 직후 `TurnBanner`에 `1라운드` 표시.
- [ ] 전원 1수씩 두어 선 플레이어로 순번이 돌아오면 라운드 +1 (2·3·4인전 정확).
- [ ] 라운드 숫자는 `view.turn`·`view.config.players.length`에서만 파생, 엔진·스토어·세이브 스키마 무변경.
- [ ] 스크린리더 사용자가 턴 전환 시 현재 라운드 인지(배너 `aria-live`).
- [ ] 모바일 세로(≤480px)에서 배너가 가로 스크롤을 만들지 않고 라운드 텍스트가 잘리지 않음.
- [ ] 기존 M7 낭독·연출·모바일 테스트와 골든 리플레이 무회귀.
- [ ] `roundNumber` 파생 공식·라운드 표기·전환에 대한 신규 테스트 추가·통과.
- [ ] typecheck / lint(계층 경계) / 전체 테스트 / build 통과.

## YAGNI로 제외

- "이번 라운드 N번째 수" 병기
- 설정 토글(하드코딩 유지)
- 엔진에 라운드 필드 노출
