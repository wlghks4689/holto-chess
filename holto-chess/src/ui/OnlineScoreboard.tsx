import { useRef } from "react";
import type { PlayerView } from "../shared/protocol";
import { useTranslation } from "../i18n";

export function OnlineScoreboard({ view }: { view: PlayerView }) {
  const { t } = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  const rows = [...view.players].sort((a, b) => b.points - a.points || b.stackBB - a.stackBB || a.playerId.localeCompare(b.playerId));
  return <section className="online-scoreboard">
    <button className="secondary score-toggle" onClick={() => dialog.current?.showModal()} aria-haspopup="dialog">{t("scoreboard.title")} <span>{t("scoreboard.survivorsExpand", { count: view.players.filter((p) => p.alive).length })} ▾</span></button>
    <dialog ref={dialog} className="online-score-dialog" aria-labelledby="online-score-title" onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <div className="score-dialog-content"><header><h2 id="online-score-title">{t("scoreboard.title")}</h2><button className="secondary" autoFocus onClick={() => dialog.current?.close()} aria-label={t("scoreboard.close")}>{t("common.close")} ×</button></header>
        <p>{t("scoreboard.sortHelp")}</p>
        <table><thead><tr><th scope="col">{t("scoreboard.rank")}</th><th scope="col">{t("scoreboard.player")}</th><th scope="col">{t("scoreboard.ownedBB")}</th><th scope="col">{t("scoreboard.points")}</th></tr></thead><tbody>{rows.map((player, index) => <tr key={player.playerId} className={player.playerId === view.me.playerId ? "is-me" : ""}><td>{t("scoreboard.place", { place: index + 1 })}</td><th scope="row">{player.name}<small>{player.playerId === view.me.playerId ? `${t("round.you")} · ` : ""}{t(!player.alive ? "scoreboard.eliminated" : player.departed ? "scoreboard.aiSubstitute" : player.human ? "scoreboard.human" : "scoreboard.ai")}</small></th><td>{Number(player.stackBB.toFixed(2))}</td><td>{Number(player.points.toFixed(2))}</td></tr>)}</tbody></table>
      </div>
    </dialog>
  </section>;
}
