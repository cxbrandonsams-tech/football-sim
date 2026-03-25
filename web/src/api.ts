import { type League, type TradeAsset, type GameplanSettings } from './types';

// API base URL — set VITE_API_URL in Vercel environment variables.
// In local dev this is empty ('') and Vite proxies API routes to localhost:3000.
// Never hardcode a URL here.
const BASE: string = import.meta.env.VITE_API_URL ?? '';

// ── Auth state storage ────────────────────────────────────────────────────────
// All three values are persisted in localStorage so they survive a page refresh.
// authToken  — JWT used in Authorization header for every request
// authUserId / authUsername — cached from the last successful login/me response

export let authToken:    string | null = localStorage.getItem('authToken');
export let authUserId:   string | null = localStorage.getItem('authUserId');
export let authUsername: string | null = localStorage.getItem('authUsername');

export function setAuthToken(token: string | null): void {
  authToken = token;
  if (token) localStorage.setItem('authToken', token);
  else        localStorage.removeItem('authToken');
}

/** Persist the authenticated user's identity alongside the token. */
export function setAuthUser(userId: string | null, username: string | null): void {
  authUserId   = userId;
  authUsername = username;
  if (userId)   localStorage.setItem('authUserId',   userId);
  else          localStorage.removeItem('authUserId');
  if (username) localStorage.setItem('authUsername', username);
  else          localStorage.removeItem('authUsername');
}

/** Clear all auth state (token + user) — call on logout or 401. */
export function clearAuth(): void {
  setAuthToken(null);
  setAuthUser(null, null);
}

// ── Core request helper ───────────────────────────────────────────────────────

async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export interface AuthResult { token: string; userId: string; username: string; }

export const signup = (username: string, password: string) =>
  request<AuthResult>('/auth/signup', 'POST', { username, password });

export const login = (username: string, password: string) =>
  request<AuthResult>('/auth/login', 'POST', { username, password });

/** Validate the stored token and return user identity from the server. */
export const getMe = () => request<{ userId: string; username: string }>('/auth/me');

// ── My leagues ────────────────────────────────────────────────────────────────

export interface MyLeagueSummary {
  leagueId: string;
  displayName: string;
  phase: string;
  currentYear: number;
  teamId: string;
  teamName: string;
  updatedAt: number;
}

export const getMyLeagues = () => request<MyLeagueSummary[]>('/my-leagues');

// ── League ────────────────────────────────────────────────────────────────────

export interface LeagueSummary {
  id: string;
  displayName: string;
  phase: string;
  currentYear: number;
  updatedAt: number;
}

export interface CreateLeagueParams {
  displayName: string;
  visibility: 'public' | 'private';
  password?: string;
  advanceSchedule?: string;
}

export const listLeagues  = () => request<LeagueSummary[]>('/leagues');
export const createLeague = (params: CreateLeagueParams) => request<{ id: string }>('/league/create', 'POST', params);
export const joinLeague   = (id: string, password?: string) => request<League>('/league/join', 'POST', { id, password });
export const fetchLeague  = (id: string) => request<League>(`/league/${id}`);
export const fetchGameEvents = (leagueId: string, gameId: string) =>
  request<import('./types').PlayEvent[]>(`/league/${leagueId}/game/${gameId}/events`);
export const advanceWeek  = (id: string) => request<League>(`/league/${id}/advance-week`, 'POST');
export const claimTeam    = (id: string, teamId: string) => request<League>(`/league/${id}/claim-team`, 'POST', { teamId });
export const proposeTrade = (
  id: string, fromTeamId: string, toTeamId: string,
  fromAssets: TradeAsset[], toAssets: TradeAsset[],
) => request<League>(`/league/${id}/propose-trade`, 'POST', { fromTeamId, toTeamId, fromAssets, toAssets });
export const respondTrade = (id: string, proposalId: string, accept: boolean) =>
  request<League>(`/league/${id}/respond-trade`, 'POST', { proposalId, accept });
export const markNotificationsRead = (id: string) =>
  request<League>(`/league/${id}/mark-notifications-read`, 'POST');
export const extendPlayer  = (id: string, playerId: string) =>
  request<League>(`/league/${id}/extend-player`,  'POST', { playerId });
export const releasePlayer = (id: string, playerId: string) =>
  request<League>(`/league/${id}/release-player`, 'POST', { playerId });
export const signFreeAgent = (id: string, playerId: string) =>
  request<League>(`/league/${id}/sign-free-agent`, 'POST', { playerId });
export const setDepthChart = (id: string, slot: string, playerIds: string[]) =>
  request<League>(`/league/${id}/set-depth-chart`, 'POST', { slot, playerIds });
export const setGameplan = (id: string, gameplan: Partial<GameplanSettings>) =>
  request<League>(`/league/${id}/set-gameplan`, 'POST', gameplan);
export const draftPick = (id: string, playerId: string) =>
  request<League>(`/league/${id}/draft-pick`, 'POST', { playerId });
export const simDraft = (id: string) =>
  request<League>(`/league/${id}/sim-draft`, 'POST');
export const scoutProspect = (id: string, prospectId: string) =>
  request<League>(`/league/${id}/scout-prospect`, 'POST', { prospectId });
export const updateDraftBoard = (id: string, board: string[]) =>
  request<League>(`/league/${id}/draft-board`, 'POST', { board });
export const advanceDraftPick = (id: string) =>
  request<League>(`/league/${id}/advance-draft-pick`, 'POST');
export const advanceToUserPick = (id: string) =>
  request<League>(`/league/${id}/advance-to-user-pick`, 'POST');
export const offerContract = (id: string, playerId: string, salary: number, years: number) =>
  request<{ league: League; accepted: boolean; message: string }>(`/league/${id}/offer-contract`, 'POST', { playerId, salary, years });
export const shopPlayer = (id: string, playerId: string) =>
  request<{ league: League; count: number }>(`/league/${id}/shop-player`, 'POST', { playerId });
export const fireCoach = (id: string, role: 'OC' | 'DC') =>
  request<League>(`/league/${id}/fire-coach`, 'POST', { role });
export const hireCoach = (id: string, coachId: string, role: 'HC' | 'OC' | 'DC') =>
  request<League>(`/league/${id}/hire-coach`, 'POST', { coachId, role });
export const promoteWithin = (id: string, role: 'OC' | 'DC') =>
  request<League>(`/league/${id}/promote-within`, 'POST', { role });

// ── Commissioner ──────────────────────────────────────────────────────────────

export interface LeagueMember {
  userId:   string;
  username: string;
  teamId:   string;
  teamName: string;
}

export const getLeagueMembers = (id: string) =>
  request<LeagueMember[]>(`/league/${id}/members`);

export const updateLeagueSettings = (
  id: string,
  settings: { displayName?: string; maxUsers?: number; visibility?: 'public' | 'private' },
) => request<League>(`/league/${id}/settings`, 'POST', settings);

export const kickMember = (id: string, userId: string) =>
  request<{ ok: boolean }>(`/league/${id}/kick-member`, 'POST', { userId });
