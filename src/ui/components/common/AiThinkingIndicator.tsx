// AI 사고 인디케이터 (docs/ROADMAP.md M7 — 사고 인디케이터 폴리시).
// 점 애니메이션은 CSS에서 prefers-reduced-motion이면 자동으로 멈추므로 JS 게이트가 필요 없다.

/** 배너 안에 들어가는 인라인 배지 */
export function AiThinkingBadge({ thinking }: { thinking: boolean }) {
  return (
    <span className="ai-badge" aria-live="polite">
      <span aria-hidden="true">🤖</span>
      {thinking ? (
        <>
          <span>생각 중</span>
          <span className="thinking-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </>
      ) : (
        <span>AI</span>
      )}
    </span>
  )
}

/** AI 차례 동안 보드 위에 떠서 "지금 AI가 두는 중"임을 알리는 오버레이 */
export function AiThinkingOverlay({ name }: { name: string }) {
  return (
    <div className="ai-thinking-overlay" role="status" aria-live="polite">
      <span className="ai-thinking-chip">
        <span aria-hidden="true">🤖</span>
        {name}이(가) 수를 두는 중
        <span className="thinking-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </span>
    </div>
  )
}
