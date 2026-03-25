import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { type League } from './models/League';
import { type PlayEvent } from './models/PlayEvent';

// ── Init ──────────────────────────────────────────────────────────────────────

const dataDir = process.env['DATA_DIR'] ?? './data';
fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, 'football-sim.db');

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Schema ────────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id           TEXT PRIMARY KEY,
    username     TEXT UNIQUE NOT NULL,
    passwordHash TEXT NOT NULL,
    createdAt    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS leagues (
    id              TEXT PRIMARY KEY,
    displayName     TEXT NOT NULL,
    visibility      TEXT NOT NULL DEFAULT 'public',
    passwordHash    TEXT,
    advanceSchedule TEXT,
    phase           TEXT NOT NULL,
    currentYear     INTEGER NOT NULL,
    createdAt       INTEGER NOT NULL,
    updatedAt       INTEGER NOT NULL,
    stateJson       TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS league_memberships (
    leagueId  TEXT NOT NULL REFERENCES leagues(id),
    userId    TEXT NOT NULL REFERENCES users(id),
    teamId    TEXT NOT NULL DEFAULT '',
    teamName  TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (leagueId, userId)
  );

  CREATE TABLE IF NOT EXISTS game_logs (
    leagueId   TEXT NOT NULL,
    gameId     TEXT NOT NULL,
    season     INTEGER NOT NULL DEFAULT 0,
    eventsJson TEXT NOT NULL,
    PRIMARY KEY (leagueId, gameId)
  );

  CREATE TABLE IF NOT EXISTS game_results (
    leagueId     TEXT NOT NULL,
    gameId       TEXT NOT NULL,
    season       INTEGER NOT NULL,
    week         INTEGER NOT NULL,
    homeTeamId   TEXT NOT NULL,
    awayTeamId   TEXT NOT NULL,
    homeScore    INTEGER NOT NULL,
    awayScore    INTEGER NOT NULL,
    winnerTeamId TEXT,
    tie          INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (leagueId, gameId)
  );
`);

// Migrations — these are no-ops if columns already exist
try { db.exec(`ALTER TABLE leagues ADD COLUMN commissionerId TEXT NOT NULL DEFAULT ''`); } catch { /* already exists */ }
try { db.exec(`ALTER TABLE leagues ADD COLUMN inviteCode TEXT`); } catch { /* already exists */ }
try { db.exec(`ALTER TABLE game_logs ADD COLUMN season INTEGER NOT NULL DEFAULT 0`); } catch { /* already exists */ }

// ── Phase 37 in-memory rating migration ───────────────────────────────────────
// Remaps old legacy rating field names to GDD-aligned names for saved leagues.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function migrateRatings(r: any): any {
  if (!r || typeof r !== 'object') return r;
  const pos = r.position as string | undefined;
  switch (pos) {
    case 'RB': {
      const out: Record<string, unknown> = { position: 'RB' };
      out.speed        = r.speed        ?? 50;
      out.elusiveness  = r.elusiveness  ?? r.agility ?? 50;
      out.power        = r.power        ?? 50;
      out.vision       = r.vision       ?? 50;
      out.ballSecurity = r.ballSecurity ?? 50;
      if (r.personality) out.personality = r.personality;
      return out;
    }
    case 'WR': {
      const out: Record<string, unknown> = { position: 'WR' };
      out.speed        = r.speed        ?? 50;
      out.routeRunning = r.routeRunning ?? 50;
      out.hands        = r.hands        ?? r.catching ?? 50;
      out.yac          = r.yac          ?? 50;
      out.size         = r.size         ?? 50;
      if (r.personality) out.personality = r.personality;
      return out;
    }
    case 'TE': {
      const out: Record<string, unknown> = { position: 'TE' };
      out.speed        = r.speed        ?? 50;
      out.routeRunning = r.routeRunning ?? 50;
      out.hands        = r.hands        ?? r.catching ?? 50;
      out.yac          = r.yac          ?? 50;
      out.size         = r.size         ?? 50;
      out.blocking     = r.blocking     ?? 50;
      if (r.personality) out.personality = r.personality;
      return out;
    }
    case 'OT': case 'OG': case 'C': {
      const out: Record<string, unknown> = { position: pos };
      out.passBlocking = r.passBlocking ?? 50;
      out.runBlocking  = r.runBlocking  ?? 50;
      out.awareness    = r.awareness    ?? 50;
      if (r.personality) out.personality = r.personality;
      return out;
    }
    case 'DE': case 'DT': {
      const out: Record<string, unknown> = { position: pos };
      out.passRush    = r.passRush    ?? 50;
      out.runDefense  = r.runDefense  ?? r.runStop ?? 50;
      out.discipline  = r.discipline  ?? 50;
      if (r.personality) out.personality = r.personality;
      return out;
    }
    case 'OLB': case 'MLB': {
      const out: Record<string, unknown> = { position: pos };
      out.passRush    = r.passRush    ?? 50;
      out.runDefense  = r.runDefense  ?? r.runStop ?? 50;
      out.coverage    = r.coverage    ?? 50;
      out.speed       = r.speed       ?? r.athleticism ?? 50;
      out.pursuit     = r.pursuit     ?? 50;
      out.awareness   = r.awareness   ?? 50;  // new field — default 50
      if (r.personality) out.personality = r.personality;
      return out;
    }
    case 'CB': {
      // coverage → split into manCoverage + zoneCoverage
      // old "coverage" field maps to manCoverage; zone defaults slightly lower
      const oldCov = r.coverage ?? r.manCoverage ?? 50;
      const out: Record<string, unknown> = { position: 'CB' };
      out.manCoverage  = r.manCoverage  ?? oldCov;
      out.zoneCoverage = r.zoneCoverage ?? Math.max(1, Math.min(99, oldCov - 5));
      out.ballSkills   = r.ballSkills   ?? 50;
      out.speed        = r.speed        ?? 50;
      out.size         = r.size         ?? 50;
      out.awareness    = r.awareness    ?? 50;   // new field — default 50
      out.tackling     = r.tackling     ?? 50;   // new field — default 50
      if (r.personality) out.personality = r.personality;
      return out;
    }
    case 'FS': case 'SS': {
      // range was stored — now it's derived (speed*0.6 + awareness*0.4), drop the stored field
      // coverage → split; old zoneCoverage or coverage maps to zoneCoverage
      const oldCov = r.zoneCoverage ?? r.coverage ?? 50;
      const out: Record<string, unknown> = { position: pos };
      out.manCoverage  = r.manCoverage  ?? Math.max(1, Math.min(99, oldCov - 8));
      out.zoneCoverage = r.zoneCoverage ?? oldCov;
      out.ballSkills   = r.ballSkills   ?? 50;
      out.speed        = r.speed        ?? r.athleticism ?? 50;
      out.size         = r.size         ?? 50;
      out.awareness    = r.awareness    ?? 50;   // new field — default 50
      out.tackling     = r.tackling     ?? r.hitPower ?? 50;  // hitPower → tackling
      if (r.personality) out.personality = r.personality;
      return out;
    }
    default:
      return r;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function migratePlayer(p: any): any {
  if (!p || typeof p !== 'object') return p;
  return {
    ...p,
    trueRatings:    migrateRatings(p.trueRatings),
    scoutedRatings: migrateRatings(p.scoutedRatings),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function migrateLeagueState(state: any): any {
  if (!state || typeof state !== 'object') return state;

  const migrateTeam = (team: any) => ({
    ...team,
    roster: (team.roster ?? []).map(migratePlayer),
  });

  return {
    ...state,
    teams:       (state.teams       ?? []).map(migrateTeam),
    freeAgents:  (state.freeAgents  ?? []).map(migratePlayer),
    draftClasses: (state.draftClasses ?? []).map((dc: any) => ({
      ...dc,
      prospects: (dc.prospects ?? []).map((p: any) => ({
        ...p,
        trueRatings: migrateRatings(p.trueRatings),
      })),
    })),
  };
}

// ── Row types ─────────────────────────────────────────────────────────────────

interface UserRow {
  id: string;
  username: string;
  passwordHash: string;
  createdAt: number;
}

interface LeagueRow {
  id: string;
  displayName: string;
  visibility: string;
  passwordHash: string | null;
  advanceSchedule: string | null;
  phase: string;
  currentYear: number;
  createdAt: number;
  updatedAt: number;
  stateJson: string;
}

interface LeagueSummaryRow {
  id: string;
  displayName: string;
  phase: string;
  currentYear: number;
  updatedAt: number;
}

interface MembershipRow {
  teamId: string;
  teamName: string;
}

interface LeagueMemberRow {
  userId:   string;
  username: string;
  teamId:   string;
  teamName: string;
}

interface UserLeagueRow {
  leagueId: string;
  displayName: string;
  phase: string;
  currentYear: number;
  teamId: string;
  teamName: string;
  updatedAt: number;
}

// ── League helpers ────────────────────────────────────────────────────────────

export function getLeague(id: string): League | null {
  const row = db.prepare('SELECT stateJson FROM leagues WHERE id = ?').get(id) as Pick<LeagueRow, 'stateJson'> | undefined;
  if (!row) return null;
  try {
    const state = migrateLeagueState(JSON.parse(row.stateJson)) as League;

    // One-time migration: if this is an old league with events embedded in
    // final games, extract them to game_logs and re-save a stripped blob.
    const season = state.currentSeason.year;
    let hadEmbeddedEvents = false;
    const migratedGames = state.currentSeason.games.map(game => {
      if (game.status === 'final' && Array.isArray(game.events) && game.events.length > 0) {
        hadEmbeddedEvents = true;
        db.prepare(`INSERT OR REPLACE INTO game_logs (leagueId, gameId, season, eventsJson) VALUES (?, ?, ?, ?)`)
          .run(id, game.id, season, JSON.stringify(game.events));
        writeGameResult(id, game, season);
        return { ...game, events: [] };
      }
      return game;
    });

    if (hadEmbeddedEvents) {
      const slim = { ...state, currentSeason: { ...state.currentSeason, games: migratedGames } };
      db.prepare(`UPDATE leagues SET stateJson = ?, updatedAt = ? WHERE id = ?`)
        .run(JSON.stringify(slim), Date.now(), id);
      console.log(`[db] Migrated league ${id}: moved play events to game_logs`);
      return slim;
    }

    return state;
  } catch (err) {
    console.error(`[db] Failed to parse stateJson for league ${id}:`, err);
    return null;
  }
}

export function saveLeague(league: League): void {
  const now = Date.now();

  // Strip play events from final games before serialising the league blob.
  // Events are persisted separately in game_logs, keyed by (leagueId, gameId).
  const saveWithStrip = db.transaction(() => {
    const season = league.currentSeason.year;
    const games = league.currentSeason.games.map(game => {
      if (game.status === 'final' && Array.isArray(game.events) && game.events.length > 0) {
        db.prepare(`INSERT OR REPLACE INTO game_logs (leagueId, gameId, season, eventsJson) VALUES (?, ?, ?, ?)`)
          .run(league.id, game.id, season, JSON.stringify(game.events));
        writeGameResult(league.id, game, season);
        return { ...game, events: [] };
      }
      return game;
    });

    const slim = { ...league, currentSeason: { ...league.currentSeason, games } };

    db.prepare(`
      UPDATE leagues
      SET stateJson = ?, phase = ?, currentYear = ?, advanceSchedule = ?, updatedAt = ?
      WHERE id = ?
    `).run(
      JSON.stringify(slim),
      league.phase,
      league.currentSeason.year,
      league.advanceSchedule ?? null,
      now,
      league.id,
    );
  });

  saveWithStrip();
}

export function createLeagueRow(league: League, passwordHash: string | null): void {
  const now = Date.now();
  db.prepare(`
    INSERT INTO leagues (id, displayName, visibility, passwordHash, advanceSchedule, phase, currentYear, createdAt, updatedAt, stateJson)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    league.id,
    league.displayName,
    league.visibility,
    passwordHash,
    league.advanceSchedule ?? null,
    league.phase,
    league.currentSeason.year,
    now,
    now,
    JSON.stringify(league),
  );
}

