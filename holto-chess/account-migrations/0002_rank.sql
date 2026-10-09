-- RANK-SYSTEM-002: 28-day seasons, one RP profile per season and account, one event per game and account.
CREATE TABLE seasons (
  id INTEGER PRIMARY KEY NOT NULL,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL
);

CREATE TABLE rank_profiles (
  season_id INTEGER NOT NULL REFERENCES seasons(id),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  starting_points INTEGER NOT NULL,
  rank_points INTEGER NOT NULL,
  games INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  forfeits INTEGER NOT NULL DEFAULT 0,
  best_score INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (season_id, user_id)
);
-- Leaderboard order: RP, then whoever reached it first, then a fixed id.
CREATE INDEX idx_rank_profiles_board ON rank_profiles(season_id, rank_points DESC, updated_at, user_id);
CREATE INDEX idx_rank_profiles_user ON rank_profiles(user_id, season_id);

CREATE TABLE rank_events (
  season_id INTEGER NOT NULL REFERENCES seasons(id),
  game_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('SOLO', 'MULTI')),
  placement INTEGER NOT NULL,
  final_score INTEGER NOT NULL,
  human_count INTEGER NOT NULL,
  forfeited INTEGER NOT NULL,
  base_delta INTEGER NOT NULL,
  score_bonus INTEGER NOT NULL,
  human_bonus INTEGER NOT NULL,
  final_delta INTEGER NOT NULL,
  before_points INTEGER NOT NULL,
  after_points INTEGER NOT NULL,
  -- 0 until the profile has absorbed this event; a replayed settlement then changes nothing.
  applied INTEGER NOT NULL DEFAULT 0,
  game_started_at INTEGER NOT NULL,
  settled_at INTEGER NOT NULL,
  PRIMARY KEY (season_id, game_id, user_id)
);
CREATE INDEX idx_rank_events_user ON rank_events(user_id, settled_at);
