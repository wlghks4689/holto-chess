import type { ReactNode } from "react";

export function OnlineEntryFrame({ title, eyebrow, children }: { title: string; eyebrow: string; children: ReactNode }) {
  return <main className="online-entry"><section className="entry-panel" aria-labelledby="entry-title">
    <header className="entry-heading"><span className="entry-brand">PORENA</span><span className="eyebrow">{eyebrow}</span><h1 id="entry-title">{title}</h1></header>
    {children}
  </section></main>;
}
