export function canSellWithoutBlocking({ ownedCount, purchases, purchaseLimit, handLimit }: {
  ownedCount: number; purchases: number; purchaseLimit: number; handLimit: number;
}): boolean {
  const remainingPurchases = Math.max(0, purchaseLimit - purchases);
  return ownedCount - 1 + remainingPurchases >= handLimit;
}
