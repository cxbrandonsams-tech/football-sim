import { useState, useEffect, useRef, useMemo } from 'react';
import { deriveBoxScore } from './boxScore';
import { aggregateSeasonStats, type SeasonPlayerStats } from './seasonStats';
import { DashboardSchedule } from './DashboardSchedule';
import {
  listLeagues, createLeague, joinLeague, fetchLeague, advanceWeek,
  claimTeam as claimTeamApi, proposeTrade as proposeTradeApi, respondTrade as respondTradeApi,
  markNotificationsRead as markReadApi,
  extendPlayer as extendPlayerApi, releasePlayer as releasePlayerApi,
  signFreeAgent as signFreeAgentApi, setDepthChart as setDepthChartApi, setGameplan as setGameplanApi,
  draftPick as draftPickApi, simDraft as simDraftApi,
  signup, login, getMyLeagues,
  getLeagueMembers as getLeagueMembersApi, updateLeagueSettings as updateLeagueSettingsApi, kickMember as kickMemberApi,
  setAuthToken, authToken,
  type LeagueSummary, type CreateLeagueParams, type AuthResult, type MyLeagueSummary, type LeagueMember,
} from './api';
import { computeStandings, type League, type Standing, type Game, type Player, type PlayEvent, type TradeProposal, type TradeAsset, type LeagueNotification, type Activity, type PlayoffBracket, type SeasonRecord, type Division, type DraftSlot, type NewsItem, type GameplanSettings, DEFAULT_GAMEPLAN, type PassEmphasis, type RunEmphasis, type Tempo, type PlayActionUsage, type DefensiveFocus, type OffensivePlaybook, type DefensivePlaybook } from './types';
import './App.css';

// ── Shared helpers ─────────────────────────────────────────────────────────────

/** Strip "Error: " prefix that JS adds to String(e) */
function friendlyError(e: unknown): string {
  if (e instanceof TypeError && e.message.toLowerCase().includes('fetch')) {
    return 'Network error — the server may be unavailable or starting up. Please try again.';
  }
  const s = String(e);
  return s.startsWith('Error: ') ? s.slice(7) : s;
}

