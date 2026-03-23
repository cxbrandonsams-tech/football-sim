import { type League, type TradeAsset } from './types';

// In dev, Vite proxies /league, /leagues, /auth, /my-leagues → localhost:3000
// In production (Vercel), requests go directly to the Render backend.
const BASE =
  import.meta.env.DEV
    ? ''
    : 'https://football-sim-n7sl.onrender.com';

// ── Auth token storage ────────────────────────────────────────────────────────

export let authToken: string | null = localStorage.getItem('authToken');

export function setAuthToken(token: string | null): void {
  authToken = token;
  if (token) localStorage.setItem('authToken', token);
  else localStorage.removeItem('authToken');
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
export const draftPick = (id: string, playerId: string) =>
  request<League>(`/league/${id}/draft-pick`, 'POST', { playerId });
export const simDraft = (id: string) =>
  request<League>(`/league/${id}/sim-draft`, 'POST');

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
