/** Restore a newly visible game screen, without stealing an open dialog's focus. */
export function restoreGameViewport(screen: HTMLElement | null | undefined) {
  if (!screen) return;
  const doc = screen.ownerDocument;
  doc.defaultView?.scrollTo({ top: 0, left: 0, behavior: "instant" });
  if (!doc.querySelector("dialog[open],[aria-modal='true']")) {
    screen.tabIndex = -1;
    screen.focus({ preventScroll: true });
  }
}
