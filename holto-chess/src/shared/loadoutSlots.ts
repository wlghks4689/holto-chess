export function normalizeSlots(slots: readonly (string | null)[], owned: readonly string[]): (string | null)[] {
  const seen = new Set<string>();
  return Array.from({ length: 4 }, (_, index) => {
    const id = slots[index];
    if (!id || !owned.includes(id) || seen.has(id)) return null;
    seen.add(id); return id;
  });
}
export function fillSlots(slots: readonly (string | null)[], owned: readonly string[]): string[] {
  const next = normalizeSlots(slots, owned);
  const remaining = owned.filter((id) => !next.includes(id));
  return next.map((id) => id ?? remaining.shift()).filter((id): id is string => !!id);
}
export function toggleSlot(slots: readonly (string | null)[], owned: readonly string[], index: number): (string | null)[] {
  const next = normalizeSlots(slots, owned);
  if (index < 0 || index >= 4) return next;
  next[index] = next[index] ? null : owned.find((id) => !next.includes(id)) ?? null;
  return next;
}
