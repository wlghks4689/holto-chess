import { rankDelta, seasonAt, startingPoints, tierFor, SEASON_EPOCH_MS, SEASON_LENGTH_MS } from "../src/game/rank";
import type { RankObligation, RankResult } from "../src/game/rankRoom";
import { readPorenaSession } from "./auth";

type EventRow = { placement: number; final_score: number; forfeited: number; base_delta: number; score_bonus: number; human_bonus: number; final_delta: number; before_points: number; after_points: number };

/**
 * Writes one ranked outcome exactly once. The batch is a single D1 transaction and every step is a no-op on replay:
 * the event key is unique and the profile only absorbs an event whose `applied` flag is still 0.
 * Returns `{ skipped: true }` when the account no longer exists (deleted accounts take their rank data with them).
 */
export async function settleRankObligation(db: D1Database, o: RankObligation, now: number): Promise<RankResult> {
  const previous = await db.prepare("SELECT season_id, rank_points FROM rank_profiles WHERE user_id = ? AND season_id < ? ORDER BY season_id DESC LIMIT 1")
    .bind(o.userId, o.seasonId).first<{ season_id: number; rank_points: number }>();
  const start = startingPoints(previous && { seasonId: previous.season_id, points: previous.rank_points }, o.seasonId);
  const d = rankDelta(o);
  const startsAt = SEASON_EPOCH_MS + (o.seasonId - 1) * SEASON_LENGTH_MS;
  const results = await db.batch([
    db.prepare("INSERT OR IGNORE INTO seasons (id, starts_at, ends_at) VALUES (?, ?, ?)").bind(o.seasonId, startsAt, startsAt + SEASON_LENGTH_MS),
    db.prepare("INSERT OR IGNORE INTO rank_profiles (season_id, user_id, starting_points, rank_points, created_at, updated_at) SELECT ?1, id, ?2, ?2, ?3, ?3 FROM users WHERE id = ?4")
      .bind(o.seasonId, start, now, o.userId),
    db.prepare(`INSERT OR IGNORE INTO rank_events (season_id, game_id, user_id, mode, placement, final_score, human_count, forfeited, base_delta, score_bonus, human_bonus, final_delta,
        before_points, after_points, applied, game_started_at, settled_at)
      SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, rank_points, MAX(0, rank_points + ?12), 0, ?13, ?14
      FROM rank_profiles WHERE season_id = ?1 AND user_id = ?3`)
      .bind(o.seasonId, o.gameId, o.userId, o.mode, o.forfeited ? 8 : o.placement, o.forfeited ? 0 : o.finalScore, o.humanCount, o.forfeited ? 1 : 0,
        d.base, d.scoreBonus, d.humanBonus, d.delta, o.startedAt, now),
    db.prepare(`UPDATE rank_profiles SET rank_points = e.after_points, games = games + 1, wins = wins + (e.placement = 1 AND e.forfeited = 0),
        forfeits = forfeits + e.forfeited, best_score = MAX(best_score, e.final_score), updated_at = ?4
      FROM rank_events e WHERE rank_profiles.season_id = ?1 AND rank_profiles.user_id = ?3
        AND e.season_id = ?1 AND e.game_id = ?2 AND e.user_id = ?3 AND e.applied = 0`).bind(o.seasonId, o.gameId, o.userId, now),
    db.prepare("UPDATE rank_events SET applied = 1 WHERE season_id = ? AND game_id = ? AND user_id = ? AND applied = 0").bind(o.seasonId, o.gameId, o.userId),
    db.prepare("SELECT placement, final_score, forfeited, base_delta, score_bonus, human_bonus, final_delta, before_points, after_points FROM rank_events WHERE season_id = ? AND game_id = ? AND user_id = ?")
      .bind(o.seasonId, o.gameId, o.userId),
  ]);
  const row = results.at(-1)!.results[0] as EventRow | undefined;
  if (!row) return { skipped: true };
  return { seasonId: o.seasonId, placement: row.placement, finalScore: row.final_score, forfeited: row.forfeited === 1, base: row.base_delta,
    scoreBonus: row.score_bonus, humanBonus: row.human_bonus, delta: row.final_delta, before: row.before_points, after: row.after_points };
}

