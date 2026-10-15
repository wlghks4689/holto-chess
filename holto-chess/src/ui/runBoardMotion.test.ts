import { expect, it } from "vitest";
import { runBoardOrder } from "./useRunBoardMotion";

it.each([2, 3])("keeps active RUN first and moves finished RUNs below undealt slots for %i RUNs", count => {
  const orderAt = (current: number, result = false) => Array.from({ length: count }, (_, index) => index)
    .sort((a, b) => runBoardOrder(a, current, a < current || result, count) - runBoardOrder(b, current, b < current || result, count));
  expect(orderAt(0)).toEqual(Array.from({ length: count }, (_, i) => i));
  expect(orderAt(1).at(-1)).toBe(0);
  expect(orderAt(1)[0]).toBe(1);
  if (count === 3) expect(orderAt(2)).toEqual([2, 1, 0]);
  expect(orderAt(count - 1, true)).toEqual(Array.from({ length: count }, (_, i) => count - 1 - i));
});
