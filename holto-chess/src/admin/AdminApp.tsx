import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { FEEDBACK_CATEGORIES, type FeedbackCategory, type FeedbackItem, type FeedbackStatus } from "../shared/feedback";
import { adminApi, UnauthorizedError, type CountRow, type FeedbackPage, type Mailbox } from "./adminApi";

// The admin is operated in Korean only; the player-facing form carries the translations.
const CATEGORY_LABEL: Record<FeedbackCategory, string> = { feedback: "피드백", bug: "버그 제보", inquiry: "문의 사항", support: "후원" };
const BOX_LABEL: Record<Mailbox, string> = { inbox: "받은편지함", archived: "보관함" };
const LOGIN_ERROR: Record<string, string> = {
  invalid: "아이디 또는 비밀번호가 올바르지 않습니다.",
  "rate-limited": "로그인 시도가 너무 많습니다. 1분 뒤 다시 시도하세요.",
  "not-configured": "관리자 계정이 아직 설정되지 않았습니다. 운영 문서의 관리자 설정 절차를 먼저 진행하세요.",
};

const dateTime = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" });
const shortDate = (time: number) => {
  const date = new Date(time);
  return date.toDateString() === new Date().toDateString()
    ? date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
};

export function AdminApp() {
  const [admin, setAdmin] = useState<string | null | undefined>(undefined);
  useEffect(() => { adminApi.session().then((s) => setAdmin(s.username), () => setAdmin(null)); }, []);
  if (admin === undefined) return <main className="admin-loading" aria-busy="true">불러오는 중…</main>;
  if (admin === null) return <LoginForm onLogin={setAdmin} />;
  return <Inbox username={admin} onSignedOut={() => setAdmin(null)} />;
}

function LoginForm({ onLogin }: { onLogin: (username: string) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setError(null);
    try { onLogin((await adminApi.login(username, password)).username); }
    catch (reason) { setError(LOGIN_ERROR[(reason as Error).message] ?? "로그인하지 못했습니다. 잠시 후 다시 시도하세요."); setPassword(""); }
    finally { setBusy(false); }
  };
  return <main className="admin-login">
    <form onSubmit={submit} aria-labelledby="admin-login-title">
      <small>PORENA ADMIN</small>
      <h1 id="admin-login-title">관리자 로그인</h1>
      <label>아이디<input autoComplete="username" required value={username} onChange={(e) => setUsername(e.target.value)} /></label>
      <label>비밀번호<input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      {error && <p className="admin-error" role="alert">{error}</p>}
      <button type="submit" disabled={busy}>{busy ? "확인 중…" : "로그인"}</button>
    </form>
  </main>;
}

