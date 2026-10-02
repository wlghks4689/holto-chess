import { Fragment, useEffect, type ReactNode } from "react";
import { useTranslation, type Locale } from "../i18n";
import { chromeEn, privacyEn, termsEn } from "./content.en";
import { chromeKo, privacyKo, termsKo } from "./content.ko";
import { followInApp, LEGAL_PATHS } from "./legalRoute";
import { LEGAL_EFFECTIVE_DATE, type LegalBlock, type LegalKind } from "./legalTypes";
import "./legal.css";

const DOCUMENTS = {
  "ko-KR": { chrome: chromeKo, privacy: privacyKo, terms: termsKo },
  "en-US": { chrome: chromeEn, privacy: privacyEn, terms: termsEn },
} as const;

/** Renders `[label](href)` links and `code` spans; everything else is plain text. */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const [, label, href, code] = match;
    if (code) out.push(<code key={match.index}>{code}</code>);
    else if (href!.startsWith("/")) out.push(<a key={match.index} href={href} onClick={followInApp(href!)}>{label}</a>);
    else if (href!.startsWith("mailto:")) out.push(<a key={match.index} href={href}>{label}</a>);
    else out.push(<a key={match.index} href={href} target="_blank" rel="noopener noreferrer">{label}</a>);
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function Block({ block }: { block: LegalBlock }) {
  if (typeof block === "string") {
    const heading = /^\*\*(.+)\*\*$/.exec(block);
    return heading ? <h3>{heading[1]}</h3> : <p>{inline(block)}</p>;
  }
  if ("list" in block) return <ul>{block.list.map((item, i) => <li key={i}>{inline(item)}</li>)}</ul>;
  return <div className="legal-table"><table>
    <thead><tr>{block.table.head.map((cell) => <th key={cell} scope="col">{cell}</th>)}</tr></thead>
    <tbody>{block.table.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => j === 0 ? <th key={j} scope="row">{inline(cell)}</th> : <td key={j} data-label={block.table.head[j]}>{inline(cell)}</td>)}</tr>)}</tbody>
  </table></div>;
}

/** 한국어 / English toggle at the top of both pages. Takes effect immediately, without changing the URL. */
export function LanguageSwitch({ locale, onLocale, label }: { locale: Locale; onLocale: (locale: Locale) => void; label: string }) {
  return <div className="legal-language" role="group" aria-label={label}>
    <button type="button" lang="ko" aria-pressed={locale === "ko-KR"} onClick={() => onLocale("ko-KR")}>한국어</button>
    <span aria-hidden="true">/</span>
    <button type="button" lang="en" aria-pressed={locale === "en-US"} onClick={() => onLocale("en-US")}>English</button>
  </div>;
}

/** Public privacy policy and terms pages (/privacy, /terms), readable without starting or joining a game. */
export function LegalPage({ kind }: { kind: LegalKind }) {
  const { locale, setLocale } = useTranslation();
  return <LegalView kind={kind} locale={locale} onLocale={setLocale} />;
}

/** The page for one language. Switching language goes through the app-wide setting, so the game follows it. */
export function LegalView({ kind, locale, onLocale }: { kind: LegalKind; locale: Locale; onLocale: (locale: Locale) => void }) {
  const { chrome, ...documents } = DOCUMENTS[locale];
  const doc = documents[kind];
  const other: LegalKind = kind === "privacy" ? "terms" : "privacy";

  useEffect(() => {
    const previous = document.title;
    document.title = chrome.siteTitle(kind);
    return () => { document.title = previous; };
  }, [chrome, kind]);

  return <div className="legal-page">
    <header className="legal-topbar">
      <a className="legal-brand" href="/" onClick={followInApp("/")} aria-label={chrome.home}>PORENA</a>
      <LanguageSwitch locale={locale} onLocale={onLocale} label={chrome.language} />
    </header>
    <main className="legal-main">
      <nav className="legal-tabs" aria-label="PORENA">
        {(["privacy", "terms"] as const).map((k) => <a key={k} href={LEGAL_PATHS[k]} aria-current={k === kind ? "page" : undefined} onClick={followInApp(LEGAL_PATHS[k])}>{chrome.other[k]}</a>)}
      </nav>
      <article>
        <h1>{doc.title}</h1>
        <p className="legal-effective">{chrome.effective}: <time dateTime={LEGAL_EFFECTIVE_DATE}>{LEGAL_EFFECTIVE_DATE}</time></p>
        {doc.intro.map((text, i) => <p key={i}>{inline(text)}</p>)}
        <nav className="legal-toc" aria-label={chrome.contents}>
          <h2>{chrome.contents}</h2>
          <ol>{doc.sections.map((section) => <li key={section.id}><a href={`#${section.id}`}>{section.title}</a></li>)}</ol>
        </nav>
        {doc.sections.map((section) => <section key={section.id} id={section.id} aria-labelledby={`${section.id}-title`}>
          <h2 id={`${section.id}-title`}>{section.title}</h2>
          {section.body.map((block, i) => <Fragment key={i}><Block block={block} /></Fragment>)}
        </section>)}
      </article>
      <footer className="legal-footer">
        <a href={LEGAL_PATHS[other]} onClick={followInApp(LEGAL_PATHS[other])}>{chrome.other[other]}</a>
        <a href="/" onClick={followInApp("/")}>← {chrome.home}</a>
      </footer>
    </main>
  </div>;
}
