import { useLayoutEffect, useRef, type RefObject } from "react";

/** Active first, undealt next, then finished RUNs newest to oldest. */
export function runBoardOrder(index: number, current: number, settled: boolean, count: number) {
  return index > current ? index + 1 : settled ? count * 2 - index : 0;
}

/** Animate the layout delta, preserving the same cards and authoritative presentation clock. */
export function useRunBoardMotion(stack: RefObject<HTMLDivElement | null>, scene: string, layout: string, enabled: boolean) {
  const previous = useRef<{ scene: string; positions: Map<string, DOMRect> }>({ scene: "", positions: new Map() });
  useLayoutEffect(() => {
    const boards = [...(stack.current?.querySelectorAll<HTMLElement>("[data-run-index]") ?? [])];
    const positions = new Map(boards.map(board => [board.dataset.runIndex!, board.getBoundingClientRect()]));
    const animations: Animation[] = [];
    if (enabled && previous.current.scene === scene && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      for (const board of boards) {
        const before = previous.current.positions.get(board.dataset.runIndex!);
        const after = positions.get(board.dataset.runIndex!)!;
        if (!before || !after.width || !before.width) continue;
        const delta = before.top - after.top;
        if (Math.abs(delta) < 1) continue;
        animations.push(board.animate([{ transform: `translateY(${delta}px)` }, { transform: "translateY(0)" }],
          { duration: 560, easing: "cubic-bezier(.22,.8,.25,1)" }));
      }
    }
    previous.current = { scene, positions };
    return () => animations.forEach(animation => animation.cancel());
  }, [stack, scene, layout, enabled]);
}
