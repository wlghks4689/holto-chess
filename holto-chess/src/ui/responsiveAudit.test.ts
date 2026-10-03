import { afterEach, describe, expect, it, vi } from "vitest";
import { auditResponsiveLayout } from "./responsiveAudit";

// DOM geometry fixtures exercise detection, not CSS rendering. Browser QA covers CSS.
interface GeometryElement {
  className: string;
  offsetTop: number;
  children: GeometryElement[];
  scrollWidth: number;
  clientWidth: number;
  closest: () => null;
  matches: (selector: string) => boolean;
  getClientRects: () => { top: number; left: number; width: number; height: number; bottom: number; right: number }[];
  getBoundingClientRect: () => { top: number; left: number; width: number; height: number; bottom: number; right: number };
}

function element(className: string, top: number, left: number, width: number, height: number): GeometryElement {
  const rect = { top, left, width, height, bottom: top + height, right: left + width };
  return {
    className, offsetTop: top, children: [],
    scrollWidth: width, clientWidth: width,
    closest: () => null,
    matches: (selector: string) => selector === '.showdown-prep-hand' && className === 'showdown-prep-hand',
    getClientRects: () => [rect], getBoundingClientRect: () => rect,
  };
}

function setup({ wrapped = false, width = 960, coverRow = false, bar = false } = {}) {
  const hand = element('showdown-prep-hand', 100, 20, 400, 160);
  hand.children = Array.from({ length: 7 }, (_, i) => element('playing-card compact', wrapped && i === 6 ? 180 : 100, 20 + (i % 6) * 56, 53, 75));
  if (!wrapped) hand.children[6] = element('playing-card compact', 100, 356, 53, 75);
  const row = element('standing-row', 680, 10, 700, 30);
  const action = element('action-bar', coverRow ? 685 : 730, 10, 700, 50);
  vi.stubGlobal('innerWidth', width);
  vi.stubGlobal('innerHeight', 900);
  vi.stubGlobal('getComputedStyle', () => ({ visibility: 'visible' }));
  vi.stubGlobal('document', {
    documentElement: { scrollHeight: 900, clientHeight: 900, scrollWidth: width, clientWidth: width },
    querySelectorAll: (selector: string) => {
      if (selector.startsWith('.owned-row,') || selector.startsWith('.showdown-prep-hand[data-count="7"]')) return [hand];
      if (bar && selector === '.page-shell>.action-bar') return [action];
      if (bar && selector === '.leaderboard-table tbody tr') return [row];
      return [];
    },
  });
}

afterEach(() => vi.unstubAllGlobals());
describe('desktop geometry regressions', () => {
  it('detects the former 6+1 R5 profile at a tall desktop width', () => {
    setup({ wrapped: true });
    expect(auditResponsiveLayout().issues.map(issue => issue.type)).toContain('seven-cards-not-one-row');
  });
  it('accepts seven cards sharing one row', () => {
    setup();
    expect(auditResponsiveLayout().sevenCardRows).toEqual([1]);
    expect(auditResponsiveLayout().issues).toEqual([]);
  });
  it('does not impose the desktop row rule on mobile', () => {
    setup({ wrapped: true, width: 402 });
    expect(auditResponsiveLayout().issues.map(issue => issue.type)).not.toContain('seven-cards-not-one-row');
  });
  it('detects a sticky action covering a standings row', () => {
    setup({ bar: true, coverRow: true });
    expect(auditResponsiveLayout().issues.map(issue => issue.type)).toContain('action-bar-covers-standing');
  });
  it('accepts the action below the table', () => {
    setup({ bar: true });
    expect(auditResponsiveLayout().issues).toEqual([]);
  });
});
