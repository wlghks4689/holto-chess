export function EmptyHandSlots({ count, limit }: { count: number; limit: number }) {
  return <>{Array.from({ length: Math.max(0, limit - count) }, (_, index) => <div className="empty-card inventory-empty-slot" key={count + index} aria-label={`카드 슬롯 ${count + index + 1} / ${limit} 비어 있음`}><span>＋</span><small>빈 슬롯</small></div>)}</>;
}