export function listPublicLeagues(): { id: string; displayName: string; phase: string; currentYear: number; updatedAt: number }[] {
  return db.prepare(`
    SELECT id, displayName, phase, currentYear, updatedAt
    FROM leagues WHERE visibility = 'public'
    ORDER BY updatedAt DESC
  `).all() as LeagueSummaryRow[];
}

export function getLeaguePasswordHash(id: string): string | null {
  const row = db.prepare('SELECT passwordHash FROM leagues WHERE id = ?').get(id) as Pick<LeagueRow, 'passwordHash'> | undefined;
  return row?.passwordHash ?? null;
}

export function getScheduledLeagueIds(): string[] {
  const rows = db.prepare('SELECT id FROM leagues WHERE advanceSchedule IS NOT NULL').all() as { id: string }[];
  return rows.map(r => r.id);
}

// ── User helpers ──────────────────────────────────────────────────────────────

export function createUser(id: string, username: string, passwordHash: string): void {
  db.prepare(`
    INSERT INTO users (id, username, passwordHash, createdAt) VALUES (?, ?, ?, ?)
  `).run(id, username, passwordHash, Date.now());
}

export function getUserByUsername(username: string): { id: string; username: string; passwordHash: string; createdAt: number } | null {
  const row = db.prepare('SELECT id, username, passwordHash, createdAt FROM users WHERE username = ? COLLATE NOCASE').get(username) as UserRow | undefined;
  return row ?? null;
}

