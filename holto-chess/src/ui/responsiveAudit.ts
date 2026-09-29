/** Read-only geometry audit. Run after reveal/deal animations settle. */
export function auditResponsiveLayout() {
  const root = document.documentElement;
  const matrix = document.querySelectorAll('[data-qa-case]').length > 1;
  const pageVerticalOverflow = root.scrollHeight > root.clientHeight + 1;
  const issues: { caseId: string; type: string; element: string }[] = [];
  const add = (el: Element, type: string) => issues.push({ caseId: el.closest('[data-qa-case]')?.getAttribute('data-qa-case') ?? 'page', type, element: el.className });
  const visible = (el: Element) => {
    const closed = el.closest('details:not([open])');
    if (closed && !closed.querySelector(':scope>summary')?.contains(el)) return false;
    return el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  };
  const groups = document.querySelectorAll('.owned-row,.market-row,.cinema-hole-cards,.cinema-board-cards,.showdown-prep-hand,.summary-hand,.final-hand,.ability-back-grid,.r2-arena,.draft-private-cards,.run-loadout-slots,.loadout-sockets');
  for (const group of groups) {
    const children = Array.from(group.children).filter(el => visible(el) && !el.matches('.r2-deal-origin'));
    const bounds = group.getBoundingClientRect();
    const rects = children.map(el => el.getBoundingClientRect());
    rects.forEach((rect, index) => {
      if (rect.left < bounds.left - 3 || rect.right > bounds.right + 3 || rect.left < -1 || rect.right > innerWidth + 1) add(children[index]!, 'card-outside');
      for (let other = 0; other < index; other++) {
        const b = rects[other]!;
        if (Math.min(rect.right,b.right)-Math.max(rect.left,b.left)>2 && Math.min(rect.bottom,b.bottom)-Math.max(rect.top,b.top)>2) add(children[index]!, 'card-overlap');
      }
    });
  }
  for (const panel of document.querySelectorAll('.cinema-seat,.showdown-prep-player,.final-standing,.r2-order li,.leaderboard-table tbody tr,.shop-layout>.panel')) {
    if (!visible(panel)) continue;
    const rect = panel.getBoundingClientRect();
    if (rect.left < -1 || rect.right > innerWidth + 1) add(panel, 'panel-outside');
    // Cinema stamp rings/glow intentionally extend; inspect content bounds, not decorative scrollWidth.
    if (!panel.matches('.cinema-seat') && panel.scrollWidth > panel.clientWidth + 3) add(panel, 'panel-overflow');
    for (const child of Array.from(panel.children).filter(visible)) {
      const b = child.getBoundingClientRect();
      if (b.left < rect.left - 3 || b.right > rect.right + 3 || b.bottom > rect.bottom + 3) add(child, 'content-outside-panel');
    }
  }
  const fiveCardRows = Array.from(document.querySelectorAll('.cinema-hole-cards[data-count="5"],.showdown-prep-hand[data-count="5"]')).map(group => {
    const rows = new Map<number,number>();
    for (const child of Array.from(group.children)) {
      const top = Math.round(child.getBoundingClientRect().top);
      rows.set(top,(rows.get(top) ?? 0)+1);
    }
    const result = [...rows.values()];
    const r4Loading = group.matches('.showdown-prep-hand') && !!group.closest('.showdown-prep[data-round="4"]');
    const r4WideShowdown = !!group.closest('.cinema[data-round="4"]') && innerWidth >= 540;
    const expected = r4Loading || r4WideShowdown ? '5' : innerWidth <= 768 ? '3,2' : undefined;
    if (expected && result.join(',') !== expected) add(group, expected === '5' ? 'five-cards-not-one-row' : 'five-cards-not-3+2');
    return result;
  });
  if (root.scrollWidth > root.clientWidth + 1) add(root, 'page-horizontal-overflow');
  if (!matrix && pageVerticalOverflow) add(root, 'page-vertical-overflow');
  if (!matrix) for (const element of document.querySelectorAll('.page-shell button,.cinema button,.owned-row,.market-row,.ability-back-grid,.r2-arena,.cinema-seats,.leaderboard-table')) {
    if (!visible(element) || element.closest('dialog:not([open])')) continue;
    const bounds = element.getBoundingClientRect();
    if (bounds.width && bounds.height && (bounds.top < -1 || bounds.bottom > innerHeight + 1)) add(element,'essential-viewport-escape');
  }
  const profileBoxes = Array.from(document.querySelectorAll('.showdown-prep-player,.r2-match-player')).map(el=>{const rect=el.getBoundingClientRect();return {width:rect.width,height:rect.height,icons:el.querySelectorAll('img[src*="/abilities/"]').length};});
  return { viewport: { width: innerWidth, height: innerHeight }, documentWidth: root.scrollWidth, scrollHeight:root.scrollHeight, clientHeight:root.clientHeight, viewportHeight:innerHeight, pageVerticalOverflow, matrix, profileBoxes, cases: document.querySelectorAll('[data-qa-case]').length, groups: groups.length, fiveCardRows, issues };
}