const PAGE_SIZE = 20;
const PODIUM = 3;
// Accounts on the board: played this season, have a public name, not disabled. Ids never leave this file.
const BOARD = `FROM rank_profiles p JOIN users u ON u.id = p.user_id
  WHERE p.season_id = ?1 AND p.games > 0 AND u.display_name IS NOT NULL AND u.status = 'active'`;
const ORDER = "ORDER BY p.rank_points DESC, p.updated_at ASC, p.user_id ASC";
type BoardRow = { display_name: string; rank_points: number; games: number; wins: number };
const entry = (row: BoardRow, rank: number) => ({ rank, displayName: row.display_name, points: row.rank_points, tier: tierFor(row.rank_points), games: row.games, wins: row.wins });
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store", "Vary": "Cookie" } });

/** GET /api/rankings?page=N (public) and GET /api/rankings/me (the signed-in account only). */
export async function handleRankings(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
  const season = seasonAt(Date.now());
  const seasonView = { id: season.id, startsAt: season.startsAt, endsAt: season.endsAt };
  try {
    if (url.pathname === "/api/rankings/me") {
      const user = await readPorenaSession(request, env);
      if (!user) return json({ authenticated: false, season: seasonView });
      const me = await env.ACCOUNT_DB.prepare("SELECT rank_points, updated_at, games, wins, forfeits, best_score FROM rank_profiles WHERE season_id = ? AND user_id = ?")
        .bind(season.id, user.id).first<{ rank_points: number; updated_at: number; games: number; wins: number; forfeits: number; best_score: number }>();
      if (!me || !me.games) {
        const previous = await env.ACCOUNT_DB.prepare("SELECT season_id, rank_points FROM rank_profiles WHERE user_id = ? AND season_id < ? ORDER BY season_id DESC LIMIT 1")
          .bind(user.id, season.id).first<{ season_id: number; rank_points: number }>();
        const points = me?.rank_points ?? startingPoints(previous && { seasonId: previous.season_id, points: previous.rank_points }, season.id);
        return json({ authenticated: true, season: seasonView, points, tier: tierFor(points), rank: null, games: 0, wins: 0, forfeits: 0, bestScore: 0 });
      }
      const ahead = await env.ACCOUNT_DB.prepare(`SELECT COUNT(*) AS n ${BOARD} AND (p.rank_points > ?2 OR (p.rank_points = ?2 AND (p.updated_at < ?3 OR (p.updated_at = ?3 AND p.user_id < ?4))))`)
        .bind(season.id, me.rank_points, me.updated_at, user.id).first<{ n: number }>();
      return json({ authenticated: true, season: seasonView, points: me.rank_points, tier: tierFor(me.rank_points), rank: user.displayName ? (ahead?.n ?? 0) + 1 : null,
        games: me.games, wins: me.wins, forfeits: me.forfeits, bestScore: me.best_score });
    }
    if (url.pathname !== "/api/rankings") return json({ error: "Not found" }, 404);
    const page = Math.max(1, Math.min(500, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1));
    const offset = PODIUM + (page - 1) * PAGE_SIZE;
    const [total, podium, rows] = await env.ACCOUNT_DB.batch([
      env.ACCOUNT_DB.prepare(`SELECT COUNT(*) AS n ${BOARD}`).bind(season.id),
      env.ACCOUNT_DB.prepare(`SELECT u.display_name, p.rank_points, p.games, p.wins ${BOARD} ${ORDER} LIMIT ${PODIUM}`).bind(season.id),
      env.ACCOUNT_DB.prepare(`SELECT u.display_name, p.rank_points, p.games, p.wins ${BOARD} ${ORDER} LIMIT ${PAGE_SIZE} OFFSET ?2`).bind(season.id, offset),
    ]);
    const count = (total!.results[0] as { n: number }).n;
    return json({ season: seasonView, total: count, page, pageCount: Math.max(1, Math.ceil(Math.max(0, count - PODIUM) / PAGE_SIZE)),
      podium: (podium!.results as BoardRow[]).map((row, i) => entry(row, i + 1)),
      entries: (rows!.results as BoardRow[]).map((row, i) => entry(row, offset + i + 1)) });
  } catch {
    return json({ error: "RANKINGS_UNAVAILABLE" }, 503);
  }
}