// ── Membership helpers ────────────────────────────────────────────────────────

export function getMembership(leagueId: string, userId: string): { teamId: string; teamName: string } | null {
  const row = db.prepare('SELECT teamId, teamName FROM league_memberships WHERE leagueId = ? AND userId = ?').get(leagueId, userId) as MembershipRow | undefined;
  return row ?? null;
}

export function addMembership(leagueId: string, userId: string, teamId: string, teamName: string): void {
  db.prepare(`
    INSERT OR REPLACE INTO league_memberships (leagueId, userId, teamId, teamName)
    VALUES (?, ?, ?, ?)
  `).run(leagueId, userId, teamId, teamName);
}

export function getUserLeagues(userId: string): { leagueId: string; displayName: string; phase: string; currentYear: number; teamId: string; teamName: string; updatedAt: number }[] {
  return db.prepare(`
    SELECT m.leagueId, l.displayName, l.phase, l.currentYear, m.teamId, m.teamName, l.updatedAt
    FROM league_memberships m
    JOIN leagues l ON l.id = m.leagueId
    WHERE m.userId = ?
    ORDER BY l.updatedAt DESC
  `).all(userId) as UserLeagueRow[];
}

export function listLeagueMembers(leagueId: string): { userId: string; username: string; teamId: string; teamName: string }[] {
  return db.prepare(`
    SELECT m.userId, u.username, m.teamId, m.teamName
    FROM league_memberships m
    JOIN users u ON u.id = m.userId
    WHERE m.leagueId = ?
    ORDER BY m.teamName
  `).all(leagueId) as LeagueMemberRow[];
}

