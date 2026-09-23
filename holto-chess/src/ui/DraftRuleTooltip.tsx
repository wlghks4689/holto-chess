export function DraftRuleTooltip({ round }: { round: number }) {
  const flow = round === 2
    ? "8장 공개 풀에서 차례마다 1장을 구매해 보유 카드 3장을 완성합니다."
    : "16장 공개 풀에서 차례마다 1장을 구매한 뒤 개인 상점으로 이동합니다.";
  return <details className="draft-help">
    <summary aria-label="공개 드래프트 진행 방식 보기">?</summary>
    <div className="draft-help-popover" role="tooltip">
      <strong>선택 순서</strong>
      <p>누적 승점 낮은 순 → 동점 시 보유 BB 높은 순 → 완전 동률 서버 추첨</p>
      <strong>진행 방식</strong>
      <p>{flow}</p>
      <small>제한 시간 안에 선택하지 않으면 구매 가능한 카드 중 한 장을 자동 구매합니다. 구매할 수 없으면 카드 없이 다음 단계로 진행합니다.</small>
    </div>
  </details>;
}
