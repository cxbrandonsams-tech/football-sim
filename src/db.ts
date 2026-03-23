import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { type League } from './models/League';

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
`);

// Migrations — these are no-ops if columns already exist
try { db.exec(`ALTER TABLE leagues ADD COLUMN commissionerId TEXT NOT NULL DEFAULT ''`); } catch { /* already exists */ }
try { db.exec(`ALTER TABLE leagues ADD COLUMN inviteCode TEXT`); } catch { /* already exists */ }

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
  return JSON.parse(row.stateJson) as League;
}

export function saveLeague(league: League): void {
  const now = Date.now();
  db.prepare(`
    UPDATE leagues
    SET stateJson = ?, phase = ?, currentYear = ?, advanceSchedule = ?, updatedAt = ?
    WHERE id = ?
  `).run(
    JSON.stringify(league),
    league.phase,
    league.currentSeason.year,
    league.advanceSchedule ?? null,
    now,
    league.id,
  );
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
  const row = db.prepare('SELECT id, username, passwordHash, createdAt FROM users WHERE username = ?').get(username) as UserRow | undefined;
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
