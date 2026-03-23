import { type League } from './types';

const BASE =
  window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : 'https://football-sim-n7sl.onrender.com';

async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export interface LeagueSummary {
  id: string;
  displayName: string;
  currentWeek: number;
  year: number;
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
export const saveLeague   = (id: string) => request<{ ok: boolean }>(`/league/${id}/save`, 'POST');
export const loadLeague   = (id: string) => request<League>(`/league/${id}/load`, 'POST');
export const claimTeam    = (id: string, teamId: string, gmId: string) => request<League>(`/league/${id}/claim-team`, 'POST', { teamId, gmId });
export const proposeTrade = (id: string, fromTeamId: string, toTeamId: string, playerId: string, gmId: string) =>
  request<League>(`/league/${id}/propose-trade`, 'POST', { fromTeamId, toTeamId, playerId, gmId });
export const respondTrade = (id: string, proposalId: string, gmId: string, accept: boolean) =>
  request<League>(`/league/${id}/respond-trade`, 'POST', { proposalId, gmId, accept });
export const markNotificationsRead = (id: string, gmId: string) =>
  request<League>(`/league/${id}/mark-notifications-read`, 'POST', { gmId });