function Inbox({ username, onSignedOut }: { username: string; onSignedOut: () => void }) {
  const [box, setBox] = useState<Mailbox>("inbox");
  const [category, setCategory] = useState<FeedbackCategory | "all">("all");
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [counts, setCounts] = useState<CountRow[]>([]);
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const guard = useCallback((reason: unknown) => {
    if (reason instanceof UnauthorizedError) onSignedOut();
    else setError("요청을 처리하지 못했습니다. 새로고침 후 다시 시도하세요.");
  }, [onSignedOut]);

  const [reloads, setReloads] = useState(0);
  const receive = useCallback((page: FeedbackPage, append: boolean) => {
    setItems((current) => append ? [...current, ...page.items] : page.items);
    setCounts(page.counts);
    setNextBefore(page.nextBefore);
  }, []);
  // Changing the box or category (or pressing refresh) replaces the list. The handlers set `loading` first.
  useEffect(() => {
    let current = true;
    adminApi.list(box, category).then((page) => { if (current) receive(page, false); }, (reason) => { if (current) guard(reason); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [box, category, reloads, guard, receive]);
  const reload = (next?: { box?: Mailbox; category?: FeedbackCategory | "all" }) => {
    setLoading(true); setError(null); setSelectedId(null);
    if (next?.box) setBox(next.box);
    if (next?.category) setCategory(next.category);
    // Always bump, so re-selecting the current box still refetches and clears `loading`.
    setReloads((n) => n + 1);
  };
  const loadMore = async (before: number) => {
    setLoading(true); setError(null);
    try { receive(await adminApi.list(box, category, before), true); } catch (reason) { guard(reason); }
    finally { setLoading(false); }
  };

  const unread = useMemo(() => {
    const byCategory = Object.fromEntries(FEEDBACK_CATEGORIES.map((c) => [c, 0])) as Record<FeedbackCategory, number>;
    for (const row of counts) if (row.status === "unread") byCategory[row.category] += row.total;
    return { total: Object.values(byCategory).reduce((a, b) => a + b, 0), byCategory };
  }, [counts]);
  const archivedTotal = counts.filter((row) => row.status === "archived").reduce((sum, row) => sum + row.total, 0);
  const selected = items.find((item) => item.id === selectedId) ?? null;

  // Local bookkeeping mirrors the server so counts update without a reload.
  const applyStatus = (item: FeedbackItem, status: FeedbackStatus) => {
    setCounts((rows) => {
      const next = rows.map((row) => ({ ...row }));
      const bump = (s: FeedbackStatus, delta: number) => {
        const row = next.find((r) => r.category === item.category && r.status === s);
        if (row) row.total += delta; else next.push({ category: item.category, status: s, total: delta });
      };
      bump(item.status, -1); bump(status, 1);
      return next;
    });
    const leavesBox = (status === "archived") !== (box === "archived");
    const changed = { ...item, status, ...(status === "archived" ? { contactEmail: null } : {}) };
    setItems((list) => leavesBox ? list.filter((i) => i.id !== item.id) : list.map((i) => i.id === item.id ? changed : i));
    if (leavesBox) setSelectedId(null);
  };
  const changeStatus = async (item: FeedbackItem, status: FeedbackStatus) => {
    // The server deletes the reply email on archive (privacy policy), so make sure the answer went out first.
    if (status === "archived" && item.contactEmail && !window.confirm("처리 완료로 보관하면 답장 이메일이 즉시 삭제되고 되돌릴 수 없습니다. 답장을 마쳤나요?")) return;
    try { await adminApi.setStatus(item.id, status); applyStatus(item, status); } catch (reason) { guard(reason); }
  };
  const open = (item: FeedbackItem) => {
    setSelectedId(item.id);
    if (item.status === "unread") void changeStatus(item, "read");
  };
  const remove = async (item: FeedbackItem) => {
    if (!window.confirm("이 메시지를 영구 삭제할까요? 삭제하면 되돌릴 수 없습니다.")) return;
    try {
      await adminApi.remove(item.id);
      setItems((list) => list.filter((i) => i.id !== item.id));
      setCounts((rows) => rows.map((row) => row.category === item.category && row.status === item.status ? { ...row, total: row.total - 1 } : row));
      setSelectedId(null);
    } catch (reason) { guard(reason); }
  };
  const logout = async () => { await adminApi.logout().catch(() => undefined); onSignedOut(); };

  return <div className={`admin-shell${selected ? " has-selection" : ""}`}>
    <header className="admin-topbar">
      <strong>PORENA <span>관리자</span></strong>
      <div><span className="admin-user">{username}</span><button type="button" onClick={logout}>로그아웃</button></div>
    </header>
    <nav className="admin-nav" aria-label="관리 메뉴">
      <p>메시지</p>
      {(["inbox", "archived"] as const).map((b) => <button key={b} type="button" aria-current={box === b ? "page" : undefined} onClick={() => reload({ box: b })}>
        {BOX_LABEL[b]}<span>{b === "inbox" ? unread.total || "" : archivedTotal || ""}</span>
      </button>)}
      <p>분류</p>
      <button type="button" aria-pressed={category === "all"} onClick={() => reload({ category: "all" })}>전체</button>
      {FEEDBACK_CATEGORIES.map((c) => <button key={c} type="button" aria-pressed={category === c} onClick={() => reload({ category: c })} data-category={c}>
        {CATEGORY_LABEL[c]}<span>{unread.byCategory[c] || ""}</span>
      </button>)}
      <p>회원</p>
      <button type="button" disabled title="로그인 시스템 도입 후 제공">유저 관리 <small>준비 중</small></button>
    </nav>
    <section className="admin-list" aria-label={`${BOX_LABEL[box]} · ${category === "all" ? "전체" : CATEGORY_LABEL[category]}`}>
      <header><h1>{BOX_LABEL[box]}</h1><button type="button" onClick={() => reload()} disabled={loading}>새로고침</button></header>
      <p className="admin-retention">{box === "archived" ? "보관한 메시지는 답장 이메일이 삭제된 상태입니다. " : ""}모든 메시지는 접수 후 90일이 지나면 자동 삭제됩니다.</p>
      {error && <p className="admin-error" role="alert">{error}</p>}
      <ul>
        {items.map((item) => <li key={item.id}>
          <button type="button" className={item.status === "unread" ? "unread" : undefined} aria-current={item.id === selectedId ? "true" : undefined} onClick={() => open(item)}>
            <span className="admin-chip" data-category={item.category}>{CATEGORY_LABEL[item.category]}</span>
            <time dateTime={new Date(item.createdAt).toISOString()}>{shortDate(item.createdAt)}</time>
            <p>{item.message}</p>
            {item.contactEmail && <small>답장 가능 · {item.contactEmail}</small>}
          </button>
        </li>)}
      </ul>
      {!loading && items.length === 0 && <p className="admin-empty">메시지가 없습니다.</p>}
      {loading && <p className="admin-empty" aria-live="polite">불러오는 중…</p>}
      {nextBefore && !loading && <button type="button" className="admin-more" onClick={() => void loadMore(nextBefore)}>더 보기</button>}
    </section>
    <article className="admin-detail" aria-label="메시지 내용">
      {selected ? <>
        <header>
          <button type="button" className="admin-back" onClick={() => setSelectedId(null)}>← 목록</button>
          <span className="admin-chip" data-category={selected.category}>{CATEGORY_LABEL[selected.category]}</span>
          <time dateTime={new Date(selected.createdAt).toISOString()}>{dateTime.format(selected.createdAt)}</time>
        </header>
        <p className="admin-message">{selected.message}</p>
        <dl>
          <dt>답장 이메일</dt><dd>{selected.contactEmail ? <a href={`mailto:${selected.contactEmail}?subject=${encodeURIComponent("[PORENA] 문의하신 내용에 대한 답변")}`}>{selected.contactEmail}</a> : "남기지 않음"}</dd>
          <dt>언어</dt><dd>{selected.locale ?? "알 수 없음"}</dd>
          <dt>기기 · 브라우저</dt><dd className="admin-ua">{selected.userAgent ?? "알 수 없음"}</dd>
          <dt>번호</dt><dd>#{selected.id}</dd>
        </dl>
        <div className="admin-actions">
          {selected.status !== "archived"
            ? <><button type="button" onClick={() => void changeStatus(selected, "archived")}>처리 완료 · 보관</button><button type="button" onClick={() => void changeStatus(selected, "unread")}>읽지 않음으로 표시</button></>
            : <button type="button" onClick={() => void changeStatus(selected, "read")}>받은편지함으로 이동</button>}
          <button type="button" className="danger" onClick={() => void remove(selected)}>삭제</button>
        </div>
      </> : <p className="admin-empty">왼쪽 목록에서 메시지를 선택하세요.</p>}
    </article>
  </div>;
}