/** Format a timestamp: time-only if today, date+time otherwise */
function fmtTime(ts: number): string {
  const d = new Date(ts);
  const sameDay = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return sameDay ? time : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`;
}

// ── Top-level screen ───────────────────────────────────────────────────────────

type Screen = 'auth' | 'my-leagues' | 'create' | 'join' | 'browse' | 'team-select' | 'league';

export default function App() {
  // Auth state
  const [userId, setUserId]     = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);

  // Screen/league state
  const [screen, setScreen]     = useState<Screen>(() => authToken ? 'my-leagues' : 'auth');
  const [leagueId, setLeagueId] = useState<string | null>(null);
  const [league, setLeague]     = useState<League | null>(null);
  const [myTeamId, setMyTeamId] = useState<string | null>(null);

  function handleAuthSuccess(result: AuthResult) {
    setAuthToken(result.token);
    setUserId(result.userId);
    setUsername(result.username);
    setScreen('my-leagues');
  }

  function enterLeague(id: string, data: League, knownTeamId?: string) {
    const myTeam = knownTeamId
      ? data.teams.find(t => t.id === knownTeamId)
      : data.teams.find(t => t.ownerId === userId);
    setLeagueId(id);
    setLeague(data);
    if (myTeam) {
      setMyTeamId(myTeam.id);
      setScreen('league');
    } else {
      setScreen('team-select');
    }
  }

  async function handleClaimTeam(teamId: string) {
    const updated = await claimTeamApi(leagueId!, teamId);
    setLeague(updated);
    setMyTeamId(teamId);
    setScreen('league');
  }

  function leaveLeague() {
    setLeague(null); setLeagueId(null); setMyTeamId(null);
    setScreen(username ? 'my-leagues' : 'auth');
  }

  if (screen === 'auth') return <AuthScreen onSuccess={handleAuthSuccess} />;

  if (screen === 'my-leagues') return (
    <MyLeaguesScreen
      username={username ?? ''}
      onNav={setScreen}
      onEnterLeague={enterLeague}
    />
  );

  if (screen === 'create') return <CreateForm onBack={() => setScreen('my-leagues')} onEnter={enterLeague} />;
  if (screen === 'join')   return <JoinForm onBack={() => setScreen('my-leagues')} onEnter={enterLeague} />;
  if (screen === 'browse') return <BrowseLeagues onBack={() => setScreen('my-leagues')} onEnter={enterLeague} />;

  if (!league || !leagueId) return null;

  if (screen === 'team-select') {
    return (
      <TeamSelect
        league={league}
        userId={userId ?? ''}
        onClaim={handleClaimTeam}
        onBack={leaveLeague}
      />
    );
  }

  // screen === 'league'
  if (!myTeamId) return null;
  return (
    <LeagueApp
      leagueId={leagueId}
      league={league}
      setLeague={setLeague}
      myTeamId={myTeamId}
      userId={userId ?? ''}
      username={username ?? ''}
      onLeave={leaveLeague}
      onMyLeagues={() => setScreen('my-leagues')}
    />
  );
}

// ── Auth Screen ────────────────────────────────────────────────────────────────

function AuthScreen({ onSuccess }: { onSuccess: (r: AuthResult) => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const result = mode === 'login' ? await login(username, password) : await signup(username, password);
      onSuccess(result);
    } catch (e) { setError(friendlyError(e)); }
    finally { setBusy(false); }
  }

  return (
    <div className="form-screen">
      <div className="form-card">
        <h1>Gridiron</h1>
        <p className="landing-sub">Football simulation league manager</p>
        <div className="auth-mode-toggle">
          <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Log In</button>
          <button className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')}>Sign Up</button>
        </div>
        <form onSubmit={submit}>
          <label>Username<input value={username} onChange={e => setUsername(e.target.value)} autoFocus /></label>
          <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} /></label>
          {error && <div className="form-error">{error}</div>}
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? '…' : mode === 'login' ? 'Log In' : 'Sign Up'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── My Leagues Screen ──────────────────────────────────────────────────────────

function MyLeaguesScreen({ username, onNav, onEnterLeague }: {
  username: string;
  onNav: (s: Screen) => void;
  onEnterLeague: (id: string, data: League, teamId?: string) => void;
}) {
  const [summaries, setSummaries] = useState<MyLeagueSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMyLeagues().then(setSummaries).catch(e => setError(String(e)));
  }, []);

  async function enter(s: MyLeagueSummary) {
    const data = await fetchLeague(s.leagueId);
    onEnterLeague(s.leagueId, data, s.teamId || undefined);
  }

  return (
    <div className="form-screen">
      <div className="form-card wide">
        <div className="my-leagues-header">
          <h2>My Leagues</h2>
          <span className="muted">Welcome, {username}</span>
        </div>
        {error && <div className="form-error">{error}</div>}
        {summaries === null && <p className="muted">Loading…</p>}
        {summaries?.length === 0 && <p className="muted">No leagues yet.</p>}
        {summaries && summaries.length > 0 && (
          <table>
            <thead><tr><th>League</th><th>Season</th><th>Phase</th><th>Your Team</th><th></th></tr></thead>
            <tbody>
              {summaries.map(s => (
                <tr key={s.leagueId}>
                  <td>{s.displayName}</td>
                  <td>{s.currentYear}</td>
                  <td>{s.phase.replace('_', ' ')}</td>
                  <td>{s.teamName || '—'}</td>
                  <td><button className="btn-sm" onClick={() => enter(s)}>Enter</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="landing-actions">
          <button className="btn-primary" onClick={() => onNav('create')}>Create League</button>
          <button className="btn-secondary" onClick={() => onNav('join')}>Join by ID</button>
          <button className="btn-ghost" onClick={() => onNav('browse')}>Browse Public Leagues</button>
        </div>
      </div>
    </div>
  );
}

// ── Create League form ─────────────────────────────────────────────────────────

function CreateForm({ onBack, onEnter }: {
  onBack: () => void;
  onEnter: (id: string, league: League, teamId?: string) => void;
}) {
  const [displayName, setDisplayName] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!displayName.trim()) { setError('League name is required.'); return; }
    setBusy(true); setError(null);
    try {
      const params: CreateLeagueParams = { displayName: displayName.trim(), visibility };
      const { id } = await createLeague(params);
      const data = await fetchLeague(id);
      onEnter(id, data);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="form-screen">
      <div className="form-card">
        <button className="back-btn" onClick={onBack}>← Back</button>
        <h2>Create League</h2>
        <form onSubmit={submit}>
          <label>
            League name
            <input
              type="text" value={displayName} maxLength={50} autoFocus
              onChange={e => setDisplayName(e.target.value)}
              placeholder="My Fantasy League"
            />
          </label>
          <label>
            Visibility
            <div className="toggle-group">
              {(['public', 'private'] as const).map(v => (
                <button
                  key={v} type="button"
                  className={visibility === v ? 'toggle active' : 'toggle'}
                  onClick={() => setVisibility(v)}
                >
                  {v === 'public' ? '🌐 Public' : '🔒 Private'}
                </button>
              ))}
            </div>
          </label>
          {visibility === 'private' && (
            <p className="muted" style={{ fontSize: '0.83rem' }}>
              An invite code will be generated automatically. Share it from the Commissioner panel.
            </p>
          )}
          {error && <div className="form-error">{error}</div>}
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? 'Creating…' : 'Create League'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Join by ID form ────────────────────────────────────────────────────────────

function JoinForm({ onBack, onEnter }: {
  onBack: () => void;
  onEnter: (id: string, league: League, teamId?: string) => void;
}) {
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [needsPassword, setNeedsPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!id.trim()) { setError('League ID is required.'); return; }
    setBusy(true); setError(null);
    try {
      const data = await joinLeague(id.trim(), password || undefined);
      onEnter(id.trim(), data);
    } catch (e) {
      const msg = String(e);
      if (msg.includes('password') || msg.includes('403')) {
        setNeedsPassword(true);
        setError('This is a private league. Enter the invite code.');
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="form-screen">
      <div className="form-card">
        <button className="back-btn" onClick={onBack}>← Back</button>
        <h2>Join League</h2>
        <form onSubmit={submit}>
          <label>
            League ID
            <input
              type="text" value={id} autoFocus
              onChange={e => { setId(e.target.value); setNeedsPassword(false); setError(null); }}
              placeholder="Paste league ID"
            />
          </label>
          {needsPassword && (
            <label>
              Invite Code
              <input
                type="text" value={password} autoFocus
                onChange={e => setPassword(e.target.value)}
                placeholder="e.g. A1B2C3D4"
              />
            </label>
          )}
          {error && <div className="form-error">{error}</div>}
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? 'Joining…' : 'Join'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Browse public leagues ──────────────────────────────────────────────────────

function BrowseLeagues({ onBack, onEnter }: {
  onBack: () => void;
  onEnter: (id: string, league: League, teamId?: string) => void;
}) {
  const [leagues, setLeagues] = useState<LeagueSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  // Load on mount
  useEffect(() => {
    listLeagues().then(setLeagues).catch(e => setError(String(e)));
  }, []);

  async function join(id: string) {
    setJoiningId(id); setBusy(true); setError(null);
    try {
      const data = await joinLeague(id);
      onEnter(id, data);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false); setJoiningId(null);
    }
  }

  return (
    <div className="form-screen">
      <div className="form-card wide">
        <button className="back-btn" onClick={onBack}>← Back</button>
        <h2>Public Leagues</h2>
        {error && <div className="form-error">{error}</div>}
        {leagues === null && !error && <p className="muted">Loading…</p>}
        {leagues?.length === 0 && <p className="muted">No public leagues yet. Create one!</p>}
        {leagues && leagues.length > 0 && (
          <table>
            <thead>
              <tr><th>Name</th><th>Year</th><th>Phase</th><th></th></tr>
            </thead>
            <tbody>
              {leagues.map(l => (
                <tr key={l.id}>
                  <td>{l.displayName}</td>
                  <td>{l.currentYear}</td>
                  <td>{l.phase.replace('_', ' ')}</td>
                  <td>
                    <button
                      className="btn-sm"
                      disabled={busy}
                      onClick={() => join(l.id)}
                    >
                      {joiningId === l.id ? 'Joining…' : 'Join'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Team selection ─────────────────────────────────────────────────────────────

function TeamSelect({ league, userId, onClaim, onBack }: {
  league: League;
  userId: string;
  onClaim: (teamId: string) => Promise<void>;
  onBack: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function claim(teamId: string) {
    setBusy(true); setError(null);
    try { await onClaim(teamId); }
    catch (e) { setError(friendlyError(e)); }
    finally { setBusy(false); }
  }

  return (
    <div className="form-screen">
      <div className="form-card wide">
        <button className="back-btn" onClick={onBack}>← Back</button>
        <h2>Choose Your Team</h2>
        <p className="muted">Select an unclaimed team to manage as GM.</p>
        {error && <div className="form-error">{error}</div>}
        <table>
          <thead><tr><th>Team</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {[...league.teams]
              .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
              .map(t => {
              const claimed = !!t.ownerId && t.ownerId !== userId;
              return (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td className={claimed ? 'muted' : 'pos'}>{claimed ? 'Taken' : 'Available'}</td>
                  <td>
                    {!claimed && (
                      <button className="btn-sm" disabled={busy} onClick={() => claim(t.id)}>
                        Claim
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── League app (existing UI) ───────────────────────────────────────────────────

function LeagueApp({ leagueId, league, setLeague, myTeamId, userId, username, onLeave, onMyLeagues }: {
  leagueId: string;
  league: League;
  setLeague: (l: League) => void;
  myTeamId: string;
  userId: string;
  username: string;
  onLeave: () => void;
  onMyLeagues: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'dashboard' | 'standings' | 'playoffs' | 'leaders' | 'roster' | 'depth' | 'injuries' | 'free-agents' | 'team' | 'contracts' | 'trades' | 'activity' | 'draft' | 'news' | 'commissioner' | 'gameplan' | 'playbooks' | 'coaching'>('dashboard');
  const [rosterTeamId, setRosterTeamId] = useState(myTeamId);
  const [detailPlayerId, setDetailPlayerId] = useState<string | null>(null);

  async function action(fn: (id: string) => Promise<League>) {
    setBusy(true); setError(null);
    try { setLeague(await fn(leagueId)); }
    catch (e) { setError(friendlyError(e)); }
    finally { setBusy(false); }
  }

  async function handleProposeTrade(
    toTeamId: string, fromAssets: TradeAsset[], toAssets: TradeAsset[],
  ) {
    setLeague(await proposeTradeApi(leagueId, myTeamId, toTeamId, fromAssets, toAssets));
  }

  async function handleRespondTrade(proposalId: string, accept: boolean) {
    setLeague(await respondTradeApi(leagueId, proposalId, accept));
  }

  async function handleMarkRead() {
    setLeague(await markReadApi(leagueId));
  }

  async function handleExtendPlayer(playerId: string) {
    setBusy(true); setError(null);
    try { setLeague(await extendPlayerApi(leagueId, playerId)); }
    catch (e) { setError(friendlyError(e)); }
    finally { setBusy(false); }
  }

  async function handleReleasePlayer(playerId: string) {
    setBusy(true); setError(null);
    try { setLeague(await releasePlayerApi(leagueId, playerId)); }
    catch (e) { setError(friendlyError(e)); }
    finally { setBusy(false); }
  }

  async function handleSignFreeAgent(playerId: string) {
    setBusy(true); setError(null);
    try { setLeague(await signFreeAgentApi(leagueId, playerId)); }
    catch (e) { setError(friendlyError(e)); }
    finally { setBusy(false); }
  }

  async function handleSetDepthChart(slot: string, playerIds: string[]) {
    setBusy(true); setError(null);
    try { setLeague(await setDepthChartApi(leagueId, slot, playerIds)); }
    catch (e) { setError(friendlyError(e)); }
    finally { setBusy(false); }
  }

  async function handleDraftPick(playerId: string) {
    setBusy(true); setError(null);
    try { setLeague(await draftPickApi(leagueId, playerId)); }
    catch (e) { setError(friendlyError(e)); }
    finally { setBusy(false); }
  }

  async function handleSimDraft() {
    setBusy(true); setError(null);
    try { setLeague(await simDraftApi(leagueId)); }
    catch (e) { setError(friendlyError(e)); }
    finally { setBusy(false); }
  }

  const myNotifications = league.notifications.filter(n => n.teamId === myTeamId);
  const unreadCount = myNotifications.filter(n => !n.read).length;
  const [showNotifs, setShowNotifs] = useState(false);

  const standings = computeStandings(league);
  const maxWeek   = Math.max(...league.currentSeason.games.map(g => g.week));
  const rosterTeam = league.teams.find(t => t.id === rosterTeamId) ?? league.teams[0]!;
  const seasonStats = useMemo(
    () => aggregateSeasonStats(league.currentSeason.games),
    [league.currentSeason.games],
  );

  function handleViewPlayer(playerId: string) {
    setDetailPlayerId(playerId);
  }

  const isRegularSeason  = league.phase === 'regular_season';
  const hasPlayoffs      = !!(league.playoff || league.phase === 'postseason' || league.phase === 'offseason' || league.phase === 'draft');
  const pendingTrades    = league.tradeProposals.filter(p => p.toTeamId === myTeamId && p.status === 'pending').length;
  const isCommissioner   = !!league.commissionerId && league.commissionerId === userId;

  function advanceBtnLabel(): string {
    if (league.phase === 'offseason') return 'Start Draft';
    if (league.phase === 'draft') return league.draft?.complete ? 'Start Season' : 'Draft In Progress';
    if (league.phase === 'postseason') {
      const round = league.playoff?.currentRound;
      if (round === 'wildcard')     return 'Sim Wild Card';
      if (round === 'divisional')   return 'Sim Divisional';
      if (round === 'conference')   return 'Sim Conference';
      if (round === 'championship') return 'Sim Championship';
      return 'Season Complete';
    }
    return league.currentWeek > maxWeek ? 'Start Playoffs' : 'Advance Week';
  }

  function phaseLabel(): string {
    if (league.phase === 'postseason') return 'Playoffs';
    if (league.phase === 'offseason')  return 'Offseason';
    if (league.phase === 'draft') {
      const d = league.draft;
      if (!d) return 'Draft';
      if (d.complete) return 'Draft Complete';
      return `Draft — Rd ${d.slots[d.currentSlotIdx]?.round ?? '?'}, Pk ${d.slots[d.currentSlotIdx]?.pick ?? '?'}`;
    }
    return `Week ${league.currentWeek}`;
  }

  return (
    <div className="app">
      <header>
        <div className="header-left">
          <button className="back-btn inline" onClick={onLeave}>←</button>
          <h1>{league.displayName}</h1>
          <span className={`vis-badge ${league.visibility}`}>{league.visibility}</span>
        </div>
        <span className="season">Season {league.currentSeason.year} — {phaseLabel()}</span>
        <div className="header-actions">
          <span className="muted" style={{ fontSize: '0.85rem' }}>{username}</span>
          <button onClick={onMyLeagues}>My Leagues</button>
          <span className="league-id">{leagueId.slice(0, 8)}</span>
          <button className="notif-btn" onClick={() => setShowNotifs(v => !v)}>
            Notif{unreadCount > 0 && <span className="badge">{unreadCount}</span>}
          </button>
        </div>
      </header>

      {showNotifs && (
        <NotificationsPanel
          notifications={myNotifications}
          onMarkRead={handleMarkRead}
          onClose={() => setShowNotifs(false)}
        />
      )}

      {error && <div className="error">{error}</div>}

      <SeasonTimeline
        league={league}
        busy={busy}
        advanceBtnLabel={advanceBtnLabel()}
        onAdvance={() => action(advanceWeek)}
      />

      <nav className="app-nav">
        <div className="nav-group">
          <span className="nav-group-label">League</span>
          <button className={tab === 'dashboard' ? 'active' : ''} onClick={() => setTab('dashboard')}>Dashboard</button>
          <button className={tab === 'standings' ? 'active' : ''} onClick={() => setTab('standings')}>Standings</button>
          {hasPlayoffs && (
            <button className={tab === 'playoffs' ? 'active' : ''} onClick={() => setTab('playoffs')}>
              {league.phase === 'postseason' ? 'Playoffs' : 'Offseason'}
            </button>
          )}
          <button className={tab === 'news'    ? 'active' : ''} onClick={() => setTab('news')}>News</button>
          <button className={tab === 'leaders' ? 'active' : ''} onClick={() => setTab('leaders')}>Leaders</button>
          {(league.phase === 'draft' || league.draft) && (
            <button className={tab === 'draft' ? 'active' : ''} onClick={() => setTab('draft')}>
              Draft{league.draft && !league.draft.complete && <span className="badge">!</span>}
            </button>
          )}
        </div>
        <div className="nav-group">
          <span className="nav-group-label">Roster</span>
          <button className={tab === 'roster'      ? 'active' : ''} onClick={() => setTab('roster')}>Roster</button>
          <button className={tab === 'depth'       ? 'active' : ''} onClick={() => setTab('depth')}>Depth Chart</button>
          <button className={tab === 'injuries'    ? 'active' : ''} onClick={() => setTab('injuries')}>Injuries</button>
          <button className={tab === 'free-agents' ? 'active' : ''} onClick={() => setTab('free-agents')}>Free Agents</button>
        </div>
        <div className="nav-group">
          <span className="nav-group-label">Team</span>
          <button className={tab === 'team'      ? 'active' : ''} onClick={() => setTab('team')}>Overview</button>
          <button className={tab === 'contracts' ? 'active' : ''} onClick={() => setTab('contracts')}>Contracts</button>
          <button className={tab === 'trades'    ? 'active' : ''} onClick={() => setTab('trades')}>
            Trades{pendingTrades > 0 && <span className="badge">{pendingTrades}</span>}
          </button>
          <button className={tab === 'gameplan'  ? 'active' : ''} onClick={() => setTab('gameplan')}>Gameplan</button>
          <button className={tab === 'playbooks' ? 'active' : ''} onClick={() => setTab('playbooks')}>Playbooks</button>
          <button className={tab === 'coaching'  ? 'active' : ''} onClick={() => setTab('coaching')}>Coaching</button>
          {isCommissioner && (
            <button className={tab === 'commissioner' ? 'active' : ''} onClick={() => setTab('commissioner')}>
              Commissioner
            </button>
          )}
        </div>
      </nav>

      {tab === 'dashboard' && (
        <DashboardView
          league={league}
          myTeamId={myTeamId}
          standings={standings}
          onNavTo={setTab as (t: string) => void}
        />
      )}
      {tab === 'standings' && (
        <StandingsView standings={standings} userTeamId={myTeamId} divisions={league.divisions ?? []} />
      )}
      {tab === 'playoffs' && !isRegularSeason && (
        <PlayoffView
          playoff={league.playoff}
          teams={league.teams}
          seasonHistory={league.seasonHistory}
          busy={busy}
          advanceBtnLabel={advanceBtnLabel()}
          onAdvance={() => action(advanceWeek)}
        />
      )}
      {tab === 'roster' && (
        <RosterView
          teams={league.teams}
          selectedId={rosterTeamId}
          userTeamId={myTeamId}
          onSelect={setRosterTeamId}
          team={rosterTeam}
          isOffseason={league.phase === 'offseason'}
          busy={busy}
          onRelease={handleReleasePlayer}
          onExtend={handleExtendPlayer}
          onViewPlayer={handleViewPlayer}
        />
      )}
      {tab === 'trades' && (
        <TradesView
          league={league}
          myTeamId={myTeamId}
          onPropose={handleProposeTrade}
          onRespond={handleRespondTrade}
        />
      )}
      {tab === 'activity' && <ActivityFeed activities={league.activities} />}
      {tab === 'news' && <NewsView news={league.news ?? []} />}
      {tab === 'leaders' && (
        <LeadersView games={league.currentSeason.games} teams={league.teams} />
      )}
      {tab === 'depth' && (
        <DepthChartView
          team={league.teams.find(t => t.id === myTeamId)!}
          busy={busy}
          onReorder={handleSetDepthChart}
        />
      )}
      {tab === 'injuries' && (
        <InjuryReportView teams={league.teams} userTeamId={myTeamId} />
      )}
      {tab === 'free-agents' && (
        <FreeAgentsView
          freeAgents={league.freeAgents}
          isOffseason={league.phase === 'offseason'}
          busy={busy}
          onSign={handleSignFreeAgent}
        />
      )}
      {tab === 'team' && (
        <TeamOverviewView
          league={league}
          myTeamId={myTeamId}
        />
      )}
      {tab === 'contracts' && (
        <ContractsView
          team={league.teams.find(t => t.id === myTeamId)!}
          isOffseason={league.phase === 'offseason'}
          busy={busy}
          onExtend={handleExtendPlayer}
          onRelease={handleReleasePlayer}
        />
      )}
      {tab === 'draft' && (
        <DraftView
          league={league}
          myTeamId={myTeamId}
          busy={busy}
          onPick={handleDraftPick}
          onSimDraft={handleSimDraft}
          onAdvance={() => action(advanceWeek)}
        />
      )}
      {tab === 'commissioner' && isCommissioner && (
        <CommissionerView
          league={league}
          leagueId={leagueId}
          userId={userId}
          onLeagueUpdated={setLeague}
        />
      )}
      {tab === 'gameplan'  && <GameplanView  team={league.teams.find(t => t.id === myTeamId)!} leagueId={leagueId} onLeagueUpdated={setLeague} />}
      {tab === 'playbooks' && <PlaybooksView team={league.teams.find(t => t.id === myTeamId)!} leagueId={leagueId} onLeagueUpdated={setLeague} />}
      {tab === 'coaching'  && <CoachingView  team={league.teams.find(t => t.id === myTeamId)!} />}

      {detailPlayerId && (() => {
        const allPlayers = league.teams.flatMap(t => t.roster).concat(league.freeAgents);
        const rp = allPlayers.find(p => p.id === detailPlayerId);
        if (!rp) return null;
        const teamAbbr = league.teams.find(t => t.roster.some(p => p.id === detailPlayerId))?.abbreviation ?? '?';
        const stats: SeasonPlayerStats = seasonStats[detailPlayerId] ?? {
          playerId: rp.id, name: rp.name, teamId: '', teamAbbreviation: teamAbbr,
          completions: 0, attempts: 0, passingYards: 0, passingTDs: 0, interceptions: 0, sacksTotal: 0,
          carries: 0, rushingYards: 0, rushingTDs: 0,
          targets: 0, receptions: 0, receivingYards: 0, receivingTDs: 0,
        };
        return (
          <PlayerDetail
            player={stats}
            games={league.currentSeason.games}
            allTeams={league.teams}
            onClose={() => setDetailPlayerId(null)}
          />
        );
      })()}
    </div>
  );
}

// ── Season Timeline ────────────────────────────────────────────────────────────

function SeasonTimeline({ league, busy, advanceBtnLabel, onAdvance }: {
  league: League;
  busy: boolean;
  advanceBtnLabel: string;
  onAdvance: () => void;
}) {
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);

  const games       = league.currentSeason.games;
  const maxWeek     = games.length > 0 ? Math.max(...games.map(g => g.week)) : 0;
  const canAdvance  = advanceBtnLabel !== 'Season Complete' && advanceBtnLabel !== 'Draft In Progress';

  const expandedGames = selectedWeek !== null
    ? games.filter(g => g.week === selectedWeek)
    : [];
  const selectedGame = selectedGameId ? games.find(g => g.id === selectedGameId) ?? null : null;

  function phaseTag() {
    if (league.phase === 'postseason') return 'Playoffs';
    if (league.phase === 'offseason')  return 'Offseason';
    if (league.phase === 'draft')      return 'Draft';
    return null;
  }

  const tag = phaseTag();

  return (
    <div className="season-timeline">
      <div className="stl-header">
        <div className="stl-meta">
          <span className="stl-season">Season {league.currentSeason.year}</span>
          {tag && <span className="stl-phase-tag">{tag}</span>}
        </div>
        <button
          className="advance-btn"
          disabled={busy || !canAdvance}
          onClick={onAdvance}
        >
          {busy ? 'Simulating…' : advanceBtnLabel}
        </button>
      </div>

      {maxWeek > 0 && (
        <div className="stl-track">
          {Array.from({ length: maxWeek }, (_, i) => i + 1).map(w => {
            const weekGames = games.filter(g => g.week === w);
            const allDone   = weekGames.length > 0 && weekGames.every(g => g.status === 'final');
            const isCurrent = w === league.currentWeek && league.phase === 'regular_season';
            const isSelected = selectedWeek === w;
            const cls = ['stl-tile', allDone ? 'stl-done' : isCurrent ? 'stl-current' : 'stl-future', isSelected ? 'stl-selected' : ''].filter(Boolean).join(' ');
            return (
              <button
                key={w}
                className={cls}
                onClick={() => {
                  setSelectedWeek(prev => prev === w ? null : w);
                  setSelectedGameId(null);
                }}
              >
                <span className="stl-wk">WK {w}</span>
                {allDone && <span className="stl-check">✓</span>}
              </button>
            );
          })}
        </div>
      )}

      {selectedWeek !== null && expandedGames.length > 0 && (
        <div className="stl-games-panel">
          <div className="stl-games-list">
            {expandedGames.map(g => (
              <button
                key={g.id}
                className={`stl-game-row${selectedGameId === g.id ? ' stl-game-selected' : ''}`}
                onClick={() => setSelectedGameId(prev => prev === g.id ? null : g.id)}
              >
                <span className="stl-game-teams">{g.awayTeam.abbreviation} @ {g.homeTeam.abbreviation}</span>
                {g.status === 'final'
                  ? <span className="stl-game-score">{g.awayScore}–{g.homeScore}</span>
                  : <span className="stl-game-status muted">scheduled</span>}
              </button>
            ))}
          </div>
          {selectedGame && (
            <div className="stl-game-detail">
              <GameDetail key={selectedGame.id} game={selectedGame} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Gameplan View ──────────────────────────────────────────────────────────────

function GameplanView({ team, leagueId, onLeagueUpdated }: {
  team: League['teams'][0];
  leagueId: string;
  onLeagueUpdated: (l: League) => void;
}) {
  const gp: GameplanSettings = team.gameplan ?? DEFAULT_GAMEPLAN;
  const [draft, setDraft] = useState<GameplanSettings>(gp);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState('');
  const [saved, setSaved]   = useState(false);

  const pc = team.playcalling;
  const deepPct = Math.max(0, 100 - pc.shortPassPct - pc.mediumPassPct);

  function set<K extends keyof GameplanSettings>(k: K, v: GameplanSettings[K]) {
    setDraft(d => ({ ...d, [k]: v }));
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true); setSaveErr(''); setSaved(false);
    try {
      const updated = await setGameplanApi(leagueId, draft);
      onLeagueUpdated(updated);
      setSaved(true);
    } catch (e) { setSaveErr(friendlyError(e)); }
    finally { setSaving(false); }
  }

  const btnRow = (
    label: string,
    options: { value: string; label: string }[],
    current: string,
    onChange: (v: string) => void,
  ) => (
    <div className="gp-row">
      <span className="gp-label">{label}</span>
      <div className="gp-btns">
        {options.map(o => (
          <button
            key={o.value}
            className={`gp-opt${current === o.value ? ' gp-opt-active' : ''}`}
            onClick={() => onChange(o.value)}
          >{o.label}</button>
        ))}
      </div>
    </div>
  );

  return (
    <section className="gp-view">
      <h2>Gameplan — {team.name}</h2>

      <div className="gp-section">
        <h3>Offense</h3>
        {btnRow('Pass Emphasis', [
          { value: 'conservative', label: 'Conservative' },
          { value: 'balanced',     label: 'Balanced' },
          { value: 'aggressive',   label: 'Aggressive' },
        ], draft.passEmphasis, v => set('passEmphasis', v as PassEmphasis))}

        {btnRow('Run Style', [
          { value: 'light',    label: 'Outside' },
          { value: 'balanced', label: 'Balanced' },
          { value: 'heavy',    label: 'Inside' },
        ], draft.runEmphasis, v => set('runEmphasis', v as RunEmphasis))}

        {btnRow('Tempo', [
          { value: 'slow',   label: 'Slow' },
          { value: 'normal', label: 'Normal' },
          { value: 'fast',   label: 'Hurry-Up' },
        ], draft.tempo, v => set('tempo', v as Tempo))}

        {btnRow('Play Action', [
          { value: 'low',    label: 'Rarely' },
          { value: 'medium', label: 'Moderate' },
          { value: 'high',   label: 'Often' },
        ], draft.playAction, v => set('playAction', v as PlayActionUsage))}
      </div>

      <div className="gp-section">
        <h3>Defense</h3>
        {btnRow('Defensive Focus', [
          { value: 'balanced',          label: 'Balanced' },
          { value: 'stop_inside_run',   label: 'Stop Inside Run' },
          { value: 'stop_outside_run',  label: 'Stop Outside Run' },
          { value: 'stop_short_pass',   label: 'Stop Short Pass' },
          { value: 'stop_deep_pass',    label: 'Stop Deep Pass' },
        ], draft.defensiveFocus, v => set('defensiveFocus', v as DefensiveFocus))}
      </div>

      <div className="gp-derived">
        <span className="gp-derived-label">Derived playcalling:</span>
        <span>Run {pc.runPct}%</span>
        <span>Inside {pc.insideRunPct}%</span>
        <span>Short {pc.shortPassPct}%</span>
        <span>Med {pc.mediumPassPct}%</span>
        <span>Deep {deepPct}%</span>
      </div>

      <div className="gp-save-row">
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save Gameplan'}
        </button>
        {saved   && <span className="gp-saved">Saved!</span>}
        {saveErr && <span className="gp-err">{saveErr}</span>}
      </div>
    </section>
  );
}

// ── Playbooks View ─────────────────────────────────────────────────────────────

const OFF_PLAYBOOK_INFO: Record<string, { label: string; desc: string }> = {
  balanced:   { label: 'Balanced',   desc: 'Even mix of runs and passes. No single weakness.' },
  spread:     { label: 'Spread',     desc: 'Multiple WR sets. Emphasizes short-to-medium passing.' },
  power_run:  { label: 'Power Run',  desc: 'Physical run-first attack with strong OL play.' },
  vertical:   { label: 'Vertical',   desc: 'Stretches the field deep. High risk, high reward.' },
  west_coast: { label: 'West Coast', desc: 'Short, precise passing game. Rhythm and timing.' },
};

const DEF_PLAYBOOK_INFO: Record<string, { label: string; desc: string }> = {
  balanced:      { label: 'Balanced',      desc: 'Sound fundamentals against all play types.' },
  four_three:    { label: '4-3',           desc: 'Four down linemen. Strong vs. the run.' },
  three_four:    { label: '3-4',           desc: 'Three linemen, four LBs. Versatile blitz packages.' },
  nickel_heavy:  { label: 'Nickel Heavy',  desc: 'Extra DBs on the field. Great vs. passing teams.' },
  zone_heavy:    { label: 'Zone Heavy',    desc: 'Disciplined zone coverage. Limits big plays.' },
};

function PlaybooksView({ team, leagueId, onLeagueUpdated }: {
  team: League['teams'][0];
  leagueId: string;
  onLeagueUpdated: (l: League) => void;
}) {
  const gp: GameplanSettings = team.gameplan ?? DEFAULT_GAMEPLAN;
  const [offBook, setOffBook] = useState<OffensivePlaybook>(gp.offensivePlaybook);
  const [defBook, setDefBook] = useState<DefensivePlaybook>(gp.defensivePlaybook);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState('');
  const [saved, setSaved]   = useState(false);

  async function handleSave() {
    setSaving(true); setSaveErr(''); setSaved(false);
    try {
      const updated = await setGameplanApi(leagueId, { offensivePlaybook: offBook, defensivePlaybook: defBook });
      onLeagueUpdated(updated);
      setSaved(true);
    } catch (e) { setSaveErr(friendlyError(e)); }
    finally { setSaving(false); }
  }

  return (
    <section className="gp-view">
      <h2>Playbooks — {team.name}</h2>

      <div className="gp-section">
        <h3>Offensive Playbook</h3>
        <div className="pb-grid">
          {(Object.keys(OFF_PLAYBOOK_INFO) as OffensivePlaybook[]).map(key => {
            const info = OFF_PLAYBOOK_INFO[key]!;
            return (
              <button
                key={key}
                className={`pb-card${offBook === key ? ' pb-card-active' : ''}`}
                onClick={() => { setOffBook(key); setSaved(false); }}
              >
                <span className="pb-card-name">{info.label}</span>
                <span className="pb-card-desc">{info.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="gp-section">
        <h3>Defensive Playbook</h3>
        <div className="pb-grid">
          {(Object.keys(DEF_PLAYBOOK_INFO) as DefensivePlaybook[]).map(key => {
            const info = DEF_PLAYBOOK_INFO[key]!;
            return (
              <button
                key={key}
                className={`pb-card${defBook === key ? ' pb-card-active' : ''}`}
                onClick={() => { setDefBook(key); setSaved(false); }}
              >
                <span className="pb-card-name">{info.label}</span>
                <span className="pb-card-desc">{info.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="gp-save-row">
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save Playbooks'}
        </button>
        {saved   && <span className="gp-saved">Saved!</span>}
        {saveErr && <span className="gp-err">{saveErr}</span>}
      </div>
    </section>
  );
}

// ── Coaching View ──────────────────────────────────────────────────────────────

function CoachingView({ team }: { team: League['teams'][0] }) {
  const { hc, oc, dc } = team.coaches;
  const ocScheme = oc.offensiveScheme ?? 'balanced';
  const dcScheme = dc.defensiveScheme ?? 'balanced';
  const hcOffMatch = hc.offensiveScheme === ocScheme;
  const hcDefMatch = hc.defensiveScheme === dcScheme;

  return (
    <section className="gp-view">
      <h2>Coaching Staff — {team.name}</h2>
      <div className="coaching-table-wrap">
        <table>
          <thead>
            <tr><th>Role</th><th>Name</th><th>OVR</th><th>Scheme</th><th>Alignment</th></tr>
          </thead>
          <tbody>
            <tr>
              <td className="muted">Head Coach</td>
              <td>{hc.name}</td>
              <td className="ovr-cell">{hc.overall}</td>
              <td className="muted">—</td>
              <td>
                <span className={`align-badge${hcOffMatch ? ' align-yes' : ' align-no'}`}>OFF {hcOffMatch ? '✓' : '✗'}</span>
                {' '}
                <span className={`align-badge${hcDefMatch ? ' align-yes' : ' align-no'}`}>DEF {hcDefMatch ? '✓' : '✗'}</span>
              </td>
            </tr>
            <tr>
              <td className="muted">Offensive Coord.</td>
              <td>{oc.name}</td>
              <td className="ovr-cell">{oc.overall}</td>
              <td className="muted">{ocScheme.replace(/_/g, ' ')}</td>
              <td><span className={`align-badge${hcOffMatch ? ' align-yes' : ' align-no'}`}>{hcOffMatch ? 'HC match ✓' : 'No HC match'}</span></td>
            </tr>
            <tr>
              <td className="muted">Defensive Coord.</td>
              <td>{dc.name}</td>
              <td className="ovr-cell">{dc.overall}</td>
              <td className="muted">{dcScheme.replace(/_/g, ' ')}</td>
              <td><span className={`align-badge${hcDefMatch ? ' align-yes' : ' align-no'}`}>{hcDefMatch ? 'HC match ✓' : 'No HC match'}</span></td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="muted coaching-note">
        When the HC's scheme preferences match the OC or DC, your team earns a small bonus to success probability each play. Green badges indicate an active alignment bonus.
      </p>
    </section>
  );
}

// ── Commissioner View ──────────────────────────────────────────────────────────

function CommissionerView({ league, leagueId, userId, onLeagueUpdated }: {
  league: League;
  leagueId: string;
  userId: string;
  onLeagueUpdated: (l: League) => void;
}) {
  const [members, setMembers] = useState<LeagueMember[] | null>(null);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState(league.displayName);
  const [maxUsers, setMaxUsers] = useState(String(league.maxUsers ?? ''));
  const [visibility, setVisibility] = useState<'public' | 'private'>(league.visibility);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [kickBusy, setKickBusy] = useState<string | null>(null);
  const [kickError, setKickError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getLeagueMembersApi(leagueId)
      .then(setMembers)
      .catch(e => setMembersError(friendlyError(e)));
  }, [leagueId]);

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSettingsBusy(true); setSettingsError(null); setSettingsSaved(false);
    try {
      const updated = await updateLeagueSettingsApi(leagueId, {
        displayName: displayName.trim(),
        maxUsers: maxUsers ? Number(maxUsers) : 0,
        visibility,
      });
      onLeagueUpdated(updated);
      setSettingsSaved(true);
    } catch (e) {
      setSettingsError(friendlyError(e));
    } finally {
      setSettingsBusy(false);
    }
  }

  async function kick(targetId: string) {
    setKickBusy(targetId); setKickError(null);
    try {
      await kickMemberApi(leagueId, targetId);
      setMembers(prev => prev ? prev.filter(m => m.userId !== targetId) : prev);
    } catch (e) {
      setKickError(friendlyError(e));
    } finally {
      setKickBusy(null);
    }
  }

  function copyInviteCode() {
    if (league.inviteCode) {
      navigator.clipboard.writeText(league.inviteCode).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  }

  return (
    <section className="commissioner-view">
      <h2>Commissioner Panel</h2>

      {/* League settings */}
      <div className="comm-card">
        <h3>League Settings</h3>
        <form onSubmit={saveSettings} className="comm-settings-form">
          <label>
            League Name
            <input
              type="text" value={displayName} maxLength={50}
              onChange={e => setDisplayName(e.target.value)}
            />
          </label>
          <label>
            Max Users <span className="muted">(0 = unlimited)</span>
            <input
              type="number" min={0} max={32} value={maxUsers}
              onChange={e => setMaxUsers(e.target.value)}
              style={{ width: '5rem' }}
            />
          </label>
          <label>
            Visibility
            <div className="toggle-group">
              {(['public', 'private'] as const).map(v => (
                <button
                  key={v} type="button"
                  className={visibility === v ? 'toggle active' : 'toggle'}
                  onClick={() => setVisibility(v)}
                >
                  {v === 'public' ? 'Public' : 'Private'}
                </button>
              ))}
            </div>
          </label>
          {settingsError && <div className="form-error">{settingsError}</div>}
          {settingsSaved && <div className="form-success">Settings saved.</div>}
          <button type="submit" className="btn-primary" disabled={settingsBusy}>
            {settingsBusy ? 'Saving…' : 'Save Settings'}
          </button>
        </form>
      </div>

      {/* Invite code */}
      {league.visibility === 'private' && league.inviteCode && (
        <div className="comm-card">
          <h3>Invite Code</h3>
          <p className="muted">Share this code with players to join your private league.</p>
          <div className="invite-code-row">
            <code className="invite-code">{league.inviteCode}</code>
            <button className="btn-sm" onClick={copyInviteCode}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <p className="muted" style={{ fontSize: '0.8rem' }}>
            League ID: <code>{leagueId}</code>
          </p>
        </div>
      )}

      {/* Members */}
      <div className="comm-card">
        <h3>Members</h3>
        {membersError && <div className="form-error">{membersError}</div>}
        {kickError && <div className="form-error">{kickError}</div>}
        {members === null && !membersError && <p className="muted">Loading…</p>}
        {members && members.length === 0 && <p className="muted">No members yet.</p>}
        {members && members.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Team</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {members.map(m => (
                <tr key={m.userId}>
                  <td>
                    {m.username}
                    {m.userId === userId && <span className="comm-badge"> (you)</span>}
                  </td>
                  <td>{m.teamName || <span className="muted">—</span>}</td>
                  <td>
                    {m.userId !== userId && (
                      <button
                        className="btn-sm btn-danger"
                        disabled={kickBusy === m.userId}
                        onClick={() => kick(m.userId)}
                      >
                        {kickBusy === m.userId ? '…' : 'Remove'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

// ── Leaders ────────────────────────────────────────────────────────────────────

function LeadersView({ games, teams }: { games: League['currentSeason']['games']; teams: League['teams'] }) {
  const stats      = aggregateSeasonStats(games);
  const allPlayers = Object.values(stats);
  const gamesPlayed = games.filter(g => g.status === 'final').length;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedPlayer = selectedId !== null ? (stats[selectedId] ?? null) : null;

  const passers   = allPlayers.filter(p => p.attempts >= 1)
    .sort((a, b) => b.passingYards   - a.passingYards).slice(0, 10);
  const rushers   = allPlayers.filter(p => p.carries   >= 1)
    .sort((a, b) => b.rushingYards   - a.rushingYards).slice(0, 10);
  const receivers = allPlayers.filter(p => p.targets   >= 1)
    .sort((a, b) => b.receivingYards - a.receivingYards).slice(0, 10);
  const tdLeaders = allPlayers
    .map(p => ({ ...p, totalTDs: p.passingTDs + p.rushingTDs + p.receivingTDs }))
    .filter(p => p.totalTDs > 0)
    .sort((a, b) => b.totalTDs - a.totalTDs)
    .slice(0, 10);

  function pName(id: string, name: string) {
    return (
      <button className="pd-trigger" onClick={() => setSelectedId(id)}>{name}</button>
    );
  }

  if (gamesPlayed === 0) {
    return (
      <section className="leaders-section">
        <div className="leaders-page-header">
          <h2>League Leaders</h2>
        </div>
        <p className="muted" style={{ padding: '1rem 0' }}>No games have been played yet.</p>
      </section>
    );
  }

  return (
    <section className="leaders-section">
      {selectedPlayer && (
        <PlayerDetail
          player={selectedPlayer}
          games={games}
          allTeams={teams}
          onClose={() => setSelectedId(null)}
        />
      )}
      <div className="leaders-page-header">
        <h2>League Leaders</h2>
        <span className="leaders-meta">{gamesPlayed} game{gamesPlayed !== 1 ? 's' : ''} played</span>
      </div>

      <div className="leaders-grid">

        {/* Passing */}
        <div className="leaders-card">
          <div className="lc-header">
            <span className="lc-category">PASSING</span>
            <span className="lc-stat-label">YDS</span>
          </div>
          <table className="leaders-table">
            <thead>
              <tr>
                <th className="col-rank"></th>
                <th className="col-player">Player</th>
                <th className="col-team">Team</th>
                <th className="col-num">C/ATT</th>
                <th className="col-num col-primary">YDS</th>
                <th className="col-num">TD</th>
                <th className="col-num">INT</th>
              </tr>
            </thead>
            <tbody>
              {passers.length === 0
                ? <tr><td colSpan={7} className="lc-empty">No data</td></tr>
                : passers.map((p, i) => (
                  <tr key={p.playerId} className={i === 0 ? 'lc-top' : ''}>
                    <td className="col-rank">{i + 1}</td>
                    <td className="col-player">{pName(p.playerId, p.name)}</td>
                    <td className="col-team">{p.teamAbbreviation}</td>
                    <td className="col-num">{p.completions}/{p.attempts}</td>
                    <td className="col-num col-primary">{p.passingYards}</td>
                    <td className="col-num">{p.passingTDs}</td>
                    <td className="col-num">{p.interceptions}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {/* Rushing */}
        <div className="leaders-card">
          <div className="lc-header">
            <span className="lc-category">RUSHING</span>
            <span className="lc-stat-label">YDS</span>
          </div>
          <table className="leaders-table">
            <thead>
              <tr>
                <th className="col-rank"></th>
                <th className="col-player">Player</th>
                <th className="col-team">Team</th>
                <th className="col-num">CAR</th>
                <th className="col-num col-primary">YDS</th>
                <th className="col-num">AVG</th>
                <th className="col-num">TD</th>
              </tr>
            </thead>
            <tbody>
              {rushers.length === 0
                ? <tr><td colSpan={7} className="lc-empty">No data</td></tr>
                : rushers.map((p, i) => (
                  <tr key={p.playerId} className={i === 0 ? 'lc-top' : ''}>
                    <td className="col-rank">{i + 1}</td>
                    <td className="col-player">{pName(p.playerId, p.name)}</td>
                    <td className="col-team">{p.teamAbbreviation}</td>
                    <td className="col-num">{p.carries}</td>
                    <td className="col-num col-primary">{p.rushingYards}</td>
                    <td className="col-num">{p.carries > 0 ? (p.rushingYards / p.carries).toFixed(1) : '—'}</td>
                    <td className="col-num">{p.rushingTDs}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {/* Receiving */}
        <div className="leaders-card">
          <div className="lc-header">
            <span className="lc-category">RECEIVING</span>
            <span className="lc-stat-label">YDS</span>
          </div>
          <table className="leaders-table">
            <thead>
              <tr>
                <th className="col-rank"></th>
                <th className="col-player">Player</th>
                <th className="col-team">Team</th>
                <th className="col-num">REC</th>
                <th className="col-num col-primary">YDS</th>
                <th className="col-num">AVG</th>
                <th className="col-num">TD</th>
              </tr>
            </thead>
            <tbody>
              {receivers.length === 0
                ? <tr><td colSpan={7} className="lc-empty">No data</td></tr>
                : receivers.map((p, i) => (
                  <tr key={p.playerId} className={i === 0 ? 'lc-top' : ''}>
                    <td className="col-rank">{i + 1}</td>
                    <td className="col-player">{pName(p.playerId, p.name)}</td>
                    <td className="col-team">{p.teamAbbreviation}</td>
                    <td className="col-num">{p.receptions}</td>
                    <td className="col-num col-primary">{p.receivingYards}</td>
                    <td className="col-num">{p.receptions > 0 ? (p.receivingYards / p.receptions).toFixed(1) : '—'}</td>
                    <td className="col-num">{p.receivingTDs}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {/* Touchdowns */}
        <div className="leaders-card">
          <div className="lc-header">
            <span className="lc-category">TOUCHDOWNS</span>
            <span className="lc-stat-label">TD</span>
          </div>
          <table className="leaders-table">
            <thead>
              <tr>
                <th className="col-rank"></th>
                <th className="col-player">Player</th>
                <th className="col-team">Team</th>
                <th className="col-num">PASS</th>
                <th className="col-num">RUSH</th>
                <th className="col-num">REC</th>
                <th className="col-num col-primary">TOT</th>
              </tr>
            </thead>
            <tbody>
              {tdLeaders.length === 0
                ? <tr><td colSpan={7} className="lc-empty">No touchdowns yet</td></tr>
                : tdLeaders.map((p, i) => (
                  <tr key={p.playerId} className={i === 0 ? 'lc-top' : ''}>
                    <td className="col-rank">{i + 1}</td>
                    <td className="col-player">{pName(p.playerId, p.name)}</td>
                    <td className="col-team">{p.teamAbbreviation}</td>
                    <td className="col-num">{p.passingTDs  || '—'}</td>
                    <td className="col-num">{p.rushingTDs  || '—'}</td>
                    <td className="col-num">{p.receivingTDs || '—'}</td>
                    <td className="col-num col-primary">{p.totalTDs}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

      </div>
    </section>
  );
}

// ── Player Detail ──────────────────────────────────────────────────────────────

interface GameLogRow {
  week: number;
  opponentAbbr: string;
  homeAway: 'H' | 'A';
  result: 'W' | 'L' | 'T';
  teamScore: number;
  oppScore: number;
  completions: number; attempts: number; passingYards: number; passingTDs: number; interceptions: number;
  carries: number; rushingYards: number; rushingTDs: number;
  targets: number; receptions: number; receivingYards: number; receivingTDs: number;
}

function buildGameLog(player: { playerId: string; name: string }, games: Game[]): GameLogRow[] {
  const rows: GameLogRow[] = [];
  for (const game of games) {
    if (game.status !== 'final') continue;
    // Identify which side the player was on for this specific game (handles trades correctly)
    const onHome = game.homeTeam.roster.some(p => p.id === player.playerId);
    const onAway = !onHome && game.awayTeam.roster.some(p => p.id === player.playerId);
    if (!onHome && !onAway) continue;

    const bs = deriveBoxScore(game);

    // Build name → playerId map from this game's rosters, then find the box
    // score entry whose name resolves to our target player.playerId.
    // This prevents a name collision from returning the wrong player's stats.
    const nameToId = new Map<string, string>();
    for (const p of [...game.homeTeam.roster, ...game.awayTeam.roster]) {
      nameToId.set(p.name, p.id);
    }
    const pStats = Object.values(bs.players).find(s => nameToId.get(s.name) === player.playerId);
    if (!pStats) continue; // Player dressed but had no recorded plays

    const isHome    = onHome;
    const teamScore = isHome ? game.homeScore : game.awayScore;
    const oppScore  = isHome ? game.awayScore : game.homeScore;
    rows.push({
      week:         game.week,
      opponentAbbr: isHome ? game.awayTeam.abbreviation : game.homeTeam.abbreviation,
      homeAway:     isHome ? 'H' : 'A',
      result:       teamScore > oppScore ? 'W' : teamScore < oppScore ? 'L' : 'T',
      teamScore,    oppScore,
      completions:    pStats.completions,   attempts:      pStats.attempts,
      passingYards:   pStats.passingYards,  passingTDs:    pStats.passingTDs,
      interceptions:  pStats.interceptions,
      carries:        pStats.carries,       rushingYards:  pStats.rushingYards,
      rushingTDs:     pStats.rushingTDs,    targets:       pStats.targets,
      receptions:     pStats.receptions,    receivingYards: pStats.receivingYards,
      receivingTDs:   pStats.receivingTDs,
    });
  }
  return rows.sort((a, b) => a.week - b.week);
}

function PlayerDetail({ player, games, allTeams, onClose }: {
  player: import('./seasonStats').SeasonPlayerStats;
  games: Game[];
  allTeams: League['teams'];
  onClose: () => void;
}) {
  const rosterPlayer = allTeams.flatMap(t => t.roster).find(p => p.id === player.playerId);
  const gameLog      = buildGameLog(player, games);

  const hasPassing   = player.attempts  > 0;
  const hasRushing   = player.carries   > 0;
  const hasReceiving = player.targets   > 0;

  const totalTDs = player.passingTDs + player.rushingTDs + player.receivingTDs;

  // Dynamic game-log columns
  const glCols: { label: string; value: (r: GameLogRow) => string | number; primary?: boolean }[] = [];
  if (hasPassing) {
    glCols.push(
      { label: 'C/ATT', value: r => `${r.completions}/${r.attempts}` },
      { label: 'P.YDS', value: r => r.passingYards, primary: true },
      { label: 'TD',    value: r => r.passingTDs },
      { label: 'INT',   value: r => r.interceptions },
    );
  }
  if (hasRushing) {
    glCols.push(
      { label: 'CAR',   value: r => r.carries },
      { label: 'R.YDS', value: r => r.rushingYards, primary: !hasPassing },
      { label: 'TD',    value: r => r.rushingTDs },
    );
  }
  if (hasReceiving) {
    glCols.push(
      { label: 'TGT',   value: r => r.targets },
      { label: 'REC',   value: r => r.receptions },
      { label: 'R.YDS', value: r => r.receivingYards, primary: !hasPassing && !hasRushing },
      { label: 'TD',    value: r => r.receivingTDs },
    );
  }

  return (
    <div className="pd-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="pd-modal">

        {/* Header */}
        <div className="pd-header">
          <div className="pd-title">
            <span className="pd-name">{player.name}</span>
            <span className="pd-team">{player.teamAbbreviation}</span>
            {rosterPlayer && (
              <>
                <span className="pd-badge">{rosterPlayer.position}</span>
                <span className="pd-badge">Age {rosterPlayer.age}</span>
                <span className="pd-badge">OVR {rosterPlayer.scoutedOverall}</span>
              </>
            )}
          </div>
          <button className="pd-close" onClick={onClose}>✕</button>
        </div>

        {/* Season totals */}
        <div className="pd-section-label">Season Totals</div>
        <div className="pd-stats-row">
          {hasPassing && (
            <>
              <div className="pd-stat"><span className="pd-stat-val">{player.passingYards}</span><span className="pd-stat-lbl">Pass Yds</span></div>
              <div className="pd-stat"><span className="pd-stat-val">{player.completions}/{player.attempts}</span><span className="pd-stat-lbl">C/ATT</span></div>
              <div className="pd-stat"><span className="pd-stat-val">{player.passingTDs}</span><span className="pd-stat-lbl">Pass TD</span></div>
              <div className="pd-stat"><span className="pd-stat-val">{player.interceptions}</span><span className="pd-stat-lbl">INT</span></div>
              <div className="pd-stat"><span className="pd-stat-val">{player.attempts > 0 ? ((player.completions / player.attempts) * 100).toFixed(1) : '—'}%</span><span className="pd-stat-lbl">Comp%</span></div>
            </>
          )}
          {hasRushing && (
            <>
              <div className="pd-stat"><span className="pd-stat-val">{player.rushingYards}</span><span className="pd-stat-lbl">Rush Yds</span></div>
              <div className="pd-stat"><span className="pd-stat-val">{player.carries}</span><span className="pd-stat-lbl">Car</span></div>
              <div className="pd-stat"><span className="pd-stat-val">{player.carries > 0 ? (player.rushingYards / player.carries).toFixed(1) : '—'}</span><span className="pd-stat-lbl">YPC</span></div>
              <div className="pd-stat"><span className="pd-stat-val">{player.rushingTDs}</span><span className="pd-stat-lbl">Rush TD</span></div>
            </>
          )}
          {hasReceiving && (
            <>
              <div className="pd-stat"><span className="pd-stat-val">{player.receivingYards}</span><span className="pd-stat-lbl">Rec Yds</span></div>
              <div className="pd-stat"><span className="pd-stat-val">{player.receptions}/{player.targets}</span><span className="pd-stat-lbl">REC/TGT</span></div>
              <div className="pd-stat"><span className="pd-stat-val">{player.receptions > 0 ? (player.receivingYards / player.receptions).toFixed(1) : '—'}</span><span className="pd-stat-lbl">YPR</span></div>
              <div className="pd-stat"><span className="pd-stat-val">{player.receivingTDs}</span><span className="pd-stat-lbl">Rec TD</span></div>
            </>
          )}
          {totalTDs > 0 && (
            <div className="pd-stat pd-stat-total"><span className="pd-stat-val">{totalTDs}</span><span className="pd-stat-lbl">Total TD</span></div>
          )}
        </div>

        {/* Game log */}
        {gameLog.length > 0 && (
          <>
            <div className="pd-section-label">Game Log</div>
            <div className="pd-table-wrap">
              <table className="pd-table">
                <thead>
                  <tr>
                    <th className="col-num">WK</th>
                    <th>OPP</th>
                    <th className="col-num">H/A</th>
                    <th className="col-num">RESULT</th>
                    {glCols.map(c => <th key={c.label} className="col-num">{c.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {gameLog.map((r, i) => (
                    <tr key={i}>
                      <td className="col-num pd-week">{r.week === 0 ? 'PO' : r.week}</td>
                      <td className="pd-opp">{r.opponentAbbr}</td>
                      <td className="col-num pd-ha">{r.homeAway}</td>
                      <td className={`col-num pd-result pd-result-${r.result.toLowerCase()}`}>
                        {r.result} {r.teamScore}–{r.oppScore}
                      </td>
                      {glCols.map(c => (
                        <td key={c.label} className={`col-num${c.primary ? ' col-primary' : ''}`}>
                          {c.value(r)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {gameLog.length === 0 && (
          <p className="muted" style={{ padding: '1rem' }}>No game data available.</p>
        )}

      </div>
    </div>
  );
}

// ── Dashboard ──────────────────────────────────────────────────────────────────

function DashboardView({ league, myTeamId, standings, onNavTo }: {
  league: League;
  myTeamId: string;
  standings: Standing[];
  onNavTo: (t: string) => void;
}) {
  const team    = league.teams.find(t => t.id === myTeamId)!;
  const games   = league.currentSeason.games;
  const payroll = team.roster.reduce((s, p) => s + p.salary, 0);
  const injured = team.roster.filter(p => p.injuryWeeksRemaining > 0).length;

  // Record
  let w = 0, l = 0, ties = 0, pf = 0, pa = 0;
  for (const g of games) {
    if (g.status !== 'final') continue;
    const isHome = g.homeTeam.id === myTeamId;
    const isAway = g.awayTeam.id === myTeamId;
    if (!isHome && !isAway) continue;
    const myScore  = isHome ? g.homeScore : g.awayScore;
    const oppScore = isHome ? g.awayScore : g.homeScore;
    pf += myScore; pa += oppScore;
    if (myScore > oppScore) w++;
    else if (myScore < oppScore) l++;
    else ties++;
  }

  // Standings rank
  const overallRank = standings.findIndex(s => s.team.id === myTeamId) + 1;

  // My division
  const myDivision = (league.divisions ?? []).find(d => d.teamIds.includes(myTeamId));
  const divStandings = myDivision
    ? standings.filter(s => myDivision.teamIds.includes(s.team.id))
        .sort((a, b) => b.w - a.w || (b.pf - b.pa) - (a.pf - a.pa))
    : standings.slice(0, 6);

  // Next game
  const nextGame = games.find(g => g.status !== 'final' && (g.homeTeam.id === myTeamId || g.awayTeam.id === myTeamId));

  // Recent results
  const recentGames = games
    .filter(g => g.status === 'final' && (g.homeTeam.id === myTeamId || g.awayTeam.id === myTeamId))
    .slice(-4).reverse();

  // Latest news
  const latestNews = (league.news ?? []).slice(0, 4);

  return (
    <div className="dashboard">
      {/* Top: Record + Next Game + Recent */}
      <div className="dash-top">
        <div className="dash-card">
          <div className="dash-card-title">Season Record</div>
          <div className="dash-record-big">{w}–{l}{ties > 0 ? `–${ties}` : ''}</div>
          <div className="dash-record-sub">
            PF {pf} · PA {pa} ·
            <span className={pf - pa >= 0 ? ' pos' : ' neg'}> {pf - pa >= 0 ? '+' : ''}{pf - pa}</span>
          </div>
          {overallRank > 0 && (
            <div className="dash-rank">#{overallRank} overall{myDivision ? ` · ${myDivision.division}` : ''}</div>
          )}
        </div>

        <div className="dash-card">
          <div className="dash-card-title">Next Game</div>
          {nextGame ? (
            <>
              <div className="dash-next-week">Week {nextGame.week}</div>
              <div className="dash-next-opp">
                {nextGame.homeTeam.id === myTeamId
                  ? <>vs <strong>{nextGame.awayTeam.name}</strong></>
                  : <>@ <strong>{nextGame.homeTeam.name}</strong></>}
              </div>
              <div className="dash-next-ha muted">{nextGame.homeTeam.id === myTeamId ? 'Home' : 'Away'}</div>
            </>
          ) : (
            <div className="muted">{league.phase === 'offseason' ? 'Offseason' : league.phase === 'draft' ? 'Draft' : 'Season complete'}</div>
          )}
        </div>

        <div className="dash-card">
          <div className="dash-card-title">Roster Status</div>
          <div className="dash-roster-stat">{team.roster.length} <span className="dash-roster-label">players</span></div>
          <div className="muted">Cap: ${payroll}M used</div>
          {injured > 0 && <div className="dash-injured-note">{injured} injured</div>}
        </div>

        {recentGames.length > 0 && (
          <div className="dash-card">
            <div className="dash-card-title">Recent Results</div>
            {recentGames.map(g => {
              const isHome = g.homeTeam.id === myTeamId;
              const myScore  = isHome ? g.homeScore : g.awayScore;
              const oppScore = isHome ? g.awayScore : g.homeScore;
              const result   = myScore > oppScore ? 'W' : myScore < oppScore ? 'L' : 'T';
              const opp      = isHome ? g.awayTeam.abbreviation : g.homeTeam.abbreviation;
              return (
                <div key={g.id} className="dash-result-row">
                  <span className={`dash-result-badge ${result === 'W' ? 'pos' : result === 'L' ? 'neg' : ''}`}>{result}</span>
                  <span className="dash-result-opp">{isHome ? 'vs' : '@'} {opp}</span>
                  <span className="dash-result-score">{myScore}–{oppScore}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Schedule timeline */}
      <DashboardSchedule games={games} myTeamId={myTeamId} currentWeek={league.currentWeek} />

      {/* Bottom: Standings snapshot + News + Quick Links */}
      <div className="dash-bottom">
        <div className="dash-panel">
          <div className="dash-panel-header">
            <span className="dash-panel-title">{myDivision ? `${myDivision.division} Standings` : 'Standings'}</span>
            <button className="dash-panel-link" onClick={() => onNavTo('standings')}>All →</button>
          </div>
          {divStandings.slice(0, 5).map((s, i) => (
            <div key={s.team.id} className={`dash-stand-row${s.team.id === myTeamId ? ' dash-my-team' : ''}`}>
              <span className="dash-stand-rank">{i + 1}</span>
              <span className="dash-stand-abbr">{s.team.abbreviation}</span>
              <span className="dash-stand-rec">{s.w}–{s.l}</span>
              <span className={`dash-stand-diff ${s.pf - s.pa >= 0 ? 'pos' : 'neg'}`}>
                {s.pf - s.pa >= 0 ? '+' : ''}{s.pf - s.pa}
              </span>
            </div>
          ))}
        </div>

        {latestNews.length > 0 && (
          <div className="dash-panel dash-panel-news">
            <div className="dash-panel-header">
              <span className="dash-panel-title">Latest News</span>
              <button className="dash-panel-link" onClick={() => onNavTo('news')}>All →</button>
            </div>
            {latestNews.map(n => (
              <div key={n.id} className="dash-news-row">
                <span className={`news-badge ${NEWS_TYPE_CLASS[n.type] ?? ''}`}>{NEWS_TYPE_LABEL[n.type] ?? n.type}</span>
                <span className="dash-news-headline">{n.headline}</span>
              </div>
            ))}
          </div>
        )}

        <div className="dash-panel dash-panel-links">
          <div className="dash-panel-header"><span className="dash-panel-title">Quick Access</span></div>
          <button className="dash-link-btn" onClick={() => onNavTo('roster')}>View Roster</button>
          <button className="dash-link-btn" onClick={() => onNavTo('contracts')}>Contracts</button>
          <button className="dash-link-btn" onClick={() => onNavTo('free-agents')}>Free Agents</button>
          <button className="dash-link-btn" onClick={() => onNavTo('trades')}>
            Trades{league.tradeProposals.filter(p => p.toTeamId === myTeamId && p.status === 'pending').length > 0
              ? ` (${league.tradeProposals.filter(p => p.toTeamId === myTeamId && p.status === 'pending').length})`
              : ''}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Standings ──────────────────────────────────────────────────────────────────

function StandingsView({ standings, userTeamId, divisions }: {
  standings: Standing[];
  userTeamId: string;
  divisions: Division[];
}) {
  const standingMap = new Map(standings.map(s => [s.team.id, s]));

  function DivTable({ div }: { div: Division }) {
    const rows = div.teamIds.map(id => standingMap.get(id)).filter(Boolean) as Standing[];
    rows.sort((a, b) => b.w - a.w || (b.pf - b.pa) - (a.pf - a.pa));
    return (
      <div className="div-block">
        <div className="div-header">{div.conference} — {div.division}</div>
        <table className="standings-table">
          <thead>
            <tr><th>Team</th><th>W</th><th>L</th><th>T</th><th>PF</th><th>PA</th><th>Diff</th></tr>
          </thead>
          <tbody>
            {rows.map(s => (
              <tr key={s.team.id} className={s.team.id === userTeamId ? 'user-row' : ''}>
                <td>{s.team.name} {s.team.id === userTeamId && <span className="you">YOU</span>}</td>
                <td>{s.w}</td><td>{s.l}</td><td>{s.t}</td>
                <td>{s.pf}</td><td>{s.pa}</td>
                <td className={s.pf - s.pa >= 0 ? 'pos' : 'neg'}>{s.pf - s.pa > 0 ? '+' : ''}{s.pf - s.pa}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (divisions.length === 0) {
    // Fallback: flat standings
    return (
      <section>
        <h2>Standings</h2>
        <table>
          <thead><tr><th>Team</th><th>W</th><th>L</th><th>T</th><th>PF</th><th>PA</th><th>Diff</th></tr></thead>
          <tbody>
            {standings.map(s => (
              <tr key={s.team.id} className={s.team.id === userTeamId ? 'user-row' : ''}>
                <td>{s.team.name} {s.team.id === userTeamId && <span className="you">YOU</span>}</td>
                <td>{s.w}</td><td>{s.l}</td><td>{s.t}</td>
                <td>{s.pf}</td><td>{s.pa}</td>
                <td className={s.pf - s.pa >= 0 ? 'pos' : 'neg'}>{s.pf - s.pa > 0 ? '+' : ''}{s.pf - s.pa}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    );
  }

  const icDivs = divisions.filter(d => d.conference === 'IC');
  const scDivs = divisions.filter(d => d.conference === 'SC');

  return (
    <section>
      <h2>Standings</h2>
      <div className="standings-conferences">
        <div className="conf-block">
          <div className="conf-header">Iron Conference</div>
          {icDivs.map(d => <DivTable key={d.division} div={d} />)}
        </div>
        <div className="conf-block">
          <div className="conf-header">Shield Conference</div>
          {scDivs.map(d => <DivTable key={d.division} div={d} />)}
        </div>
      </div>
    </section>
  );
}

// ── Playoff View ───────────────────────────────────────────────────────────────

function PlayoffView({ playoff, teams, seasonHistory, busy, advanceBtnLabel, onAdvance }: {
  playoff?: PlayoffBracket;
  teams: League['teams'];
  seasonHistory: SeasonRecord[];
  busy: boolean;
  advanceBtnLabel: string;
  onAdvance: () => void;
}) {
  const teamName = (id: string) => teams.find(t => t.id === id)?.name ?? id;
  const done = advanceBtnLabel === 'Season Complete' || advanceBtnLabel === 'Draft In Progress';

  const ROUND_LABELS: Record<string, string> = {
    wildcard: 'Wild Card', divisional: 'Divisional', conference: 'Conference', championship: 'Championship',
  };
  const ROUND_ORDER = ['wildcard', 'divisional', 'conference', 'championship'];

  // Group matchups by round, only show rounds that have matchups
  const roundGroups = ROUND_ORDER.map(r => ({
    round: r,
    label: ROUND_LABELS[r]!,
    matchups: playoff?.matchups.filter(m => m.round === r) ?? [],
  })).filter(g => g.matchups.length > 0);

  function MatchupRow({ m }: { m: PlayoffBracket['matchups'][0] }) {
    const topSeed   = m.topSeed   !== undefined ? `(${m.topSeed}) ` : '';
    const botSeed   = m.bottomSeed !== undefined ? `(${m.bottomSeed}) ` : '';
    const confLabel = m.conference ? `[${m.conference}] ` : '';
    return (
      <div className="playoff-matchup">
        <span className="playoff-conf">{confLabel}</span>
        <span className={m.winnerId === m.topSeedId ? 'po-winner' : 'po-team'}>{topSeed}{teamName(m.topSeedId)}</span>
        <span className="vs"> vs </span>
        <span className={m.winnerId === m.bottomSeedId ? 'po-winner' : 'po-team'}>{botSeed}{teamName(m.bottomSeedId)}</span>
        {m.game
          ? <span className="playoff-score"> — {m.game.homeScore}–{m.game.awayScore}</span>
          : <span className="muted"> (pending)</span>}
      </div>
    );
  }

  return (
    <section>
      <div className="week-header">
        <h2>{playoff ? `${playoff.year} Playoffs` : 'Playoffs'}</h2>
        <button onClick={onAdvance} disabled={busy || done} className="advance-btn">
          {busy ? 'Simulating…' : advanceBtnLabel}
        </button>
      </div>

      {playoff?.championId && (
        <div className="champion-banner">
          {playoff.year} Champion: <strong>{playoff.championName}</strong>
        </div>
      )}

      {!playoff && <p className="muted">Playoffs have not started yet.</p>}

      {roundGroups.map(g => (
        <div key={g.round} className="playoff-round">
          <h3>{g.label}</h3>
          {g.matchups.map(m => <MatchupRow key={m.id} m={m} />)}
        </div>
      ))}

      {seasonHistory.length > 0 && (
        <div className="playoff-round">
          <h3>Past Champions</h3>
          {[...seasonHistory].reverse().map(r => (
            <div key={r.year} className="history-item">{r.year}: {r.championName}</div>
          ))}
        </div>
      )}
    </section>
  );
}

// ── Game Detail ────────────────────────────────────────────────────────────────

function GameDetail({ game }: { game: Game }) {
  const isFinal = game.status === 'final';
  const [tab, setTab] = useState<'pbp' | 'box' | 'watch'>('pbp');
  const lines = isFinal ? formatGameLog(game) : null;

  return (
    <section className="game-detail">
      <div className="game-detail-header">
        <span className="game-matchup">
          {game.awayTeam.name} <span className="vs">@</span> {game.homeTeam.name}
        </span>
        {isFinal && (
          <span className="game-score">{game.awayScore} – {game.homeScore}</span>
        )}
        <span className={`game-status ${game.status}`}>{game.status}</span>
      </div>

      {isFinal && (
        <nav className="detail-tabs">
          {(['pbp', 'box', 'watch'] as const).map(t => (
            <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
              {t === 'pbp' ? 'Play-by-Play' : t === 'box' ? 'Box Score' : 'Watch'}
            </button>
          ))}
        </nav>
      )}

      {(!isFinal || tab === 'pbp') && (
        <div className="pbp-scroll">
          {lines
            ? lines.map((line, i) => <PbpLine key={i} line={line} game={game} />)
            : <p className="pbp-empty">This game has not been played yet.</p>}
        </div>
      )}
      {isFinal && tab === 'box'   && <BoxScoreView game={game} />}
      {isFinal && tab === 'watch' && <GameViewer game={game} />}
    </section>
  );
}

function PbpLine({ line, game }: { line: string; game: Game }) {
  const isHeader  = line.includes('── Q') || line.includes('Score:') || line.includes('FINAL:');
  const isTd      = line.includes('TOUCHDOWN');
  const isTurnover = line.includes('INTERCEPTED') || line.includes('FUMBLE');
  const isFg      = line.includes('FG') && line.includes('GOOD');
  const isHome    = line.includes(`[${game.homeTeam.abbreviation}]`);
  const isAway    = line.includes(`[${game.awayTeam.abbreviation}]`);

  let cls = 'pbp-line';
  if (isHeader)   cls += ' pbp-header';
  if (isTd)       cls += ' pbp-td';
  if (isTurnover) cls += ' pbp-turnover';
  if (isFg)       cls += ' pbp-fg';
  if (isHome)     cls += ' pbp-home';
  if (isAway)     cls += ' pbp-away';

  return <div className={cls}>{line || '\u00a0'}</div>;
}

// ── Box Score ──────────────────────────────────────────────────────────────────

function BoxScoreView({ game }: { game: Game }) {
  const bs = deriveBoxScore(game);

  const passers  = Object.values(bs.players).filter(p => p.attempts > 0);
  const rushers  = Object.values(bs.players).filter(p => p.carries > 0);
  const receivers = Object.values(bs.players).filter(p => p.targets > 0);

  function TeamRow({ ts }: { ts: typeof bs.home }) {
    const name = ts.teamId === game.homeTeam.id ? game.homeTeam.abbreviation : game.awayTeam.abbreviation;
    return (
      <tr>
        <td>{name}</td>
        {ts.pointsByQuarter.map((q, i) => <td key={i}>{q}</td>)}
        <td><strong>{ts.score}</strong></td>
        <td>{ts.totalYards}</td>
        <td>{ts.rushingYards}</td>
        <td>{ts.passingYards}</td>
        <td>{ts.firstDowns}</td>
        <td>{ts.turnovers}</td>
        <td>{ts.sacksAllowed}</td>
      </tr>
    );
  }

  return (
    <div className="box-score">
      <table>
        <thead>
          <tr><th>Team</th><th>Q1</th><th>Q2</th><th>Q3</th><th>Q4</th><th>Total</th><th>Yds</th><th>Rush</th><th>Pass</th><th>1D</th><th>TO</th><th>Sks</th></tr>
        </thead>
        <tbody>
          <TeamRow ts={bs.away} />
          <TeamRow ts={bs.home} />
        </tbody>
      </table>

      {passers.length > 0 && (
        <>
          <h4>Passing</h4>
          <table>
            <thead><tr><th>Player</th><th>C/ATT</th><th>YDS</th><th>TD</th><th>INT</th><th>SCK</th></tr></thead>
            <tbody>
              {passers.sort((a, b) => b.passingYards - a.passingYards).map(p => (
                <tr key={p.name}>
                  <td>{p.name}</td>
                  <td>{p.completions}/{p.attempts}</td>
                  <td>{p.passingYards}</td>
                  <td>{p.passingTDs}</td>
                  <td>{p.interceptions}</td>
                  <td>{p.sacksTotal}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {rushers.length > 0 && (
        <>
          <h4>Rushing</h4>
          <table>
            <thead><tr><th>Player</th><th>CAR</th><th>YDS</th><th>TD</th></tr></thead>
            <tbody>
              {rushers.sort((a, b) => b.rushingYards - a.rushingYards).map(p => (
                <tr key={p.name}>
                  <td>{p.name}</td>
                  <td>{p.carries}</td>
                  <td>{p.rushingYards}</td>
                  <td>{p.rushingTDs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {receivers.length > 0 && (
        <>
          <h4>Receiving</h4>
          <table>
            <thead><tr><th>Player</th><th>TGT</th><th>REC</th><th>YDS</th><th>TD</th></tr></thead>
            <tbody>
              {receivers.sort((a, b) => b.receivingYards - a.receivingYards).map(p => (
                <tr key={p.name}>
                  <td>{p.name}</td>
                  <td>{p.targets}</td>
                  <td>{p.receptions}</td>
                  <td>{p.receivingYards}</td>
                  <td>{p.receivingTDs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

// ── Game Viewer (Watch mode) ────────────────────────────────────────────────────

function GameViewer({ game }: { game: Game }) {
  const events = game.events ?? [];
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const homeId = game.homeTeam.id;
  const atEnd = events.length === 0 || idx >= events.length - 1;

  // Compute running score up to (and including) current play
  let homeScore = 0, awayScore = 0;
  for (let i = 0; i <= idx && i < events.length; i++) {
    const ev = events[i]!;
    if (ev.result === 'touchdown')       { if (ev.offenseTeamId === homeId) homeScore += 7; else awayScore += 7; }
    if (ev.result === 'field_goal_good') { if (ev.offenseTeamId === homeId) homeScore += 3; else awayScore += 3; }
  }

  useEffect(() => {
    if (!playing) return;
    if (atEnd) { setPlaying(false); return; }
    timerRef.current = setTimeout(() => setIdx(i => i + 1), 800);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [playing, atEnd]);

  function reset() { setPlaying(false); setIdx(0); }

  const currentEvent = events[idx];
  const quarter = currentEvent?.quarter ?? 1;
  const offAbbr = currentEvent
    ? (currentEvent.offenseTeamId === homeId ? game.homeTeam.abbreviation : game.awayTeam.abbreviation)
    : '';
  const playText = currentEvent ? `[${offAbbr}] ${formatPlay(currentEvent)}` : '';
  const quarterLabel = atEnd && events.length > 0 ? 'Final' : `Q${Math.min(quarter, 4)}`;

  return (
    <div className="game-viewer">
      <div className="viewer-score">
        <span>{game.awayTeam.abbreviation} <strong>{awayScore}</strong></span>
        <span className="viewer-quarter">{quarterLabel}</span>
        <span><strong>{homeScore}</strong> {game.homeTeam.abbreviation}</span>
      </div>

      <div className="viewer-play">
        {events.length === 0
          ? <p className="muted">No play data available for this game.</p>
          : <PbpLine line={playText} game={game} />}
      </div>

      {events.length > 0 && (
        <div className="viewer-progress">
          Play {idx + 1} / {events.length}{atEnd ? ' — Final' : ''}
        </div>
      )}

      <div className="viewer-controls">
        <button onClick={reset} disabled={idx === 0 && !playing}>Reset</button>
        <button onClick={() => setIdx(i => Math.max(0, i - 1))} disabled={playing || idx === 0}>◀ Prev</button>
        <button
          onClick={() => setPlaying(v => !v)}
          disabled={events.length === 0 || (atEnd && !playing)}
        >
          {playing ? '⏸ Pause' : '▶ Play'}
        </button>
        <button onClick={() => setIdx(i => Math.min(events.length - 1, i + 1))} disabled={playing || atEnd}>Next ▶</button>
      </div>
    </div>
  );
}

// ── Play-by-play formatter ─────────────────────────────────────────────────────

function downStr(down: number): string {
  return ['1st', '2nd', '3rd', '4th'][down - 1] ?? `${down}th`;
}
function fieldPos(yardLine: number): string {
  if (yardLine < 50)   return `Own ${yardLine}`;
  if (yardLine === 50) return `Mid`;
  return `OPP ${100 - yardLine}`;
}
function formatPlay(ev: PlayEvent): string {
  const sit   = `${downStr(ev.down)}&${ev.distance} ${fieldPos(ev.yardLine).padEnd(7)}`;
  const qb    = ev.ballCarrier ?? '?';
  const wr    = ev.target ?? '?';
  const ydStr = `${ev.yards} yd${Math.abs(ev.yards) !== 1 ? 's' : ''}`;
  let action: string;
  switch (ev.type) {
    case 'inside_run':   action = ev.result === 'touchdown' ? `${qb} dives in — TOUCHDOWN` : `${qb} inside run ${ydStr}`; break;
    case 'outside_run':  action = ev.result === 'touchdown' ? `${qb} sweeps in — TOUCHDOWN` : `${qb} outside run ${ydStr}`; break;
    case 'short_pass':   action = ev.result === 'touchdown' ? `${qb} → ${wr} short — TOUCHDOWN` : ev.result === 'success' ? `${qb} → ${wr} short, ${ydStr}` : `${qb} → ${wr} incomplete`; break;
    case 'medium_pass':  action = ev.result === 'touchdown' ? `${qb} → ${wr} — TOUCHDOWN` : ev.result === 'success' ? `${qb} → ${wr}, ${ydStr}` : `${qb} → ${wr} incomplete`; break;
    case 'deep_pass':    action = ev.result === 'touchdown' ? `${qb} deep → ${wr} — TOUCHDOWN` : ev.result === 'success' ? `${qb} deep → ${wr}, ${ydStr}` : `${qb} deep → ${wr} incomplete`; break;
    case 'sack':         action = `${qb} sacked ${ydStr}`; break;
    case 'interception': action = `${qb} → ${wr} — INTERCEPTED`; break;
    case 'fumble':       action = `${qb} FUMBLE — turnover`; break;
    case 'field_goal':   action = ev.result === 'field_goal_good' ? `${qb} FG ${(100 - ev.yardLine) + 17} yds — GOOD` : `${qb} FG — NO GOOD`; break;
    case 'punt':         action = `Punt ${ydStr}`; break;
    default:             action = ev.type;
  }
  return `${sit} | ${action}${ev.firstDown ? ' ↑' : ''}`;
}
function formatGameLog(game: Game): string[] {
  const lines: string[] = [];
  const homeId = game.homeTeam.id;
  let q = 0, homeScore = 0, awayScore = 0;
  for (const ev of game.events) {
    if (ev.quarter !== q) {
      if (q > 0) { lines.push(`  Score: ${game.awayTeam.abbreviation} ${awayScore} — ${game.homeTeam.abbreviation} ${homeScore}`); lines.push(''); }
      q = ev.quarter;
      lines.push(`── Q${q} ──`);
    }
    const offAbbr = ev.offenseTeamId === homeId ? game.homeTeam.abbreviation : game.awayTeam.abbreviation;
    lines.push(`[${offAbbr}] ${formatPlay(ev)}`);
    if (ev.result === 'touchdown')       { if (ev.offenseTeamId === homeId) homeScore += 7; else awayScore += 7; }
    if (ev.result === 'field_goal_good') { if (ev.offenseTeamId === homeId) homeScore += 3; else awayScore += 3; }
  }
  lines.push('');
  lines.push(`FINAL: ${game.awayTeam.abbreviation} ${game.awayScore} — ${game.homeTeam.abbreviation} ${game.homeScore}`);
  return lines;
}

// ── Activity feed ──────────────────────────────────────────────────────────────

function ActivityFeed({ activities }: { activities: Activity[] }) {
  const sorted = [...activities].reverse();
  return (
    <section>
      <h2>Activity</h2>
      {sorted.length === 0
        ? <p className="muted">No activity yet.</p>
        : sorted.map((a: Activity) => (
          <div key={a.id} className="activity-item">
            <span className="activity-msg">{a.message}</span>
            <span className="activity-time">{fmtTime(a.createdAt)}</span>
          </div>
        ))
      }
    </section>
  );
}

// ── News ───────────────────────────────────────────────────────────────────────

const NEWS_TYPE_LABEL: Record<string, string> = {
  game_result:    'Game',
  playoff_result: 'Playoffs',
  championship:   'Championship',
  award:          'Award',
  signing:        'Signing',
  trade:          'Trade',
  retirement:     'Retirement',
};

const NEWS_TYPE_CLASS: Record<string, string> = {
  game_result:    'news-game',
  playoff_result: 'news-playoff',
  championship:   'news-championship',
  award:          'news-award',
  signing:        'news-signing',
  trade:          'news-trade',
  retirement:     'news-retirement',
};

function NewsView({ news }: { news: NewsItem[] }) {
  return (
    <section>
      <h2>News</h2>
      {news.length === 0
        ? <p className="muted">No news yet — play some games!</p>
        : news.map(n => (
          <div key={n.id} className={`news-item ${NEWS_TYPE_CLASS[n.type] ?? ''}`}>
            <div className="news-header">
              <span className={`news-badge ${NEWS_TYPE_CLASS[n.type] ?? ''}`}>
                {NEWS_TYPE_LABEL[n.type] ?? n.type}
              </span>
              <span className="news-meta">
                {n.week > 0 ? `Wk ${n.week} · ` : ''}{n.year}
              </span>
            </div>
            <div className="news-headline">{n.headline}</div>
            <div className="news-body">{n.body}</div>
          </div>
        ))
      }
    </section>
  );
}

// ── Notifications ──────────────────────────────────────────────────────────────

function NotificationsPanel({ notifications, onMarkRead, onClose }: {
  notifications: LeagueNotification[];
  onMarkRead: () => void;
  onClose: () => void;
}) {
  const sorted = [...notifications].reverse();
  return (
    <div className="notif-panel">
      <div className="notif-panel-header">
        <h3>Notifications</h3>
        <button className="btn-sm" onClick={onMarkRead}>Mark all read</button>
        <button className="btn-sm" onClick={onClose}>Close</button>
      </div>
      {sorted.length === 0
        ? <p className="muted">No notifications.</p>
        : sorted.map((n: LeagueNotification) => (
          <div key={n.id} className={`notif-item${n.read ? '' : ' unread'}`}>
            <span className="notif-msg">{n.message}</span>
            <span className="notif-time">{fmtTime(n.createdAt)}</span>
          </div>
        ))
      }
    </div>
  );
}

// ── Trades ─────────────────────────────────────────────────────────────────────

const PICK_VALUE: Record<number, number> = { 1: 100, 2: 65, 3: 45, 4: 30, 5: 20, 6: 14, 7: 10 };

function assetDisplayValue(asset: TradeAsset): number {
  if (asset.type === 'player') {
    let v = asset.playerOvr;
    return Math.round(v);
  }
  return PICK_VALUE[asset.round] ?? 8;
}

function assetLabel(asset: TradeAsset): string {
  if (asset.type === 'player') return `${asset.playerName} (${asset.playerPos}, OVR ${asset.playerOvr})`;
  return `${asset.year} R${asset.round} (${asset.originalTeamName})`;
}

type PickAsset = Extract<TradeAsset, { type: 'pick' }>;

function getOwnedPicks(league: League, teamId: string): PickAsset[] {
  const draftYear = league.draft?.year ?? (league.currentSeason.year + 1);
  const ownership = league.draftPickOwnership ?? {};
  const picks: PickAsset[] = [];
  for (const team of league.teams) {
    for (let round = 1; round <= 7; round++) {
      const key   = `${draftYear}:${round}:${team.id}`;
      const owner = ownership[key] ?? team.id;
      if (owner === teamId) {
        picks.push({ type: 'pick', year: draftYear, round, originalTeamId: team.id, originalTeamName: team.name });
      }
    }
  }
  return picks;
}

function TradesView({ league, myTeamId, onPropose, onRespond }: {
  league: League;
  myTeamId: string;
  onPropose: (toTeamId: string, fromAssets: TradeAsset[], toAssets: TradeAsset[]) => Promise<void>;
  onRespond: (proposalId: string, accept: boolean) => Promise<void>;
}) {
  const [respondBusy, setRespondBusy] = useState<string | null>(null);
  const [respondError, setRespondError] = useState<string | null>(null);

  // Proposal builder state
  const [targetTeamId,  setTargetTeamId]  = useState('');
  const [giveSet,       setGiveSet]       = useState<Set<string>>(new Set());
  const [receiveSet,    setReceiveSet]     = useState<Set<string>>(new Set());
  const [proposeBusy,   setProposeBusy]   = useState(false);
  const [proposeError,  setProposeError]  = useState<string | null>(null);

  const incoming = league.tradeProposals.filter(p => p.toTeamId === myTeamId && p.status === 'pending');
  const history  = league.tradeProposals.filter(p =>
    (p.fromTeamId === myTeamId || p.toTeamId === myTeamId) && p.status !== 'pending'
  ).slice(-10).reverse();

  const aiTeams    = league.teams.filter(t => t.id !== myTeamId);
  const myTeam     = league.teams.find(t => t.id === myTeamId)!;
  const targetTeam = league.teams.find(t => t.id === targetTeamId);

  const myPicks     = getOwnedPicks(league, myTeamId);
  const targetPicks = targetTeam ? getOwnedPicks(league, targetTeamId) : ([] as PickAsset[]);

  function pickKey(a: PickAsset | TradeAsset): string {
    if (a.type === 'player') return `p:${a.playerId}`;
    return `k:${a.year}:${a.round}:${a.originalTeamId}`;
  }

  function toggleGive(key: string) {
    setGiveSet(s => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }
  function toggleReceive(key: string) {
    setReceiveSet(s => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  function buildAssets(
    keys: Set<string>,
    myRoster: Player[],
    myPicks: PickAsset[],
  ): TradeAsset[] {
    const assets: TradeAsset[] = [];
    for (const k of keys) {
      if (k.startsWith('p:')) {
        const pid = k.slice(2);
        const p   = myRoster.find(pl => pl.id === pid);
        if (p) assets.push({ type: 'player', playerId: p.id, playerName: p.name, playerPos: p.position, playerOvr: p.scoutedOverall });
      } else {
        const pick = myPicks.find(pk => pickKey(pk) === k);
        if (pick) assets.push(pick);
      }
    }
    return assets;
  }

  const fromAssets = buildAssets(giveSet, myTeam.roster, myPicks);
  const toAssets   = buildAssets(receiveSet, targetTeam?.roster ?? [], targetPicks);
  const giveVal    = fromAssets.reduce((s, a) => s + assetDisplayValue(a), 0);
  const recvVal    = toAssets.reduce((s, a) => s + assetDisplayValue(a), 0);

  async function submitProposal() {
    if (!targetTeamId || (fromAssets.length === 0 && toAssets.length === 0)) return;
    setProposeBusy(true); setProposeError(null);
    try {
      await onPropose(targetTeamId, fromAssets, toAssets);
      setGiveSet(new Set()); setReceiveSet(new Set()); setTargetTeamId('');
    } catch (e) {
      setProposeError(friendlyError(e));
    } finally {
      setProposeBusy(false);
    }
  }

  async function respond(proposalId: string, accept: boolean) {
    setRespondBusy(proposalId); setRespondError(null);
    try { await onRespond(proposalId, accept); }
    catch (e) { setRespondError(friendlyError(e)); }
    finally { setRespondBusy(null); }
  }

  function teamName(id: string) { return league.teams.find(t => t.id === id)?.name ?? id; }

  return (
    <section>
      <h2>Trades</h2>

      {incoming.length > 0 && (
        <>
          <h3>Incoming Proposals</h3>
          {respondError && <div className="form-error">{respondError}</div>}
          {incoming.map((p: TradeProposal) => {
            const gv = p.fromAssets.reduce((s, a) => s + assetDisplayValue(a), 0);
            const rv = p.toAssets.reduce((s, a) => s + assetDisplayValue(a), 0);
            return (
              <div key={p.id} className="trade-card">
                <div className="trade-teams"><strong>{teamName(p.fromTeamId)}</strong> → <strong>You</strong></div>
                <div className="trade-sides">
                  <div className="trade-side">
                    <span className="trade-side-label">They give ({gv})</span>
                    {p.fromAssets.map((a, i) => <div key={i} className="trade-asset">{assetLabel(a)}</div>)}
                    {p.fromAssets.length === 0 && <div className="muted">nothing</div>}
                  </div>
                  <div className="trade-side">
                    <span className="trade-side-label">You give ({rv})</span>
                    {p.toAssets.map((a, i) => <div key={i} className="trade-asset">{assetLabel(a)}</div>)}
                    {p.toAssets.length === 0 && <div className="muted">nothing</div>}
                  </div>
                </div>
                <div className="trade-actions">
                  <button className="btn-sm btn-positive" disabled={respondBusy === p.id} onClick={() => respond(p.id, true)}>Accept</button>
                  <button className="btn-sm btn-danger"   disabled={respondBusy === p.id} onClick={() => respond(p.id, false)}>Reject</button>
                </div>
              </div>
            );
          })}
        </>
      )}

      <h3>Propose Trade</h3>
      {proposeError && <div className="form-error">{proposeError}</div>}
      <div className="trade-builder">
        <div className="trade-builder-row">
          <label>Target team:</label>
          <select value={targetTeamId} onChange={e => { setTargetTeamId(e.target.value); setGiveSet(new Set()); setReceiveSet(new Set()); }}>
            <option value="">— select team —</option>
            {aiTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>

        {targetTeam && (
          <>
            <div className="trade-sides">
              <div className="trade-side">
                <strong>You give</strong>
                <div className="trade-checklist">
                  {myTeam.roster.map(p => {
                    const k = `p:${p.id}`; const checked = giveSet.has(k);
                    return (
                      <label key={k} className={`trade-check ${checked ? 'selected' : ''}`}>
                        <input type="checkbox" checked={checked} onChange={() => toggleGive(k)} />
                        {p.name} ({p.position}, {p.scoutedOverall} OVR, ${p.salary}M)
                      </label>
                    );
                  })}
                  {myPicks.map(pk => {
                    const k = pickKey(pk); const checked = giveSet.has(k);
                    return (
                      <label key={k} className={`trade-check pick ${checked ? 'selected' : ''}`}>
                        <input type="checkbox" checked={checked} onChange={() => toggleGive(k)} />
                        {pk.year} R{pk.round} pick ({pk.originalTeamName})
                      </label>
                    );
                  })}
                </div>
                {giveVal > 0 && <div className="trade-value-badge">Value: {giveVal}</div>}
              </div>
              <div className="trade-side">
                <strong>You receive</strong>
                <div className="trade-checklist">
                  {targetTeam.roster.map(p => {
                    const k = `p:${p.id}`; const checked = receiveSet.has(k);
                    return (
                      <label key={k} className={`trade-check ${checked ? 'selected' : ''}`}>
                        <input type="checkbox" checked={checked} onChange={() => toggleReceive(k)} />
                        {p.name} ({p.position}, {p.scoutedOverall} OVR, ${p.salary}M)
                      </label>
                    );
                  })}
                  {targetPicks.map(pk => {
                    const k = pickKey(pk); const checked = receiveSet.has(k);
                    return (
                      <label key={k} className={`trade-check pick ${checked ? 'selected' : ''}`}>
                        <input type="checkbox" checked={checked} onChange={() => toggleReceive(k)} />
                        {pk.year} R{pk.round} pick ({pk.originalTeamName})
                      </label>
                    );
                  })}
                </div>
                {recvVal > 0 && <div className="trade-value-badge">Value: {recvVal}</div>}
              </div>
            </div>
            <div className="trade-submit-row">
              <button
                className="btn-primary"
                disabled={proposeBusy || (fromAssets.length === 0 && toAssets.length === 0)}
                onClick={submitProposal}
              >
                {proposeBusy ? 'Submitting…' : 'Submit Proposal'}
              </button>
              {giveVal > 0 && recvVal > 0 && (
                <span className={`trade-fairness ${recvVal >= giveVal * 0.85 ? 'fair' : recvVal >= giveVal * 0.70 ? 'borderline' : 'unfair'}`}>
                  {recvVal >= giveVal * 0.85 ? '✓ Fair trade' : recvVal >= giveVal * 0.70 ? '~ Borderline' : '✗ Lopsided'}
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {history.length > 0 && (
        <>
          <h3>Recent History</h3>
          {history.map((p: TradeProposal) => {
            const isMine = p.fromTeamId === myTeamId;
            return (
              <div key={p.id} className={`trade-history-row ${p.status}`}>
                <span className="trade-status-badge">{p.status}</span>
                <span>
                  {isMine ? 'You → ' : `${teamName(p.fromTeamId)} → You: `}
                  {describeAssetsDisplay(p.fromAssets)} for {describeAssetsDisplay(p.toAssets)}
                  {!isMine && ` (to ${teamName(p.toTeamId)})`}
                </span>
              </div>
            );
          })}
        </>
      )}
    </section>
  );
}

function describeAssetsDisplay(assets: TradeAsset[]): string {
  if (assets.length === 0) return 'nothing';
  return assets.map(a => a.type === 'player' ? a.playerName : `${a.year} R${a.round}`).join(', ');
}

// ── Roster ─────────────────────────────────────────────────────────────────────

const ROSTER_POS_GROUPS: { label: string; positions: string[] }[] = [
  { label: 'Quarterback',    positions: ['QB'] },
  { label: 'Running Back',   positions: ['RB'] },
  { label: 'Wide Receiver',  positions: ['WR'] },
  { label: 'Tight End',      positions: ['TE'] },
  { label: 'Offensive Line', positions: ['OT', 'OG', 'C'] },
  { label: 'Defensive Line', positions: ['DE', 'DT'] },
  { label: 'Linebacker',     positions: ['OLB', 'MLB'] },
  { label: 'Defensive Back', positions: ['CB', 'FS', 'SS'] },
  { label: 'Special Teams',  positions: ['K', 'P'] },
];

function RosterView({ teams, selectedId, userTeamId, onSelect, team, isOffseason, onRelease, onExtend, busy, onViewPlayer }: {
  teams: League['teams']; selectedId: string; userTeamId: string;
  onSelect: (id: string) => void; team: League['teams'][0];
  isOffseason: boolean;
  busy: boolean;
  onRelease: (playerId: string) => void;
  onExtend: (playerId: string) => void;
  onViewPlayer?: (playerId: string) => void;
}) {
  const isMyTeam = selectedId === userTeamId;
  const payroll  = team.roster.reduce((s, p) => s + p.salary, 0);
  const injured  = team.roster.filter(p => p.injuryWeeksRemaining > 0).length;
  const demands  = team.roster.filter(p => p.contractDemand).length;

  return (
    <section>
      <div className="roster-header">
        <h2>Roster — {team.name}</h2>
        <select value={selectedId} onChange={e => onSelect(e.target.value)}>
          {teams.map(t => (
            <option key={t.id} value={t.id}>{t.name}{t.id === userTeamId ? ' (You)' : ''}</option>
          ))}
        </select>
        <span className="budgets">
          {team.roster.length} players · Cap ${payroll}M
          {injured > 0 && <span className="neg"> · {injured} IR</span>}
          {isMyTeam && demands > 0 && <span className="expiring"> · {demands} demand{demands !== 1 ? 's' : ''}</span>}
        </span>
      </div>

      {ROSTER_POS_GROUPS.map(group => {
        const players = team.roster
          .filter(p => group.positions.includes(p.position))
          .sort((a, b) => b.scoutedOverall - a.scoutedOverall);
        if (players.length === 0) return null;
        return (
          <div key={group.label} className="roster-pos-group">
            <div className="roster-pos-header">{group.label} <span className="roster-pos-count">{players.length}</span></div>
            <table>
              <thead>
                <tr>
                  <th>Name</th><th>Pos</th><th>Age</th><th>OVR</th><th>Salary</th><th>Yrs</th><th>Inj</th>
                  {isMyTeam && <th></th>}
                </tr>
              </thead>
              <tbody>
                {players.map((p, i) => (
                  <PlayerRow
                    key={p.id}
                    player={p}
                    isStarter={i === 0}
                    isMyTeam={isMyTeam}
                    isOffseason={isOffseason}
                    busy={busy}
                    onRelease={() => onRelease(p.id)}
                    onExtend={() => onExtend(p.id)}
                    onViewPlayer={onViewPlayer}
                  />
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </section>
  );
}

function PlayerRow({ player: p, isStarter, isMyTeam, isOffseason, busy, onRelease, onExtend, onViewPlayer }: {
  player: Player;
  isStarter?: boolean;
  isMyTeam?: boolean;
  isOffseason?: boolean;
  busy?: boolean;
  onRelease?: () => void;
  onExtend?: () => void;
  onViewPlayer?: (playerId: string) => void;
}) {
  const injured = p.injuryWeeksRemaining > 0;
  return (
    <tr className={injured ? 'injured' : ''}>
      <td>
        {isStarter && <span className="starter-badge">S</span>}
        {onViewPlayer
          ? <button className="player-name-link" onClick={() => onViewPlayer(p.id)}>{p.name}</button>
          : p.name}
        {p.contractDemand && <span className="contract-demand-badge" title={`Wants $${p.contractDemand.salary}M/${p.contractDemand.years}yr`}> !</span>}
        {p.isRookie && <span className="rookie-badge">R</span>}
      </td>
      <td>{p.position}</td>
      <td>{p.age}</td>
      <td className="ovr-cell">{p.scoutedOverall}</td>
      <td>${p.salary}M</td>
      <td className={p.yearsRemaining === 1 ? 'expiring' : ''}>{p.yearsRemaining}yr</td>
      <td>{injured ? <span className="neg">IR:{p.injuryWeeksRemaining}wk</span> : <span className="muted">—</span>}</td>
      {isMyTeam && (
        <td className="action-cell">
          {isOffseason && <button className="btn-sm btn-danger" disabled={busy} onClick={onRelease}>Release</button>}
          {isOffseason && p.contractDemand && <button className="btn-sm btn-positive" disabled={busy} onClick={onExtend}>Extend</button>}
        </td>
      )}
    </tr>
  );
}

// ── Depth Chart ────────────────────────────────────────────────────────────────

const DEPTH_SLOTS = ['QB', 'RB', 'WR', 'TE', 'OL', 'DE', 'DT', 'LB', 'CB', 'S', 'K', 'P'] as const;
const STARTER_COUNTS: Record<string, number> = {
  QB: 1, RB: 1, WR: 2, TE: 1, OL: 5,
  DE: 2, DT: 2, LB: 2, CB: 2, S: 2, K: 1, P: 1,
};
const SLOT_POSITIONS: Record<string, string[]> = {
  QB: ['QB'], RB: ['RB'], WR: ['WR'], TE: ['TE'],
  OL: ['OT', 'OG', 'C'], DE: ['DE'], DT: ['DT'],
  LB: ['OLB', 'MLB'], CB: ['CB'], S: ['FS', 'SS'],
  K: ['K'], P: ['P'],
};

function DepthChartView({ team, busy, onReorder }: {
  team: League['teams'][0];
  busy: boolean;
  onReorder: (slot: string, playerIds: string[]) => void;
}) {
  const [dragState, setDragState] = useState<{ slot: string; idx: number } | null>(null);

  // IDs of all players already in any depth chart slot
  const allAssignedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const slot of DEPTH_SLOTS) {
      for (const p of (team.depthChart?.[slot] ?? [])) {
        if (p) ids.add(p.id);
      }
    }
    return ids;
  }, [team.depthChart]);

  /** Depth chart players + any unassigned roster players for this slot's positions */
  function getSlotPlayers(slot: string): Player[] {
    const inChart = (team.depthChart?.[slot] ?? []).filter((p): p is Player => p !== null);
    const positions = SLOT_POSITIONS[slot] ?? [];
    const unassigned = team.roster.filter(
      p => positions.includes(p.position) && !allAssignedIds.has(p.id),
    );
    return [...inChart, ...unassigned];
  }

  function moveUp(slot: string, idx: number, players: Player[]) {
    if (idx === 0) return;
    const ids = players.map(p => p.id);
    [ids[idx - 1], ids[idx]] = [ids[idx]!, ids[idx - 1]!];
    onReorder(slot, ids);
  }

  function moveDown(slot: string, idx: number, players: Player[]) {
    if (idx >= players.length - 1) return;
    const ids = players.map(p => p.id);
    [ids[idx], ids[idx + 1]] = [ids[idx + 1]!, ids[idx]!];
    onReorder(slot, ids);
  }

  function removeFromSlot(slot: string, idx: number, players: Player[]) {
    const ids = players.map(p => p.id).filter((_, i) => i !== idx);
    onReorder(slot, ids);
  }

  function handleDragStart(slot: string, idx: number) {
    setDragState({ slot, idx });
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  function handleDrop(slot: string, dropIdx: number, players: Player[]) {
    if (!dragState || dragState.slot !== slot) { setDragState(null); return; }
    const ids = players.map(p => p.id);
    const [moved] = ids.splice(dragState.idx, 1);
    if (moved !== undefined) ids.splice(dropIdx, 0, moved);
    onReorder(slot, ids);
    setDragState(null);
  }

  return (
    <section>
      <h2>Depth Chart — {team.name}</h2>
      <p className="muted" style={{ marginBottom: '1rem' }}>
        Drag rows to reorder · ▲▼ to nudge · 🗑 to remove from slot (player stays on roster)
      </p>
      <div className="depth-chart-grid">
        {DEPTH_SLOTS.map(slot => {
          const players = getSlotPlayers(slot);
          if (players.length === 0) return null;
          const starters = STARTER_COUNTS[slot] ?? 1;
          return (
            <div key={slot} className="depth-slot">
              <div className="depth-slot-header">{slot}</div>
              {players.map((p, i) => (
                <div
                  key={p.id}
                  className={`depth-slot-row${i < starters ? ' depth-starter' : ' depth-backup'}${dragState?.slot === slot && dragState.idx === i ? ' depth-dragging' : ''}`}
                  draggable
                  onDragStart={() => handleDragStart(slot, i)}
                  onDragOver={handleDragOver}
                  onDrop={() => handleDrop(slot, i, players)}
                >
                  <span className="depth-drag-handle" title="Drag to reorder">⠿</span>
                  <span className="depth-rank">{i + 1}</span>
                  <span className="depth-name">{p.name}</span>
                  <span className="depth-ovr">{p.scoutedOverall}</span>
                  <div className="depth-arrows">
                    <button className="depth-arrow" disabled={busy || i === 0} onClick={() => moveUp(slot, i, players)}>▲</button>
                    <button className="depth-arrow" disabled={busy || i === players.length - 1} onClick={() => moveDown(slot, i, players)}>▼</button>
                  </div>
                  <button
                    className="depth-remove"
                    disabled={busy}
                    title="Remove from this slot"
                    onClick={() => removeFromSlot(slot, i, players)}
                  >🗑</button>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Injury Report ──────────────────────────────────────────────────────────────

function InjuryReportView({ teams, userTeamId }: { teams: League['teams']; userTeamId: string }) {
  const allInjured = teams.flatMap(t =>
    t.roster.filter(p => p.injuryWeeksRemaining > 0).map(p => ({ ...p, teamName: t.name, teamId: t.id }))
  ).sort((a, b) => b.injuryWeeksRemaining - a.injuryWeeksRemaining);

  const myInjured  = allInjured.filter(p => p.teamId === userTeamId);
  const otrInjured = allInjured.filter(p => p.teamId !== userTeamId);

  function InjuredTable({ players }: { players: typeof allInjured }) {
    if (players.length === 0) return <p className="muted">None.</p>;
    return (
      <table>
        <thead><tr><th>Player</th><th>Pos</th><th>Team</th><th>OVR</th><th>Wks Out</th></tr></thead>
        <tbody>
          {players.map(p => (
            <tr key={p.id}>
              <td>{p.name}</td>
              <td>{p.position}</td>
              <td>{p.teamName}</td>
              <td>{p.scoutedOverall}</td>
              <td className="neg">{p.injuryWeeksRemaining} wk{p.injuryWeeksRemaining !== 1 ? 's' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <section>
      <h2>Injury Report</h2>
      <h3>Your Team</h3>
      <InjuredTable players={myInjured} />
      <h3 style={{ marginTop: '1.5rem' }}>League-Wide</h3>
      <InjuredTable players={otrInjured} />
    </section>
  );
}

// ── Free Agents ────────────────────────────────────────────────────────────────

function FreeAgentsView({ freeAgents, isOffseason, busy, onSign }: {
  freeAgents: Player[];
  isOffseason: boolean;
  busy: boolean;
  onSign: (playerId: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [posFilter, setPosFilter] = useState('ALL');

  const positions = ['ALL', ...Array.from(new Set(freeAgents.map(p => p.position))).sort()];
  let sorted = [...freeAgents].sort((a, b) => b.scoutedOverall - a.scoutedOverall);
  if (posFilter !== 'ALL') sorted = sorted.filter(p => p.position === posFilter);

  async function handleSign(playerId: string) {
    setError(null);
    try { await onSign(playerId); }
    catch (e) { setError(friendlyError(e)); }
  }

  return (
    <section>
      <div className="fa-header">
        <h2>Free Agents</h2>
        <select value={posFilter} onChange={e => setPosFilter(e.target.value)} className="fa-pos-filter">
          {positions.map(pos => <option key={pos} value={pos}>{pos}</option>)}
        </select>
        <span className="muted">{sorted.length} player{sorted.length !== 1 ? 's' : ''}</span>
      </div>
      {!isOffseason && <p className="muted" style={{ marginBottom: '0.75rem' }}>Signing available during offseason only.</p>}
      {error && <div className="form-error">{error}</div>}
      {sorted.length === 0
        ? <p className="muted">No free agents{posFilter !== 'ALL' ? ` at ${posFilter}` : ''}.</p>
        : (
          <table>
            <thead>
              <tr><th>Name</th><th>Pos</th><th>Age</th><th>OVR</th><th>Salary</th>{isOffseason && <th></th>}</tr>
            </thead>
            <tbody>
              {sorted.map(p => (
                <tr key={p.id}>
                  <td>{p.name}{p.isRookie && <span className="rookie-badge">R</span>}</td>
                  <td>{p.position}</td>
                  <td>{p.age}</td>
                  <td className="ovr-cell">{p.scoutedOverall}</td>
                  <td>${p.salary}M</td>
                  {isOffseason && (
                    <td><button className="btn-sm btn-positive" disabled={busy} onClick={() => handleSign(p.id)}>Sign</button></td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
    </section>
  );
}

// ── Team Overview ──────────────────────────────────────────────────────────────

function TeamOverviewView({ league, myTeamId }: { league: League; myTeamId: string }) {
  const team    = league.teams.find(t => t.id === myTeamId)!;
  const games   = league.currentSeason.games;
  const payroll = team.roster.reduce((s, p) => s + p.salary, 0);

  // Record
  let w = 0, l = 0, t = 0, pf = 0, pa = 0;
  for (const g of games) {
    if (g.status !== 'final') continue;
    const isHome = g.homeTeam.id === myTeamId;
    const isAway = g.awayTeam.id === myTeamId;
    if (!isHome && !isAway) continue;
    const myScore  = isHome ? g.homeScore : g.awayScore;
    const oppScore = isHome ? g.awayScore : g.homeScore;
    pf += myScore; pa += oppScore;
    if (myScore > oppScore) w++;
    else if (myScore < oppScore) l++;
    else t++;
  }

  // Next game
  const nextGame = games.find(g => g.status !== 'final' && (g.homeTeam.id === myTeamId || g.awayTeam.id === myTeamId));
  const recentGames = games
    .filter(g => g.status === 'final' && (g.homeTeam.id === myTeamId || g.awayTeam.id === myTeamId))
    .slice(-5).reverse();

  return (
    <section>
      <h2>{team.name}</h2>

      <div className="team-overview-grid">
        {/* Record */}
        <div className="ov-card">
          <div className="ov-card-title">Season Record</div>
          <div className="ov-record">{w}–{l}{t > 0 ? `–${t}` : ''}</div>
          <div className="muted">PF: {pf} · PA: {pa} · Diff: {pf - pa >= 0 ? '+' : ''}{pf - pa}</div>
        </div>

        {/* Roster */}
        <div className="ov-card">
          <div className="ov-card-title">Roster</div>
          <div className="ov-stat">{team.roster.length} players</div>
          <div className="muted">Cap: ${payroll}M used</div>
        </div>

        {/* Coaches */}
        <div className="ov-card">
          <div className="ov-card-title">Coaching Staff</div>
          <div className="ov-coach"><span className="muted">HC</span> {team.coaches.hc.name} ({team.coaches.hc.overall})</div>
          <div className="ov-coach"><span className="muted">OC</span> {team.coaches.oc.name} ({team.coaches.oc.overall})</div>
          <div className="ov-coach"><span className="muted">DC</span> {team.coaches.dc.name} ({team.coaches.dc.overall})</div>
        </div>

        {/* Next game */}
        <div className="ov-card">
          <div className="ov-card-title">Next Game</div>
          {nextGame
            ? (
              <>
                <div className="ov-stat">Wk {nextGame.week}</div>
                <div className="muted">
                  {nextGame.homeTeam.id === myTeamId
                    ? `vs ${nextGame.awayTeam.name}`
                    : `@ ${nextGame.homeTeam.name}`}
                </div>
              </>
            )
            : <div className="muted">{league.phase === 'offseason' ? 'Offseason' : 'No upcoming games'}</div>}
        </div>
      </div>

      {/* Recent results */}
      {recentGames.length > 0 && (
        <>
          <h3 style={{ marginTop: '1.5rem' }}>Recent Results</h3>
          <table>
            <thead><tr><th>Wk</th><th>Opponent</th><th>H/A</th><th>Result</th></tr></thead>
            <tbody>
              {recentGames.map(g => {
                const isHome = g.homeTeam.id === myTeamId;
                const myScore  = isHome ? g.homeScore : g.awayScore;
                const oppScore = isHome ? g.awayScore : g.homeScore;
                const opp = isHome ? g.awayTeam.name : g.homeTeam.name;
                const result = myScore > oppScore ? 'W' : myScore < oppScore ? 'L' : 'T';
                return (
                  <tr key={g.id}>
                    <td>{g.week}</td>
                    <td>{opp}</td>
                    <td>{isHome ? 'H' : 'A'}</td>
                    <td className={result === 'W' ? 'pos' : result === 'L' ? 'neg' : ''}>
                      {result} {myScore}–{oppScore}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}

// ── Contracts ──────────────────────────────────────────────────────────────────

function ContractsView({ team, isOffseason, busy, onExtend, onRelease }: {
  team: League['teams'][0];
  isOffseason: boolean;
  busy: boolean;
  onExtend: (playerId: string) => void;
  onRelease: (playerId: string) => void;
}) {
  const withDemands = team.roster.filter(p => p.contractDemand);
  const expiring    = team.roster.filter(p => !p.contractDemand && p.yearsRemaining === 1);
  const all = [...team.roster].sort((a, b) => a.yearsRemaining - b.yearsRemaining);

  function ContractRow({ p }: { p: Player }) {
    return (
      <tr>
        <td>{p.name}</td>
        <td>{p.position}</td>
        <td>{p.age}</td>
        <td>{p.scoutedOverall}</td>
        <td>${p.salary}M</td>
        <td className={p.yearsRemaining === 1 ? 'expiring' : ''}>{p.yearsRemaining}yr</td>
        <td>
          {p.contractDemand
            ? <span className="demand-tag">${p.contractDemand.salary}M / {p.contractDemand.years}yr</span>
            : <span className="muted">—</span>}
        </td>
        {isOffseason && (
          <td className="action-cell">
            {p.contractDemand && <button className="btn-sm btn-positive" disabled={busy} onClick={() => onExtend(p.id)}>Extend</button>}
            <button className="btn-sm btn-danger" disabled={busy} onClick={() => onRelease(p.id)}>Release</button>
          </td>
        )}
      </tr>
    );
  }

  return (
    <section>
      <h2>Contracts — {team.name}</h2>

      {withDemands.length > 0 && (
        <>
          <h3>Contract Demands ({withDemands.length})</h3>
          <p className="muted" style={{ marginBottom: '0.5rem' }}>Players requesting new contracts. Extend or let them walk to free agency.</p>
          <table>
            <thead><tr><th>Player</th><th>Pos</th><th>Age</th><th>OVR</th><th>Current</th><th>Yrs</th><th>Demand</th>{isOffseason && <th></th>}</tr></thead>
            <tbody>{withDemands.map(p => <ContractRow key={p.id} p={p} />)}</tbody>
          </table>
        </>
      )}

      {expiring.length > 0 && (
        <>
          <h3 style={{ marginTop: '1.5rem' }}>Expiring After Season ({expiring.length})</h3>
          <table>
            <thead><tr><th>Player</th><th>Pos</th><th>Age</th><th>OVR</th><th>Salary</th><th>Yrs</th><th>Demand</th>{isOffseason && <th></th>}</tr></thead>
            <tbody>{expiring.map(p => <ContractRow key={p.id} p={p} />)}</tbody>
          </table>
        </>
      )}

      <h3 style={{ marginTop: '1.5rem' }}>All Contracts ({all.length})</h3>
      <table>
        <thead><tr><th>Player</th><th>Pos</th><th>Age</th><th>OVR</th><th>Salary</th><th>Yrs</th><th>Demand</th>{isOffseason && <th></th>}</tr></thead>
        <tbody>{all.map(p => <ContractRow key={p.id} p={p} />)}</tbody>
      </table>
    </section>
  );
}


// ── Draft View ─────────────────────────────────────────────────────────────────

function DraftView({ league, myTeamId, busy, onPick, onSimDraft, onAdvance }: {
  league: League;
  myTeamId: string;
  busy: boolean;
  onPick: (playerId: string) => void;
  onSimDraft: () => void;
  onAdvance: () => void;
}) {
  const [posFilter, setPosFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'ovr' | 'pos'>('ovr');
  const draft = league.draft;

  if (!draft) {
    return (
      <section>
        <h2>Draft</h2>
        <p className="muted">Draft has not started yet. Advance from the offseason to begin.</p>
      </section>
    );
  }

  const currentSlot = draft.slots[draft.currentSlotIdx];
  const isMyTurn = !draft.complete && currentSlot?.teamId === myTeamId;
  const myTeamName = league.teams.find(t => t.id === myTeamId)?.name ?? 'Your Team';

  // Find next user pick
  const nextUserSlot = draft.slots.find((s, i) => i >= draft.currentSlotIdx && s.teamId === myTeamId && !s.playerId);

  // Prospect board
  const positions = ['ALL', ...Array.from(new Set(draft.players.map(p => p.position))).sort()];
  let prospects = [...draft.players];
  if (posFilter !== 'ALL') prospects = prospects.filter(p => p.position === posFilter);
  if (sortBy === 'ovr') prospects = prospects.sort((a, b) => b.scoutedOverall - a.scoutedOverall);
  else prospects = prospects.sort((a, b) => a.position.localeCompare(b.position) || b.scoutedOverall - a.scoutedOverall);

  // Recent picks (last 15)
  const recentPicks: DraftSlot[] = draft.slots
    .slice(0, draft.currentSlotIdx)
    .filter(s => s.playerId)
    .slice(-15)
    .reverse();

  function tierLabel(ovr: number): string {
    if (ovr >= 70) return '★';
    if (ovr >= 57) return '◆';
    return '·';
  }

  return (
    <section>
      <div className="draft-header">
        <h2>{draft.year} Draft</h2>
        <div className="draft-header-actions">
          {!draft.complete && (
            <button className="btn-sm" disabled={busy} onClick={onSimDraft}>Sim Remaining</button>
          )}
          {draft.complete && (
            <button className="advance-btn" disabled={busy} onClick={onAdvance}>
              {busy ? 'Loading…' : 'Start Season'}
            </button>
          )}
        </div>
      </div>

      {/* Status bar */}
      {!draft.complete && currentSlot && (
        <div className={`draft-onclock${isMyTurn ? ' draft-onclock-user' : ''}`}>
          <span className="draft-onclock-label">
            Round {currentSlot.round}, Pick {currentSlot.pick} (#{currentSlot.overallPick})
          </span>
          <span className="draft-onclock-team">
            {isMyTurn ? `🏈 ${myTeamName} — YOUR PICK` : `On the clock: ${currentSlot.teamName}`}
          </span>
          {!isMyTurn && nextUserSlot && (
            <span className="draft-next-user">
              Your next pick: Rd {nextUserSlot.round}, Pk {nextUserSlot.pick}
            </span>
          )}
        </div>
      )}
      {draft.complete && (
        <div className="draft-onclock">
          <span className="draft-onclock-label">Draft Complete</span>
          <span className="draft-onclock-team">Click "Start Season" to begin the regular season.</span>
        </div>
      )}

      <div className="draft-layout">
        {/* Prospect board */}
        <div className="draft-board">
          <div className="draft-board-header">
            <span className="draft-board-title">Available Prospects ({draft.players.length})</span>
            <div className="draft-board-filters">
              <select value={posFilter} onChange={e => setPosFilter(e.target.value)}>
                {positions.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <button className={`btn-sm${sortBy === 'ovr' ? ' active' : ''}`} onClick={() => setSortBy('ovr')}>OVR</button>
              <button className={`btn-sm${sortBy === 'pos' ? ' active' : ''}`} onClick={() => setSortBy('pos')}>POS</button>
            </div>
          </div>
          <div className="draft-board-scroll">
            <table className="draft-table">
              <thead>
                <tr><th></th><th>Name</th><th>Pos</th><th>Age</th><th>OVR</th>{isMyTurn && <th></th>}</tr>
              </thead>
              <tbody>
                {prospects.slice(0, 80).map(p => (
                  <tr key={p.id} className="draft-prospect-row">
                    <td className="draft-tier">{tierLabel(p.scoutedOverall)}</td>
                    <td className="draft-name">{p.name}</td>
                    <td>{p.position}</td>
                    <td>{p.age}</td>
                    <td className="draft-ovr">{p.scoutedOverall}</td>
                    {isMyTurn && (
                      <td>
                        <button className="btn-sm btn-positive" disabled={busy} onClick={() => onPick(p.id)}>
                          Draft
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {prospects.length > 80 && (
                  <tr><td colSpan={6} className="muted" style={{ padding: '0.5rem', textAlign: 'center' }}>
                    +{prospects.length - 80} more (filter by position to narrow)
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent picks log */}
        <div className="draft-log">
          <div className="draft-log-title">Recent Picks</div>
          {recentPicks.length === 0 && <p className="muted" style={{ padding: '0.5rem' }}>No picks yet.</p>}
          {recentPicks.map(s => (
            <div key={s.overallPick} className={`draft-log-row${s.teamId === myTeamId ? ' draft-log-user' : ''}`}>
              <span className="draft-log-pick">R{s.round}P{s.pick}</span>
              <span className="draft-log-team">{s.teamName.split(' ').pop()}</span>
              <span className="draft-log-player">{s.playerPos} {s.playerName}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
