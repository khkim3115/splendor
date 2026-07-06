import { expect, test } from '@playwright/test'

// M8 배포 경로 회귀망 (docs/ROADMAP.md M8).
// 프로덕션 빌드를 vite preview(base '/splendor/')로 서빙하고, 전원 AI(쉬움)로
// 한 판을 자동 완주시킨 뒤 window.__splendorAi 진단으로 Web Worker가 base 경로에서
// 실제 로드됐는지(그리디 폴백이 아닌지)를 확인한다.

declare global {
  interface Window {
    __splendorAi?: {
      workerCreated: boolean
      lastAlgo: 'greedy1' | 'greedy2' | 'mcts' | 'fallback' | null
      responses: number
      fallbacks: number
      setDelayScale: (scale: number) => void
    }
  }
}

test('전원 AI(쉬움) 게임이 완주하고 Worker가 base 경로에서 로드된다', async ({ page }) => {
  // base 경로를 명시(배포 대상 정적 호스트와 동일한 진입 — preview의 '/' 리다이렉트에 의존하지 않음)
  await page.goto('/splendor/')

  // 셋업 화면 도착 확인
  await expect(page.getByRole('heading', { name: '스플랜더' })).toBeVisible()

  // 체감 지연 제거 — 스모크를 수 초 내로 완주시킨다 (게임 로직에는 무영향)
  await page.waitForFunction(() => !!window.__splendorAi)
  await page.evaluate(() => window.__splendorAi?.setDelayScale(0))

  // 두 자리를 모두 AI(쉬움)로 — 사람 입력 없이 자동 진행
  await page.getByLabel('1번 자리 종류').selectOption('easy')
  await page.getByLabel('2번 자리 종류').selectOption('easy')
  // 시드 고정 — 재현 가능
  await page.getByLabel('시드 (선택)').fill('777')

  await page.getByRole('button', { name: '게임 시작' }).click()

  // 결과 화면까지 자동 완주 (AI가 서로 대전)
  await expect(page.getByRole('heading', { name: '게임 종료' })).toBeVisible({ timeout: 90_000 })

  // Worker 로드 검증: 폴백이 아니어야 한다 (M8 핵심 리스크)
  const d = await page.evaluate(() => {
    const s = window.__splendorAi
    return s
      ? {
          workerCreated: s.workerCreated,
          lastAlgo: s.lastAlgo,
          responses: s.responses,
          fallbacks: s.fallbacks,
        }
      : null
  })

  expect(d, '__splendorAi 진단이 노출돼야 한다').not.toBeNull()
  expect(d!.workerCreated, 'new Worker(base 경로) 생성 성공').toBe(true)
  expect(d!.responses, 'Worker에서 응답을 받아야 한다').toBeGreaterThan(0)
  expect(d!.fallbacks, '그리디 폴백이 발생하지 않아야 한다').toBe(0)
  expect(d!.lastAlgo, '마지막 수는 Worker의 greedy1(쉬움)').toBe('greedy1')
})