export function removeMembership(leagueId: string, userId: string): void {
  db.prepare('DELETE FROM league_memberships WHERE leagueId = ? AND userId = ?').run(leagueId, userId);
}

export function updateLeaguePasswordHash(leagueId: string, passwordHash: string | null): void {
  db.prepare('UPDATE leagues SET passwordHash = ? WHERE id = ?').run(passwordHash, leagueId);
}

// ── Game log helpers ──────────────────────────────────────────────────────────

/** Internal: write one lightweight game result row. INSERT OR IGNORE so final results are immutable. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function writeGameResult(leagueId: string, game: any, season: number): void {
  const tie = game.homeScore === game.awayScore ? 1 : 0;
  const winnerTeamId = tie
    ? null
    : (game.homeScore > game.awayScore ? game.homeTeam.id : game.awayTeam.id);
  db.prepare(`
    INSERT OR IGNORE INTO game_results
      (leagueId, gameId, season, week, homeTeamId, awayTeamId, homeScore, awayScore, winnerTeamId, tie)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(leagueId, game.id, season, game.week,
         game.homeTeam.id, game.awayTeam.id,
         game.homeScore, game.awayScore,
         winnerTeamId, tie);
}

/** Fetch the play-by-play event log for a completed game. Returns null if not found or already purged. */
export function getGameLog(leagueId: string, gameId: string): PlayEvent[] | null {
  const row = db.prepare('SELECT eventsJson FROM game_logs WHERE leagueId = ? AND gameId = ?')
    .get(leagueId, gameId) as { eventsJson: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.eventsJson) as PlayEvent[];
  } catch {
    return null;
  }
}

/** Delete all play-by-play logs for a completed season. Called at season rollover. */
export function purgeSeasonGameLogs(leagueId: string, season: number): void {
  const { changes } = db.prepare('DELETE FROM game_logs WHERE leagueId = ? AND season = ?')
    .run(leagueId, season) as { changes: number };
  console.log(`[db] Purged ${changes} game_log entries for league ${leagueId} season ${season}`);
}

export interface GameResult {
  leagueId:     string;
  gameId:       string;
  season:       number;
  week:         number;
  homeTeamId:   string;
  awayTeamId:   string;
  homeScore:    number;
  awayScore:    number;
  winnerTeamId: string | null;
  tie:          number; // 1 = tie, 0 = not
}

/** Fetch lightweight per-game results for a given season. Persisted forever. */
export function getGameResults(leagueId: string, season: number): GameResult[] {
  return db.prepare(
    'SELECT * FROM game_results WHERE leagueId = ? AND season = ? ORDER BY week'
  ).all(leagueId, season) as GameResult[];
}
