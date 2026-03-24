import { useState, useEffect, useRef, useMemo } from 'react';
import { deriveBoxScore } from './boxScore';
import { aggregateSeasonStats, type SeasonPlayerStats } from './seasonStats';
import { DashboardSchedule } from './DashboardSchedule';
import {
  listLeagues, createLeague, joinLeague, fetchLeague, advanceWeek,
  claimTeam as claimTeamApi, proposeTrade as proposeTradeApi, respondTrade as respondTradeApi,
  markNotificationsRead as markReadApi,
  extendPlayer as extendPlayerApi, releasePlayer as releasePlayerApi,
  setDepthChart as setDepthChartApi, setGameplan as setGameplanApi,
  draftPick as draftPickApi, simDraft as simDraftApi,
  scoutProspect as scoutProspectApi, updateDraftBoard as updateDraftBoardApi,
  advanceDraftPick as advanceDraftPickApi, advanceToUserPick as advanceToUserPickApi,
  offerContract as offerContractApi,
  shopPlayer as shopPlayerApi,
  fireCoach as fireCoachApi, hireCoach as hireCoachApi, promoteWithin as promoteWithinApi,
  signup, login, getMyLeagues, getMe,
  getLeagueMembers as getLeagueMembersApi, updateLeagueSettings as updateLeagueSettingsApi, kickMember as kickMemberApi,
  setAuthToken, setAuthUser, clearAuth, authToken, authUserId, authUsername,
  type LeagueSummary, type CreateLeagueParams, type AuthResult, type MyLeagueSummary, type LeagueMember,
} from './api';
import { computeStandings, CAP_LIMIT, getVisibleRatings, type League, type Standing, type Game, type Player, type PlayEvent, type TradeProposal, type TradeAsset, type LeagueNotification, type Activity, type PlayoffBracket, type SeasonRecord, type Division, type DraftSlot, type NewsItem, type GameplanSettings, DEFAULT_GAMEPLAN, type PassEmphasis, type RunEmphasis, type Tempo, type PlayActionUsage, type DefensiveFocus, type OffensivePlaybook, type DefensivePlaybook, type ClientProspect, type ProspectScoutingState, type ScoutingReport, type LeagueHistory, type AwardRecord, type PlayerSeasonHistoryLine, type RetiredPlayerRecord, type PlayerSeasonStats, type HallOfFameEntry, type LegacyTier, type Coach, type CoachPersonality, type CoachTrait, type RingOfHonorEntry, type GmCareer, type FrontOfficePersonality } from './types';
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

// ── Front-office personality helpers ────────────────────────────────────────────

const FO_LABEL: Record<FrontOfficePersonality, string> = {
  balanced:     'Balanced',
  aggressive:   'Aggressive',
  conservative: 'Conservative',
  win_now:      'Win-Now',
  rebuilder:    'Rebuilder',
  development:  'Development',
};

const FO_DESC: Record<FrontOfficePersonality, string> = {
  balanced:     'Even-handed approach; no strong bias in any direction.',
  aggressive:   'Prioritises impact players and is willing to spend and take risks.',
  conservative: 'Patient and value-driven; avoids overpaying in free agency or trades.',
  win_now:      'Maximises the current championship window; trades future for today.',
  rebuilder:    'Trades veterans for youth and picks; building for the long term.',
  development:  'Invests in young players and internal growth; tolerates short-term results.',
};

function FoPersonalityBadge({ personality, size = 'sm' }: { personality: FrontOfficePersonality | undefined; size?: 'sm' | 'md' }) {
  if (!personality) return null;
  return (
    <span className={`fo-badge fo-${personality.replace('_', '-')} fo-badge-${size}`} title={FO_DESC[personality]}>
      {FO_LABEL[personality]}
    </span>
  );
}

// ── Top-level screen ───────────────────────────────────────────────────────────

type Screen = 'loading' | 'auth' | 'my-leagues' | 'create' | 'join' | 'browse' | 'team-select' | 'league';

export default function App() {
  // Auth state — seeded from localStorage so they survive a page refresh.
  const [userId, setUserId]     = useState<string | null>(authUserId);
  const [username, setUsername] = useState<string | null>(authUsername);

  // Screen/league state. Start at 'loading' if a token exists so we can
  // validate it before showing anything; go straight to 'auth' if there is none.
  const [screen, setScreen]     = useState<Screen>(() => authToken ? 'loading' : 'auth');
  const [leagueId, setLeagueId] = useState<string | null>(null);
  const [league, setLeague]     = useState<League | null>(null);
  const [myTeamId, setMyTeamId] = useState<string | null>(null);

  // On mount: validate stored token with the server. On success, restore user
  // identity and continue; on failure, wipe stale auth and send to login.
  useEffect(() => {
    if (!authToken) return;
    getMe()
      .then(({ userId: uid, username: uname }) => {
        setUserId(uid);
        setUsername(uname);
        setAuthUser(uid, uname);
        setScreen('my-leagues');
      })
      .catch(() => {
        clearAuth();
        setUserId(null);
        setUsername(null);
        setScreen('auth');
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleAuthSuccess(result: AuthResult) {
    setAuthToken(result.token);
    setAuthUser(result.userId, result.username);
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
    // Use the token (not username state) as the authoritative check so that
    // users are never accidentally redirected to the login screen mid-session.
    setScreen(authToken ? 'my-leagues' : 'auth');
  }

  if (screen === 'loading') return (
    <div className="form-screen">
      <div className="form-card">
        <p className="muted">Restoring session…</p>
      </div>
    </div>
  );

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
    getMyLeagues().then(setSummaries).catch(e => setError(friendlyError(e)));
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
    listLeagues().then(setLeagues).catch(e => setError(friendlyError(e)));
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
  const [tab, setTab] = useState<'dashboard' | 'standings' | 'playoffs' | 'leaders' | 'roster' | 'depth' | 'injuries' | 'free-agents' | 'team' | 'contracts' | 'trades' | 'activity' | 'draft' | 'news' | 'commissioner' | 'gameplan' | 'playbooks' | 'coaching' | 'scouting' | 'draft-board' | 'awards' | 'history' | 'hof' | 'legacy' | 'gm'>('dashboard');
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

  async function handleShopPlayer(playerId: string): Promise<number> {
    setBusy(true); setError(null);
    try {
      const result = await shopPlayerApi(leagueId, playerId);
      setLeague(result.league);
      return result.count;
    }
    catch (e) { setError(friendlyError(e)); return 0; }
    finally { setBusy(false); }
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

  async function handleOfferContract(playerId: string, salary: number, years: number) {
    setBusy(true); setError(null);
    try {
      const result = await offerContractApi(leagueId, playerId, salary, years);
      setLeague(result.league);
      if (!result.accepted) setError(result.message);
    }
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

  async function handleAdvanceDraftPick() {
    setBusy(true); setError(null);
    try { setLeague(await advanceDraftPickApi(leagueId)); }
    catch (e) { setError(friendlyError(e)); }
    finally { setBusy(false); }
  }

  async function handleAdvanceToUserPick() {
    setBusy(true); setError(null);
    try { setLeague(await advanceToUserPickApi(leagueId)); }
    catch (e) { setError(friendlyError(e)); }
    finally { setBusy(false); }
  }

  async function handleScoutProspect(prospectId: string) {
    setBusy(true); setError(null);
    try { setLeague(await scoutProspectApi(leagueId, prospectId)); }
    catch (e) { setError(friendlyError(e)); }
    finally { setBusy(false); }
  }

  async function handleUpdateDraftBoard(board: string[]) {
    try { setLeague(await updateDraftBoardApi(leagueId, board)); }
    catch (e) { setError(friendlyError(e)); }
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
          <button className={tab === 'awards'  ? 'active' : ''} onClick={() => setTab('awards')}>Awards</button>
          <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>History</button>
          <button className={tab === 'hof'     ? 'active' : ''} onClick={() => setTab('hof')}>Hall of Fame</button>
          <button className={tab === 'legacy'  ? 'active' : ''} onClick={() => setTab('legacy')}>Ring of Honor</button>
          {league.gmCareer && (
            <button className={tab === 'gm' ? 'active' : ''} onClick={() => setTab('gm')}>GM Career</button>
          )}
          {(league.phase === 'draft' || league.draft) && (
            <button className={tab === 'draft' ? 'active' : ''} onClick={() => setTab('draft')}>
              Draft{league.draft && !league.draft.complete && <span className="badge">!</span>}
            </button>
          )}
          {league.draftClass && (
            <button className={tab === 'scouting' ? 'active' : ''} onClick={() => setTab('scouting')}>Scouting</button>
          )}
          {league.draftClass && (
            <button className={tab === 'draft-board' ? 'active' : ''} onClick={() => setTab('draft-board')}>Draft Board</button>
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
          history={league.history}
          myTeamId={myTeamId}
          busy={busy}
          advanceBtnLabel={advanceBtnLabel()}
          onAdvance={() => action(advanceWeek)}
          onViewPlayer={handleViewPlayer}
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
          busy={busy}
          onPropose={handleProposeTrade}
          onRespond={handleRespondTrade}
          onShopPlayer={handleShopPlayer}
        />
      )}
      {tab === 'activity' && <ActivityFeed activities={league.activities} />}
      {tab === 'news' && (
        <NewsView
          news={league.news ?? []}
          myTeamId={myTeamId}
          onViewPlayer={handleViewPlayer}
        />
      )}
      {tab === 'leaders' && (
        <LeadersView
          games={league.currentSeason.games}
          teams={league.teams}
          history={league.history}
          freeAgents={league.freeAgents}
          currentSeasonStats={league.currentSeasonStats}
          onViewPlayer={handleViewPlayer}
        />
      )}
      {tab === 'awards'  && (
        <AwardsView history={league.history} myTeamId={myTeamId} onViewPlayer={handleViewPlayer} />
      )}
      {tab === 'history' && (
        <HistoryView history={league.history} teams={league.teams} myTeamId={myTeamId} />
      )}
      {tab === 'hof' && (
        <HallOfFameView history={league.history} teams={league.teams} onViewPlayer={handleViewPlayer} />
      )}
      {tab === 'legacy' && (
        <RingOfHonorView history={league.history} teams={league.teams} myTeamId={myTeamId} onViewPlayer={handleViewPlayer} />
      )}
      {tab === 'gm' && league.gmCareer && (
        <GmCareerView career={league.gmCareer} />
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
          league={league}
          myTeamId={myTeamId}
          busy={busy}
          onOffer={handleOfferContract}
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
          onAdvanceOnePick={handleAdvanceDraftPick}
          onAdvanceToMyPick={handleAdvanceToUserPick}
        />
      )}
      {tab === 'scouting' && league.draftClass && (
        <ScoutingView
          draftClass={league.draftClass}
          myTeam={league.teams.find(t => t.id === myTeamId)!}
          busy={busy}
          onScout={handleScoutProspect}
        />
      )}
      {tab === 'draft-board' && league.draftClass && (
        <DraftBoardView
          draftClass={league.draftClass}
          myTeam={league.teams.find(t => t.id === myTeamId)!}
          onUpdateBoard={handleUpdateDraftBoard}
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
      {tab === 'coaching'  && <CoachingView  team={league.teams.find(t => t.id === myTeamId)!} league={league} leagueId={leagueId} onLeagueUpdated={setLeague} />}

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
            history={league.history}
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

// ── Coaching helpers ──────────────────────────────────────────────────────────

function traitLabel(trait: CoachTrait): string {
  const labels: Record<CoachTrait, string> = {
    talent_evaluator:    'Talent Evaluator',
    contract_negotiator: 'Contract Negotiator',
    offensive_pioneer:   'Offensive Pioneer',
    quarterback_guru:    'QB Guru',
    run_game_specialist: 'Run Game Specialist',
    defensive_architect: 'Defensive Architect',
    pass_rush_specialist:'Pass Rush Specialist',
    turnover_machine:    'Turnover Machine',
    player_developer:    'Player Developer',
    youth_developer:     'Youth Developer',
    veteran_stabilizer:  'Veteran Stabilizer',
  };
  return labels[trait] ?? trait;
}

function traitDesc(trait: CoachTrait): string {
  const descs: Record<CoachTrait, string> = {
    talent_evaluator:    '+2 scouting budget each season',
    contract_negotiator: '5% discount on all FA signings',
    offensive_pioneer:   '+2.5% offensive play success',
    quarterback_guru:    '+1.5% QB play success',
    run_game_specialist: '+2.5% run play success',
    defensive_architect: '+2% defensive play success',
    pass_rush_specialist:'+2.5% pass rush success',
    turnover_machine:    '+2% turnover chance',
    player_developer:    '+10% improve / -5% decline chance',
    youth_developer:     '+15% improve for players ≤3 years pro',
    veteran_stabilizer:  '-8% decline chance for players 30+',
  };
  return descs[trait] ?? '';
}

function personalityLabel(p: CoachPersonality | undefined): string {
  if (!p || p === 'balanced') return 'Balanced';
  return p === 'conservative' ? 'Conservative' : 'Aggressive';
}

function CoachCard({
  coach, role, isOffseason, onFire, onHire, onPromote, unemployed,
}: {
  coach: Coach | null;
  role: 'HC' | 'OC' | 'DC';
  isOffseason: boolean;
  onFire?: () => void;
  onHire?: (coachId: string) => void;
  onPromote?: () => void;
  unemployed: Coach[];
}) {
  const [showPool, setShowPool] = useState(false);
  const roleLabel = role === 'HC' ? 'Head Coach' : role === 'OC' ? 'Offensive Coord.' : 'Defensive Coord.';

  if (!coach) {
    // Vacancy
    const candidates = unemployed.filter(c => c.role === role || role !== 'HC');
    return (
      <div className="coach-card coach-card--vacant">
        <div className="coach-card-header">
          <span className="coach-role-label">{roleLabel}</span>
          <span className="coach-vacant-badge">VACANT</span>
        </div>
        {isOffseason && (
          <div className="coach-card-actions">
            {role !== 'HC' && (
              <button className="btn-sm" onClick={onPromote}>Promote From Within</button>
            )}
            <button className="btn-sm btn-primary" onClick={() => setShowPool(v => !v)}>
              {showPool ? 'Hide Pool' : 'Hire from Pool'}
            </button>
          </div>
        )}
        {showPool && (
          <div className="coach-pool-list">
            {candidates.length === 0
              ? <p className="muted">No candidates available.</p>
              : candidates.map(c => (
                  <div key={c.id} className="coach-pool-row">
                    <span>{c.name}</span>
                    <span className="ovr-cell">{c.overall}</span>
                    {c.trait && <span className="coach-trait-badge">{traitLabel(c.trait)}</span>}
                    <button className="btn-sm btn-primary" onClick={() => onHire?.(c.id)}>Hire</button>
                  </div>
                ))
            }
          </div>
        )}
      </div>
    );
  }

  const scheme = role === 'OC' ? coach.offensiveScheme : role === 'DC' ? coach.defensiveScheme : undefined;
  return (
    <div className="coach-card">
      <div className="coach-card-header">
        <span className="coach-role-label">{roleLabel}</span>
        <span className="coach-name">{coach.name}</span>
        <span className="ovr-cell">{coach.overall}</span>
      </div>
      <div className="coach-card-details">
        {scheme && <span className="coach-scheme">{scheme.replace(/_/g, ' ')}</span>}
        {coach.personality && coach.personality !== 'balanced' && (
          <span className={`coach-personality coach-personality--${coach.personality}`}>
            {personalityLabel(coach.personality)}
          </span>
        )}
        {coach.trait && (
          <span className="coach-trait-badge" title={traitDesc(coach.trait)}>
            {traitLabel(coach.trait)}
          </span>
        )}
      </div>
      {isOffseason && role !== 'HC' && (
        <div className="coach-card-actions">
          <button className="btn-sm btn-danger" onClick={onFire}>Fire</button>
        </div>
      )}
    </div>
  );
}

// ── Coaching View ──────────────────────────────────────────────────────────────

function CoachingView({ team, league, leagueId, onLeagueUpdated }: {
  team: League['teams'][0];
  league: League;
  leagueId: string;
  onLeagueUpdated: (l: League) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isOffseason = league.phase === 'offseason';

  const { hc, oc, dc } = team.coaches;
  const ocScheme = oc?.offensiveScheme ?? 'balanced';
  const dcScheme = dc?.defensiveScheme ?? 'balanced';
  const hcOffMatch = hc.offensiveScheme === ocScheme;
  const hcDefMatch = hc.defensiveScheme === dcScheme;

  async function handleFire(role: 'OC' | 'DC') {
    setBusy(true); setError(null);
    try {
      const updated = await fireCoachApi(leagueId, role);
      onLeagueUpdated(updated);
    } catch (e) { setError(friendlyError(e)); }
    finally { setBusy(false); }
  }

  async function handleHire(coachId: string, role: 'HC' | 'OC' | 'DC') {
    setBusy(true); setError(null);
    try {
      const updated = await hireCoachApi(leagueId, coachId, role);
      onLeagueUpdated(updated);
    } catch (e) { setError(friendlyError(e)); }
    finally { setBusy(false); }
  }

  async function handlePromote(role: 'OC' | 'DC') {
    setBusy(true); setError(null);
    try {
      const updated = await promoteWithinApi(leagueId, role);
      onLeagueUpdated(updated);
    } catch (e) { setError(friendlyError(e)); }
    finally { setBusy(false); }
  }

  const unemployed = league.unemployedCoaches ?? [];

  return (
    <section className="gp-view">
      <h2>Coaching Staff — {team.name}</h2>
      {error && <p className="error-msg">{error}</p>}
      {busy && <p className="muted">Working…</p>}

      <div className="coaching-cards">
        <CoachCard
          coach={hc} role="HC" isOffseason={isOffseason}
          onHire={id => handleHire(id, 'HC')}
          onPromote={undefined}
          unemployed={unemployed}
        />
        <CoachCard
          coach={oc} role="OC" isOffseason={isOffseason}
          onFire={() => handleFire('OC')}
          onHire={id => handleHire(id, 'OC')}
          onPromote={() => handlePromote('OC')}
          unemployed={unemployed}
        />
        <CoachCard
          coach={dc} role="DC" isOffseason={isOffseason}
          onFire={() => handleFire('DC')}
          onHire={id => handleHire(id, 'DC')}
          onPromote={() => handlePromote('DC')}
          unemployed={unemployed}
        />
      </div>

      <div className="coaching-alignment-summary">
        <h3>Scheme Alignment</h3>
        <p>
          <span className={`align-badge${hcOffMatch ? ' align-yes' : ' align-no'}`}>
            OFF {hcOffMatch ? '✓' : '✗'}
          </span>
          {' '}
          <span className={`align-badge${hcDefMatch ? ' align-yes' : ' align-no'}`}>
            DEF {hcDefMatch ? '✓' : '✗'}
          </span>
          <span className="muted"> — HC pref: {hc.offensiveScheme?.replace(/_/g, ' ') ?? '—'} / {hc.defensiveScheme?.replace(/_/g, ' ') ?? '—'}</span>
        </p>
        <p className="muted coaching-note">
          When the HC's scheme preferences match the OC or DC, your team earns a small bonus to success probability each play.
        </p>
      </div>

      {isOffseason && unemployed.length > 0 && (
        <div className="coaching-pool-section">
          <h3>Available Coaches ({unemployed.length})</h3>
          <table className="coaching-pool-table">
            <thead>
              <tr><th>Name</th><th>Role</th><th>OVR</th><th>Scheme</th><th>Trait</th><th>Personality</th></tr>
            </thead>
            <tbody>
              {unemployed.map(c => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td className="muted">{c.role}</td>
                  <td className="ovr-cell">{c.overall}</td>
                  <td className="muted">{(c.offensiveScheme ?? c.defensiveScheme ?? '—').replace(/_/g, ' ')}</td>
                  <td>{c.trait ? <span className="coach-trait-badge">{traitLabel(c.trait)}</span> : <span className="muted">—</span>}</td>
                  <td className="muted">{personalityLabel(c.personality)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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

// ── Career / Records helpers ────────────────────────────────────────────────

interface CareerLeaderEntry {
  playerId: string; name: string; teamAbbr: string; seasons: number;
  passingYards: number; passingTDs: number; rushingYards: number; rushingTDs: number;
  receivingYards: number; receivingTDs: number; receptions: number;
  sacks: number; interceptionsCaught: number;
}

interface SeasonRecordEntry {
  playerId: string; name: string; teamAbbr: string; year: number; value: number;
}

function buildPlayerNameMap(
  teams: League['teams'],
  freeAgents: Player[],
  retiredPlayers: RetiredPlayerRecord[],
): Map<string, { name: string; teamAbbr: string }> {
  const map = new Map<string, { name: string; teamAbbr: string }>();
  for (const team of teams) {
    for (const p of team.roster) map.set(p.id, { name: p.name, teamAbbr: team.abbreviation });
  }
  for (const p of freeAgents) {
    if (!map.has(p.id)) map.set(p.id, { name: p.name, teamAbbr: 'FA' });
  }
  for (const rp of retiredPlayers) {
    if (!map.has(rp.playerId)) map.set(rp.playerId, { name: rp.name, teamAbbr: 'RET' });
  }
  return map;
}

function buildCareerLeaders(
  playerHistory: LeagueHistory['playerHistory'],
  nameMap: Map<string, { name: string; teamAbbr: string }>,
): CareerLeaderEntry[] {
  const out: CareerLeaderEntry[] = [];
  for (const [playerId, seasons] of Object.entries(playerHistory)) {
    const info = nameMap.get(playerId);
    if (!info) continue;
    const e: CareerLeaderEntry = {
      playerId, name: info.name, teamAbbr: info.teamAbbr, seasons: seasons.length,
      passingYards: 0, passingTDs: 0, rushingYards: 0, rushingTDs: 0,
      receivingYards: 0, receivingTDs: 0, receptions: 0, sacks: 0, interceptionsCaught: 0,
    };
    for (const s of seasons) {
      e.passingYards += s.passingYards; e.passingTDs += s.passingTDs;
      e.rushingYards += s.rushingYards; e.rushingTDs += s.rushingTDs;
      e.receivingYards += s.receivingYards; e.receivingTDs += s.receivingTDs;
      e.receptions += s.receptions; e.sacks += s.sacks;
      e.interceptionsCaught += s.interceptionsCaught;
    }
    out.push(e);
  }
  return out;
}

const RECORD_CATS = [
  { key: 'passingYards'        as const, label: 'Passing Yards'   },
  { key: 'passingTDs'          as const, label: 'Passing TDs'     },
  { key: 'rushingYards'        as const, label: 'Rushing Yards'   },
  { key: 'rushingTDs'          as const, label: 'Rushing TDs'     },
  { key: 'receivingYards'      as const, label: 'Receiving Yards' },
  { key: 'receivingTDs'        as const, label: 'Receiving TDs'   },
  { key: 'receptions'          as const, label: 'Receptions'      },
  { key: 'sacks'               as const, label: 'Sacks'           },
  { key: 'interceptionsCaught' as const, label: 'Interceptions'   },
];

type RecordCatKey = typeof RECORD_CATS[number]['key'];

function buildSeasonRecords(
  playerHistory: LeagueHistory['playerHistory'],
  nameMap: Map<string, { name: string; teamAbbr: string }>,
): Record<RecordCatKey, SeasonRecordEntry[]> {
  const buckets = Object.fromEntries(RECORD_CATS.map(c => [c.key, [] as SeasonRecordEntry[]])) as Record<RecordCatKey, SeasonRecordEntry[]>;
  for (const [playerId, seasons] of Object.entries(playerHistory)) {
    const info = nameMap.get(playerId);
    if (!info) continue;
    for (const s of seasons) {
      for (const cat of RECORD_CATS) {
        const val = s[cat.key] as number;
        if (val > 0) buckets[cat.key].push({ playerId, name: info.name, teamAbbr: info.teamAbbr, year: s.year, value: val });
      }
    }
  }
  for (const cat of RECORD_CATS) {
    buckets[cat.key] = buckets[cat.key].sort((a, b) => b.value - a.value).slice(0, 5);
  }
  return buckets;
}

// ── Leaders ────────────────────────────────────────────────────────────────────

function LeadersView({ games, teams, history, freeAgents, currentSeasonStats, onViewPlayer }: {
  games: League['currentSeason']['games'];
  teams: League['teams'];
  history: LeagueHistory;
  freeAgents: Player[];
  currentSeasonStats: Record<string, PlayerSeasonStats>;
  onViewPlayer?: (id: string) => void;
}) {
  const [mode, setMode] = useState<'season' | 'career' | 'records'>('season');
  const stats        = aggregateSeasonStats(games);
  const allPlayers   = Object.values(stats);
  const gamesPlayed  = games.filter(g => g.status === 'final').length;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedPlayer = selectedId !== null ? (stats[selectedId] ?? null) : null;

  const nameMap = useMemo(
    () => buildPlayerNameMap(teams, freeAgents, history.retiredPlayers),
    [teams, freeAgents, history.retiredPlayers],
  );
  const careerLeaders = useMemo(
    () => buildCareerLeaders(history.playerHistory, nameMap),
    [history.playerHistory, nameMap],
  );
  const seasonRecords = useMemo(
    () => buildSeasonRecords(history.playerHistory, nameMap),
    [history.playerHistory, nameMap],
  );

  const hasCareerData = Object.keys(history.playerHistory).length > 0;

  // Offensive season leaders (from client-aggregated game events)
  const passers   = allPlayers.filter(p => p.attempts >= 1).sort((a, b) => b.passingYards - a.passingYards).slice(0, 10);
  const rushers   = allPlayers.filter(p => p.carries  >= 1).sort((a, b) => b.rushingYards - a.rushingYards).slice(0, 10);
  const receivers = allPlayers.filter(p => p.targets  >= 1).sort((a, b) => b.receivingYards - a.receivingYards).slice(0, 10);
  const tdLeaders = allPlayers
    .map(p => ({ ...p, totalTDs: p.passingTDs + p.rushingTDs + p.receivingTDs }))
    .filter(p => p.totalTDs > 0).sort((a, b) => b.totalTDs - a.totalTDs).slice(0, 10);

  // Defensive season leaders (from backend-computed stats which has sacks/INTs)
  const cssEntries = Object.entries(currentSeasonStats);
  const sackLeaders = cssEntries
    .filter(([, p]) => p.sacks > 0)
    .sort(([, a], [, b]) => b.sacks - a.sacks).slice(0, 10)
    .map(([id, p]) => ({ id, abbr: p.teamAbbreviation, val: p.sacks, name: nameMap.get(id)?.name ?? '?' }));
  const intLeaders = cssEntries
    .filter(([, p]) => p.interceptionsCaught > 0)
    .sort(([, a], [, b]) => b.interceptionsCaught - a.interceptionsCaught).slice(0, 10)
    .map(([id, p]) => ({ id, abbr: p.teamAbbreviation, val: p.interceptionsCaught, name: nameMap.get(id)?.name ?? '?' }));

  function handleClick(id: string) {
    if (onViewPlayer) onViewPlayer(id);
    else setSelectedId(id);
  }
  function pBtn(id: string, name: string) {
    return <button className="pd-trigger" onClick={() => handleClick(id)}>{name}</button>;
  }

  return (
    <section className="leaders-section">
      {selectedPlayer && !onViewPlayer && (
        <PlayerDetail player={selectedPlayer} games={games} allTeams={teams} history={history} onClose={() => setSelectedId(null)} />
      )}
      <div className="leaders-page-header">
        <h2>League Leaders</h2>
        {gamesPlayed > 0 && <span className="leaders-meta">{gamesPlayed} game{gamesPlayed !== 1 ? 's' : ''} played</span>}
      </div>

      <div className="leaders-mode-tabs">
        <button className={mode === 'season'  ? 'active' : ''} onClick={() => setMode('season')}>Season</button>
        <button className={mode === 'career'  ? 'active' : ''} onClick={() => setMode('career')}  disabled={!hasCareerData}>Career</button>
        <button className={mode === 'records' ? 'active' : ''} onClick={() => setMode('records')} disabled={!hasCareerData}>Records</button>
      </div>

      {mode === 'season' && (
        gamesPlayed === 0
          ? <p className="muted" style={{ padding: '1rem 0' }}>No games have been played yet.</p>
          : <div className="leaders-grid">

            {/* Passing */}
            <div className="leaders-card">
              <div className="lc-header"><span className="lc-category">PASSING</span><span className="lc-stat-label">YDS</span></div>
              <table className="leaders-table">
                <thead><tr>
                  <th className="col-rank"></th><th className="col-player">Player</th><th className="col-team">Team</th>
                  <th className="col-num">C/ATT</th><th className="col-num col-primary">YDS</th><th className="col-num">TD</th><th className="col-num">INT</th>
                </tr></thead>
                <tbody>
                  {passers.length === 0
                    ? <tr><td colSpan={7} className="lc-empty">No data</td></tr>
                    : passers.map((p, i) => (
                      <tr key={p.playerId} className={i === 0 ? 'lc-top' : ''}>
                        <td className="col-rank">{i + 1}</td>
                        <td className="col-player">{pBtn(p.playerId, p.name)}</td>
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
              <div className="lc-header"><span className="lc-category">RUSHING</span><span className="lc-stat-label">YDS</span></div>
              <table className="leaders-table">
                <thead><tr>
                  <th className="col-rank"></th><th className="col-player">Player</th><th className="col-team">Team</th>
                  <th className="col-num">CAR</th><th className="col-num col-primary">YDS</th><th className="col-num">AVG</th><th className="col-num">TD</th>
                </tr></thead>
                <tbody>
                  {rushers.length === 0
                    ? <tr><td colSpan={7} className="lc-empty">No data</td></tr>
                    : rushers.map((p, i) => (
                      <tr key={p.playerId} className={i === 0 ? 'lc-top' : ''}>
                        <td className="col-rank">{i + 1}</td>
                        <td className="col-player">{pBtn(p.playerId, p.name)}</td>
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
              <div className="lc-header"><span className="lc-category">RECEIVING</span><span className="lc-stat-label">YDS</span></div>
              <table className="leaders-table">
                <thead><tr>
                  <th className="col-rank"></th><th className="col-player">Player</th><th className="col-team">Team</th>
                  <th className="col-num">REC</th><th className="col-num col-primary">YDS</th><th className="col-num">AVG</th><th className="col-num">TD</th>
                </tr></thead>
                <tbody>
                  {receivers.length === 0
                    ? <tr><td colSpan={7} className="lc-empty">No data</td></tr>
                    : receivers.map((p, i) => (
                      <tr key={p.playerId} className={i === 0 ? 'lc-top' : ''}>
                        <td className="col-rank">{i + 1}</td>
                        <td className="col-player">{pBtn(p.playerId, p.name)}</td>
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
              <div className="lc-header"><span className="lc-category">TOUCHDOWNS</span><span className="lc-stat-label">TD</span></div>
              <table className="leaders-table">
                <thead><tr>
                  <th className="col-rank"></th><th className="col-player">Player</th><th className="col-team">Team</th>
                  <th className="col-num">PASS</th><th className="col-num">RUSH</th><th className="col-num">REC</th><th className="col-num col-primary">TOT</th>
                </tr></thead>
                <tbody>
                  {tdLeaders.length === 0
                    ? <tr><td colSpan={7} className="lc-empty">No touchdowns yet</td></tr>
                    : tdLeaders.map((p, i) => (
                      <tr key={p.playerId} className={i === 0 ? 'lc-top' : ''}>
                        <td className="col-rank">{i + 1}</td>
                        <td className="col-player">{pBtn(p.playerId, p.name)}</td>
                        <td className="col-team">{p.teamAbbreviation}</td>
                        <td className="col-num">{p.passingTDs   || '—'}</td>
                        <td className="col-num">{p.rushingTDs   || '—'}</td>
                        <td className="col-num">{p.receivingTDs || '—'}</td>
                        <td className="col-num col-primary">{p.totalTDs}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {/* Sacks */}
            {sackLeaders.length > 0 && (
              <div className="leaders-card">
                <div className="lc-header"><span className="lc-category">SACKS</span><span className="lc-stat-label">SCK</span></div>
                <table className="leaders-table">
                  <thead><tr>
                    <th className="col-rank"></th><th className="col-player">Player</th><th className="col-team">Team</th>
                    <th className="col-num col-primary">SACKS</th>
                  </tr></thead>
                  <tbody>
                    {sackLeaders.map((p, i) => (
                      <tr key={p.id} className={i === 0 ? 'lc-top' : ''}>
                        <td className="col-rank">{i + 1}</td>
                        <td className="col-player">{pBtn(p.id, p.name)}</td>
                        <td className="col-team">{p.abbr}</td>
                        <td className="col-num col-primary">{p.val.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Interceptions */}
            {intLeaders.length > 0 && (
              <div className="leaders-card">
                <div className="lc-header"><span className="lc-category">INTERCEPTIONS</span><span className="lc-stat-label">INT</span></div>
                <table className="leaders-table">
                  <thead><tr>
                    <th className="col-rank"></th><th className="col-player">Player</th><th className="col-team">Team</th>
                    <th className="col-num col-primary">INT</th>
                  </tr></thead>
                  <tbody>
                    {intLeaders.map((p, i) => (
                      <tr key={p.id} className={i === 0 ? 'lc-top' : ''}>
                        <td className="col-rank">{i + 1}</td>
                        <td className="col-player">{pBtn(p.id, p.name)}</td>
                        <td className="col-team">{p.abbr}</td>
                        <td className="col-num col-primary">{p.val}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

          </div>
      )}

      {mode === 'career' && (
        hasCareerData
          ? <CareerLeadersGrid leaders={careerLeaders} onViewPlayer={handleClick} />
          : <p className="muted" style={{ padding: '1rem 0' }}>No historical data yet — complete a season first.</p>
      )}

      {mode === 'records' && (
        hasCareerData
          ? <SingleSeasonRecordsView records={seasonRecords} onViewPlayer={handleClick} />
          : <p className="muted" style={{ padding: '1rem 0' }}>No records yet — complete a season first.</p>
      )}

    </section>
  );
}

function CareerLeadersGrid({ leaders, onViewPlayer }: {
  leaders: CareerLeaderEntry[];
  onViewPlayer: (id: string) => void;
}) {
  const passers   = [...leaders].filter(l => l.passingYards > 0).sort((a, b) => b.passingYards - a.passingYards).slice(0, 10);
  const rushers   = [...leaders].filter(l => l.rushingYards > 0).sort((a, b) => b.rushingYards - a.rushingYards).slice(0, 10);
  const receivers = [...leaders].filter(l => l.receivingYards > 0).sort((a, b) => b.receivingYards - a.receivingYards).slice(0, 10);
  const sackers   = [...leaders].filter(l => l.sacks > 0).sort((a, b) => b.sacks - a.sacks).slice(0, 10);
  const inters    = [...leaders].filter(l => l.interceptionsCaught > 0).sort((a, b) => b.interceptionsCaught - a.interceptionsCaught).slice(0, 10);

  function pBtn(l: CareerLeaderEntry) {
    return <button className="pd-trigger" onClick={() => onViewPlayer(l.playerId)}>{l.name}</button>;
  }

  if (leaders.length === 0) return <p className="muted" style={{ padding: '1rem 0' }}>No career data yet.</p>;

  return (
    <div className="leaders-grid">
      {passers.length > 0 && (
        <div className="leaders-card">
          <div className="lc-header"><span className="lc-category">PASSING — CAREER</span><span className="lc-stat-label">YDS</span></div>
          <table className="leaders-table">
            <thead><tr>
              <th className="col-rank"></th><th className="col-player">Player</th><th className="col-team">Team</th>
              <th className="col-num">YRS</th><th className="col-num col-primary">YDS</th><th className="col-num">TD</th>
            </tr></thead>
            <tbody>
              {passers.map((l, i) => (
                <tr key={l.playerId} className={i === 0 ? 'lc-top' : ''}>
                  <td className="col-rank">{i + 1}</td><td className="col-player">{pBtn(l)}</td>
                  <td className="col-team">{l.teamAbbr}</td><td className="col-num">{l.seasons}</td>
                  <td className="col-num col-primary">{l.passingYards}</td><td className="col-num">{l.passingTDs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rushers.length > 0 && (
        <div className="leaders-card">
          <div className="lc-header"><span className="lc-category">RUSHING — CAREER</span><span className="lc-stat-label">YDS</span></div>
          <table className="leaders-table">
            <thead><tr>
              <th className="col-rank"></th><th className="col-player">Player</th><th className="col-team">Team</th>
              <th className="col-num">YRS</th><th className="col-num col-primary">YDS</th><th className="col-num">TD</th>
            </tr></thead>
            <tbody>
              {rushers.map((l, i) => (
                <tr key={l.playerId} className={i === 0 ? 'lc-top' : ''}>
                  <td className="col-rank">{i + 1}</td><td className="col-player">{pBtn(l)}</td>
                  <td className="col-team">{l.teamAbbr}</td><td className="col-num">{l.seasons}</td>
                  <td className="col-num col-primary">{l.rushingYards}</td><td className="col-num">{l.rushingTDs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {receivers.length > 0 && (
        <div className="leaders-card">
          <div className="lc-header"><span className="lc-category">RECEIVING — CAREER</span><span className="lc-stat-label">YDS</span></div>
          <table className="leaders-table">
            <thead><tr>
              <th className="col-rank"></th><th className="col-player">Player</th><th className="col-team">Team</th>
              <th className="col-num">YRS</th><th className="col-num">REC</th><th className="col-num col-primary">YDS</th><th className="col-num">TD</th>
            </tr></thead>
            <tbody>
              {receivers.map((l, i) => (
                <tr key={l.playerId} className={i === 0 ? 'lc-top' : ''}>
                  <td className="col-rank">{i + 1}</td><td className="col-player">{pBtn(l)}</td>
                  <td className="col-team">{l.teamAbbr}</td><td className="col-num">{l.seasons}</td>
                  <td className="col-num">{l.receptions}</td>
                  <td className="col-num col-primary">{l.receivingYards}</td><td className="col-num">{l.receivingTDs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {sackers.length > 0 && (
        <div className="leaders-card">
          <div className="lc-header"><span className="lc-category">SACKS — CAREER</span><span className="lc-stat-label">SCK</span></div>
          <table className="leaders-table">
            <thead><tr>
              <th className="col-rank"></th><th className="col-player">Player</th><th className="col-team">Team</th>
              <th className="col-num">YRS</th><th className="col-num col-primary">SACKS</th>
            </tr></thead>
            <tbody>
              {sackers.map((l, i) => (
                <tr key={l.playerId} className={i === 0 ? 'lc-top' : ''}>
                  <td className="col-rank">{i + 1}</td><td className="col-player">{pBtn(l)}</td>
                  <td className="col-team">{l.teamAbbr}</td><td className="col-num">{l.seasons}</td>
                  <td className="col-num col-primary">{l.sacks.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {inters.length > 0 && (
        <div className="leaders-card">
          <div className="lc-header"><span className="lc-category">INTERCEPTIONS — CAREER</span><span className="lc-stat-label">INT</span></div>
          <table className="leaders-table">
            <thead><tr>
              <th className="col-rank"></th><th className="col-player">Player</th><th className="col-team">Team</th>
              <th className="col-num">YRS</th><th className="col-num col-primary">INT</th>
            </tr></thead>
            <tbody>
              {inters.map((l, i) => (
                <tr key={l.playerId} className={i === 0 ? 'lc-top' : ''}>
                  <td className="col-rank">{i + 1}</td><td className="col-player">{pBtn(l)}</td>
                  <td className="col-team">{l.teamAbbr}</td><td className="col-num">{l.seasons}</td>
                  <td className="col-num col-primary">{l.interceptionsCaught}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SingleSeasonRecordsView({ records, onViewPlayer }: {
  records: Record<RecordCatKey, SeasonRecordEntry[]>;
  onViewPlayer: (id: string) => void;
}) {
  const fmtVal = (key: RecordCatKey, v: number) => key === 'sacks' ? v.toFixed(1) : String(v);
  return (
    <div className="records-grid">
      {RECORD_CATS.map(cat => {
        const entries = records[cat.key] ?? [];
        if (entries.length === 0) return null;
        return (
          <div key={cat.key} className="leaders-card">
            <div className="lc-header">
              <span className="lc-category">{cat.label.toUpperCase()} — SEASON BEST</span>
            </div>
            <table className="leaders-table">
              <thead><tr>
                <th className="col-rank"></th><th className="col-player">Player</th><th className="col-team">Team</th>
                <th className="col-num">Year</th><th className="col-num col-primary">Value</th>
              </tr></thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={i} className={i === 0 ? 'lc-top' : ''}>
                    <td className="col-rank">{i + 1}</td>
                    <td className="col-player">
                      <button className="pd-trigger" onClick={() => onViewPlayer(e.playerId)}>{e.name}</button>
                    </td>
                    <td className="col-team">{e.teamAbbr}</td>
                    <td className="col-num">{e.year}</td>
                    <td className="col-num col-primary">{fmtVal(cat.key, e.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
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

function PlayerDetail({ player, games, allTeams, history, onClose }: {
  player: import('./seasonStats').SeasonPlayerStats;
  games: Game[];
  allTeams: League['teams'];
  history?: LeagueHistory;
  onClose: () => void;
}) {
  const [pdTab, setPdTab] = useState<'season' | 'career'>('season');
  const rosterPlayer  = allTeams.flatMap(t => t.roster).find(p => p.id === player.playerId);
  const gameLog       = buildGameLog(player, games);
  const seasonHistory = history?.playerHistory[player.playerId] ?? [];
  const playerAwards  = history?.seasonAwards.flatMap(sa => sa.awards.filter(a => a.playerId === player.playerId)) ?? [];
  const visibleRatings = rosterPlayer?.scoutedRatings ? getVisibleRatings(rosterPlayer.scoutedRatings) : null;
  const devBadge = rosterPlayer?.devTrait && rosterPlayer.devTrait !== 'normal' ? DEV_TRAIT_BADGE[rosterPlayer.devTrait] : null;

  // Legacy / HoF
  const hofEntry    = history?.hallOfFame?.find(e => e.playerId === player.playerId);
  const position    = rosterPlayer?.position ?? '';
  const legacyScore = history && position ? computeClientLegacyScore(player.playerId, position, history) : 0;
  const legacyTier  = computeClientLegacyTier(legacyScore);
  const showLegacy  = seasonHistory.length > 0 && legacyScore > 0;

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
                {rosterPlayer.yearsPro !== undefined && (
                  <span className="pd-badge">{rosterPlayer.yearsPro === 0 ? 'Rookie' : `Yr ${rosterPlayer.yearsPro}`}</span>
                )}
                {devBadge && (
                  <span className={`pd-badge dev-trait-badge dev-trait-${rosterPlayer.devTrait}`} title={devBadge.label}>{devBadge.short}</span>
                )}
              </>
            )}
            {hofEntry && (
              <span className="pd-badge hof-badge" title={`Hall of Fame — Inducted ${hofEntry.inductionYear}`}>★ HoF {hofEntry.inductionYear}</span>
            )}
            {(() => {
              const rohEntries = Object.entries(history?.ringOfHonor ?? {})
                .flatMap(([tid, entries]) => entries.filter(e => e.playerId === player.playerId).map(e => ({ ...e, teamId: tid })));
              if (rohEntries.length === 0) return null;
              return rohEntries.map(e => {
                const teamName = allTeams.find(t => t.id === e.teamId)?.name ?? e.teamId;
                return (
                  <span key={e.teamId} className={`pd-badge roh-badge${e.jerseyRetired ? ' roh-jersey-badge' : ''}`}
                    title={`${teamName} Ring of Honor — ${e.inductedYear}`}>
                    {e.jerseyRetired ? '◈' : '◇'} {teamName.split(' ').pop()} RoH
                  </span>
                );
              });
            })()}
          </div>
          <button className="pd-close" onClick={onClose}>✕</button>
        </div>

        {/* Legacy meter */}
        {showLegacy && (
          <div className="pd-legacy">
            <LegacyMeter score={legacyScore} tier={legacyTier} />
          </div>
        )}

        {/* Ratings breakdown */}
        {visibleRatings && (
          <div className="pd-ratings-row">
            {Object.entries(visibleRatings).map(([label, val]) => (
              <div key={label} className="pd-rating-item">
                <span className="pd-rating-val" style={{ color: val >= 80 ? '#4ade80' : val >= 65 ? '#fbbf24' : '#f87171' }}>{val}</span>
                <span className="pd-rating-lbl">{label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Tab selector */}
        {seasonHistory.length > 0 && (
          <div className="pd-tabs">
            <button className={pdTab === 'season' ? 'active' : ''} onClick={() => setPdTab('season')}>This Season</button>
            <button className={pdTab === 'career' ? 'active' : ''} onClick={() => setPdTab('career')}>Career</button>
          </div>
        )}

        {pdTab === 'career' && seasonHistory.length > 0 ? (
          <PlayerCareerView seasons={seasonHistory} awards={playerAwards} />
        ) : (
          <>

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
          </>
        )}

      </div>
    </div>
  );
}

// ── Player career view ─────────────────────────────────────────────────────────

function PlayerCareerView({ seasons, awards }: {
  seasons: PlayerSeasonHistoryLine[];
  awards?: AwardRecord[];
}) {

  // Career totals
  let totPYds = 0, totPTD = 0, totInt = 0, totRYds = 0, totRTD = 0, totRec = 0, totRecYds = 0, totRecTD = 0, totSacks = 0, totIntC = 0, totGP = 0;
  for (const s of seasons) {
    totPYds += s.passingYards; totPTD += s.passingTDs; totInt += s.interceptions;
    totRYds += s.rushingYards; totRTD += s.rushingTDs; totRec += s.receptions;
    totRecYds += s.receivingYards; totRecTD += s.receivingTDs;
    totSacks += s.sacks; totIntC += s.interceptionsCaught; totGP += s.gamesPlayed;
  }

  return (
    <>
      <div className="pd-section-label">Career Totals ({seasons.length} season{seasons.length !== 1 ? 's' : ''}, {totGP} GP)</div>
      <div className="pd-stats-row">
        {totPYds > 0 && <>
          <div className="pd-stat"><span className="pd-stat-val">{totPYds}</span><span className="pd-stat-lbl">Pass Yds</span></div>
          <div className="pd-stat"><span className="pd-stat-val">{totPTD}</span><span className="pd-stat-lbl">Pass TD</span></div>
          <div className="pd-stat"><span className="pd-stat-val">{totInt}</span><span className="pd-stat-lbl">INT</span></div>
        </>}
        {totRYds > 0 && <>
          <div className="pd-stat"><span className="pd-stat-val">{totRYds}</span><span className="pd-stat-lbl">Rush Yds</span></div>
          <div className="pd-stat"><span className="pd-stat-val">{totRTD}</span><span className="pd-stat-lbl">Rush TD</span></div>
        </>}
        {totRecYds > 0 && <>
          <div className="pd-stat"><span className="pd-stat-val">{totRec}</span><span className="pd-stat-lbl">Rec</span></div>
          <div className="pd-stat"><span className="pd-stat-val">{totRecYds}</span><span className="pd-stat-lbl">Rec Yds</span></div>
          <div className="pd-stat"><span className="pd-stat-val">{totRecTD}</span><span className="pd-stat-lbl">Rec TD</span></div>
        </>}
        {totSacks > 0 && <div className="pd-stat"><span className="pd-stat-val">{totSacks.toFixed(1)}</span><span className="pd-stat-lbl">Sacks</span></div>}
        {totIntC  > 0 && <div className="pd-stat"><span className="pd-stat-val">{totIntC}</span><span className="pd-stat-lbl">INT</span></div>}
      </div>

      <div className="pd-section-label">Season by Season</div>
      <div className="pd-table-wrap">
        <table className="pd-table career-table">
          <thead>
            <tr>
              <th>Year</th><th>Team</th><th>GP</th>
              {totPYds > 0 && <><th className="col-num">P.YDS</th><th className="col-num">TD</th><th className="col-num">INT</th></>}
              {totRYds > 0 && <><th className="col-num">R.YDS</th><th className="col-num">TD</th></>}
              {totRecYds > 0 && <><th className="col-num">REC</th><th className="col-num">R.YDS</th><th className="col-num">TD</th></>}
              {totSacks > 0 && <th className="col-num">SACKS</th>}
              {totIntC  > 0 && <th className="col-num">INT</th>}
            </tr>
          </thead>
          <tbody>
            {[...seasons].reverse().map((s, i) => (
              <tr key={i}>
                <td>{s.year}</td>
                <td className="muted">{s.teamAbbreviation}</td>
                <td className="col-num">{s.gamesPlayed}</td>
                {totPYds > 0 && <><td className="col-num col-primary">{s.passingYards}</td><td className="col-num">{s.passingTDs}</td><td className="col-num">{s.interceptions}</td></>}
                {totRYds > 0 && <><td className="col-num col-primary">{s.rushingYards}</td><td className="col-num">{s.rushingTDs}</td></>}
                {totRecYds > 0 && <><td className="col-num">{s.receptions}</td><td className="col-num col-primary">{s.receivingYards}</td><td className="col-num">{s.receivingTDs}</td></>}
                {totSacks > 0 && <td className="col-num">{s.sacks.toFixed(1)}</td>}
                {totIntC  > 0 && <td className="col-num">{s.interceptionsCaught}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {awards && awards.length > 0 && (
        <>
          <div className="pd-section-label">Awards & Honors</div>
          <div className="pd-awards-list">
            {awards.map((a, i) => (
              <div key={i} className="pd-award-item">
                <span className="pd-award-year">{a.year}</span>
                <span className="pd-award-name">{AWARD_LABELS[a.type] ?? a.type}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

// ── Award labels / helpers ─────────────────────────────────────────────────────

const AWARD_LABELS: Record<string, string> = {
  MVP:             'Most Valuable Player',
  OPOY:            'Offensive Player of the Year',
  DPOY:            'Defensive Player of the Year',
  OROY:            'Offensive Rookie of the Year',
  DROY:            'Defensive Rookie of the Year',
  Coach_of_Year:   'Coach of the Year',
  Comeback_Player: 'Comeback Player of the Year',
  AllPro1:         '1st Team All-Pro',
  AllPro2:         '2nd Team All-Pro',
  Champion:        'League Champion',
};

function formatPlayoffRound(madePlayoffs: boolean, round?: string): string {
  if (!madePlayoffs) return '—';
  const labels: Record<string, string> = {
    wildcard:     'Wild Card',
    divisional:   'Divisional',
    conference:   'Conf. Champ',
    championship: 'Runner-Up',
    champion:     'Champion',
  };
  return labels[round ?? ''] ?? (madePlayoffs ? 'Playoffs' : '—');
}

// ── Awards view ────────────────────────────────────────────────────────────────

function AwardsView({ history, myTeamId, onViewPlayer }: {
  history: LeagueHistory;
  myTeamId: string;
  onViewPlayer?: (id: string) => void;
}) {
  const pastSeasons = [...history.seasonAwards].reverse();
  const [selectedYear, setSelectedYear] = useState<number | null>(pastSeasons[0]?.year ?? null);
  const seasonAwards = pastSeasons.find(sa => sa.year === selectedYear);

  if (pastSeasons.length === 0) {
    return (
      <section>
        <h2>Awards</h2>
        <p className="muted" style={{ padding: '1rem 0' }}>No awards yet — complete a season to see awards here.</p>
      </section>
    );
  }

  const majorTypes  = ['MVP', 'OPOY', 'DPOY', 'Coach_of_Year', 'Comeback_Player'];
  const rookieTypes = ['OROY', 'DROY'];
  const major   = seasonAwards?.awards.filter(a => majorTypes.includes(a.type))   ?? [];
  const rookies = seasonAwards?.awards.filter(a => rookieTypes.includes(a.type))  ?? [];
  const allPro1 = seasonAwards?.awards.filter(a => a.type === 'AllPro1')           ?? [];
  const allPro2 = seasonAwards?.awards.filter(a => a.type === 'AllPro2')           ?? [];

  return (
    <section>
      <div className="awards-header">
        <h2>Season Awards</h2>
        <select className="awards-year-select" value={selectedYear ?? ''} onChange={e => setSelectedYear(Number(e.target.value))}>
          {pastSeasons.map(sa => (
            <option key={sa.year} value={sa.year}>{sa.year} Season</option>
          ))}
        </select>
      </div>

      {seasonAwards && (
        <div className="awards-body">
          {major.length > 0 && (
            <div className="awards-section">
              <div className="awards-section-title">Major Awards</div>
              <div className="awards-cards">
                {major.map(a => <AwardCard key={a.type} award={a} myTeamId={myTeamId} onViewPlayer={onViewPlayer} />)}
              </div>
            </div>
          )}

          {rookies.length > 0 && (
            <div className="awards-section">
              <div className="awards-section-title">Rookie Awards</div>
              <div className="awards-cards">
                {rookies.map(a => <AwardCard key={a.type} award={a} myTeamId={myTeamId} onViewPlayer={onViewPlayer} />)}
              </div>
            </div>
          )}

          {(allPro1.length > 0 || allPro2.length > 0) && (
            <div className="awards-section">
              <div className="awards-section-title">All-Pro Teams</div>
              <div className="allpro-grid">
                {allPro1.length > 0 && (
                  <div className="allpro-team">
                    <div className="allpro-team-label">1st Team All-Pro</div>
                    <table className="allpro-table">
                      <thead><tr><th>Pos</th><th>Player</th><th>Team</th></tr></thead>
                      <tbody>
                        {allPro1.map((a, i) => (
                          <tr key={i} className={a.teamId === myTeamId ? 'user-row' : ''}>
                            <td className="allpro-pos">{a.position ?? '—'}</td>
                            <td>{a.playerId && onViewPlayer
                              ? <button className="pd-trigger" onClick={() => onViewPlayer(a.playerId!)}>{a.playerName ?? '—'}</button>
                              : (a.playerName ?? '—')}</td>
                            <td className="muted">{a.teamName ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {allPro2.length > 0 && (
                  <div className="allpro-team">
                    <div className="allpro-team-label">2nd Team All-Pro</div>
                    <table className="allpro-table">
                      <thead><tr><th>Pos</th><th>Player</th><th>Team</th></tr></thead>
                      <tbody>
                        {allPro2.map((a, i) => (
                          <tr key={i} className={a.teamId === myTeamId ? 'user-row' : ''}>
                            <td className="allpro-pos">{a.position ?? '—'}</td>
                            <td>{a.playerId && onViewPlayer
                              ? <button className="pd-trigger" onClick={() => onViewPlayer(a.playerId!)}>{a.playerName ?? '—'}</button>
                              : (a.playerName ?? '—')}</td>
                            <td className="muted">{a.teamName ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function AwardCard({ award: a, myTeamId, onViewPlayer }: { award: AwardRecord; myTeamId: string; onViewPlayer?: (id: string) => void }) {
  const isMyTeam = a.teamId === myTeamId;
  const winnerName = a.playerName ?? a.coachName ?? '—';
  return (
    <div className={`award-card${isMyTeam ? ' award-card-mine' : ''}`}>
      <div className="award-card-label">{AWARD_LABELS[a.type] ?? a.type}</div>
      <div className="award-card-winner">
        {a.playerId && onViewPlayer
          ? <button className="pd-trigger award-winner-btn" onClick={() => onViewPlayer(a.playerId!)}>{winnerName}</button>
          : winnerName}
      </div>
      {a.teamName && <div className="award-card-team">{a.teamName}</div>}
      {a.position && <div className="award-card-pos muted">{a.position}</div>}
    </div>
  );
}

// ── History view ───────────────────────────────────────────────────────────────

function HistoryView({ history, teams, myTeamId }: {
  history: LeagueHistory;
  teams: League['teams'];
  myTeamId: string;
}) {
  const [selectedTeamId, setSelectedTeamId] = useState(myTeamId);
  const teamHistory    = history.teamHistory[selectedTeamId] ?? [];
  const championsList  = Object.entries(history.championsByYear)
    .sort(([a], [b]) => Number(b) - Number(a));

  return (
    <section>
      <h2>League History</h2>

      {championsList.length > 0 && (
        <div className="history-section">
          <div className="history-section-title">League Champions</div>
          <table className="history-table">
            <thead><tr><th>Year</th><th>Champion</th></tr></thead>
            <tbody>
              {championsList.map(([year, champ]) => (
                <tr key={year} className={champ.teamId === myTeamId ? 'user-row' : ''}>
                  <td>{year}</td>
                  <td>{champ.teamName}{champ.teamId === myTeamId && <span className="you"> YOU</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="history-section">
        <div className="history-section-header">
          <div className="history-section-title">Team Season History</div>
          <select value={selectedTeamId} onChange={e => setSelectedTeamId(e.target.value)}>
            {teams.map(t => (
              <option key={t.id} value={t.id}>{t.name}{t.id === myTeamId ? ' (You)' : ''}</option>
            ))}
          </select>
        </div>
        {teamHistory.length === 0 ? (
          <p className="muted" style={{ padding: '0.5rem 0' }}>No season history yet for this team.</p>
        ) : (
          <table className="history-table">
            <thead>
              <tr><th>Year</th><th>W</th><th>L</th><th>PF</th><th>PA</th><th>Diff</th><th>Playoffs</th></tr>
            </thead>
            <tbody>
              {[...teamHistory].reverse().map((s, i) => (
                <tr key={i}>
                  <td>{s.year}</td>
                  <td>{s.wins}</td><td>{s.losses}</td>
                  <td>{s.pointsFor}</td><td>{s.pointsAgainst}</td>
                  <td className={s.pointsFor - s.pointsAgainst >= 0 ? 'pos' : 'neg'}>
                    {s.pointsFor - s.pointsAgainst > 0 ? '+' : ''}{s.pointsFor - s.pointsAgainst}
                  </td>
                  <td className={s.championshipRound === 'champion' ? 'pos' : ''}>
                    {formatPlayoffRound(s.madePlayoffs, s.championshipRound)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {history.retiredPlayers.length > 0 && (
        <div className="history-section">
          <div className="history-section-title">Retired Players</div>
          <table className="history-table">
            <thead><tr><th>Name</th><th>Pos</th><th>Year</th><th>Age</th><th>Final OVR</th></tr></thead>
            <tbody>
              {[...history.retiredPlayers].reverse().slice(0, 25).map(p => (
                <tr key={p.playerId}>
                  <td>{p.name}</td>
                  <td className="muted">{p.position}</td>
                  <td>{p.retirementYear}</td>
                  <td>{p.finalAge}</td>
                  <td>{p.finalOverall}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
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

  // Latest news — prioritize my-team items, then show recent mix (up to 6)
  const allNews = league.news ?? [];
  const myTeamNews  = allNews.filter(n => n.teamIds.includes(myTeamId)).slice(0, 2);
  const otherNews   = allNews.filter(n => !n.teamIds.includes(myTeamId)).slice(0, 4);
  const latestNews  = [...myTeamNews, ...otherNews].slice(0, 6);

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
              <span className="dash-panel-title">League Feed</span>
              <button className="dash-panel-link" onClick={() => onNavTo('news')}>All →</button>
            </div>
            {latestNews.map(n => (
              <div key={n.id} className={`dash-news-row${n.teamIds.includes(myTeamId) ? ' dash-news-mine' : ''}`}>
                <div className="dash-news-top">
                  <span className={`news-badge ${NEWS_TYPE_CLASS[n.type] ?? ''}`}>{NEWS_TYPE_LABEL[n.type] ?? n.type}</span>
                  <span className="dash-news-headline">{n.headline}</span>
                </div>
                <div className="dash-news-body">{n.body}</div>
              </div>
            ))}
          </div>
        )}

        {(() => {
          const lastAwards = league.history.seasonAwards.length > 0
            ? league.history.seasonAwards[league.history.seasonAwards.length - 1]
            : null;
          const majorTypes = ['MVP', 'OPOY', 'DPOY', 'Coach_of_Year'];
          const majorAwards = lastAwards?.awards.filter(a => majorTypes.includes(a.type)) ?? [];
          if (!lastAwards || majorAwards.length === 0) return null;
          return (
            <div className="dash-panel">
              <div className="dash-panel-header">
                <span className="dash-panel-title">{lastAwards.year} Season Awards</span>
                <button className="dash-panel-link" onClick={() => onNavTo('awards')}>All →</button>
              </div>
              {majorAwards.map(a => (
                <div key={a.type} className="dash-award-row">
                  <span className="dash-award-label">{AWARD_LABELS[a.type] ?? a.type}</span>
                  <span className="dash-award-winner">{a.playerName ?? a.coachName ?? '—'}</span>
                  {a.teamName && <span className="dash-award-team muted">{a.teamName}</span>}
                </div>
              ))}
            </div>
          );
        })()}

        {(() => {
          const hof = league.history.hallOfFame ?? [];
          if (hof.length === 0) return null;
          const recent = hof.slice().sort((a, b) => b.inductionYear - a.inductionYear).slice(0, 4);
          return (
            <div className="dash-panel">
              <div className="dash-panel-header">
                <span className="dash-panel-title">Hall of Fame</span>
                <button className="dash-panel-link" onClick={() => onNavTo('hof')}>View All →</button>
              </div>
              {recent.map(e => (
                <div key={e.playerId} className="dash-hof-row">
                  <span className="dash-hof-name">★ {e.name}</span>
                  <span className="dash-hof-pos muted">{e.position}</span>
                  <span className="dash-hof-year muted">{e.inductionYear}</span>
                </div>
              ))}
            </div>
          );
        })()}

        {(() => {
          const rohAll = Object.values(league.history.ringOfHonor ?? {}).flat();
          if (rohAll.length === 0) return null;
          const recent = rohAll.slice().sort((a, b) => b.inductedYear - a.inductedYear).slice(0, 4);
          return (
            <div className="dash-panel">
              <div className="dash-panel-header">
                <span className="dash-panel-title">Ring of Honor</span>
                <button className="dash-panel-link" onClick={() => onNavTo('legacy')}>View All →</button>
              </div>
              {recent.map(e => (
                <div key={`${e.playerId}-roh`} className="dash-hof-row">
                  <span className="dash-hof-name">{e.jerseyRetired ? '◈ ' : '◇ '}{e.name}</span>
                  <span className="dash-hof-pos muted">{e.position}</span>
                  <span className="dash-hof-year muted">{e.inductedYear}</span>
                </div>
              ))}
            </div>
          );
        })()}

        {league.gmCareer && league.gmCareer.seasons.length > 0 && (() => {
          const gm = league.gmCareer;
          const champs = gm.seasons.filter(s => s.wonChampionship).length;
          const playoffs = gm.seasons.filter(s => s.madePlayoffs).length;
          const tier = gmLegacyTier(gm.legacyScore);
          return (
            <div className="dash-panel">
              <div className="dash-panel-header">
                <span className="dash-panel-title">GM Career</span>
                <button className="dash-panel-link" onClick={() => onNavTo('gm')}>View →</button>
              </div>
              <div className="dash-gm-row">
                <span className={`gm-tier-badge gm-tier-${tier.toLowerCase()}`}>{tier}</span>
                <span className="dash-gm-score">{gm.legacyScore} pts</span>
              </div>
              <div className="dash-gm-stats">
                <span>{gm.seasons.length} season{gm.seasons.length !== 1 ? 's' : ''}</span>
                <span>{playoffs}x playoffs</span>
                {champs > 0 && <span>🏆 {champs}x champ</span>}
              </div>
              {gm.achievements.length > 0 && (
                <div className="dash-gm-ach muted">{gm.achievements.length} achievement{gm.achievements.length !== 1 ? 's' : ''} earned</div>
              )}
            </div>
          );
        })()}

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
          {league.history.seasonAwards.length > 0 && (
            <button className="dash-link-btn" onClick={() => onNavTo('history')}>League History</button>
          )}
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
                <td>
                  <span className="stand-team-name">{s.team.name}</span>
                  {s.team.id === userTeamId && <span className="you">YOU</span>}
                  {s.team.frontOffice && s.team.id !== userTeamId && (
                    <FoPersonalityBadge personality={s.team.frontOffice} size="sm" />
                  )}
                </td>
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

const AWARD_SHORT_LABELS: Record<string, string> = {
  MVP:             'MVP',
  OPOY:            'Off. Player of the Year',
  DPOY:            'Def. Player of the Year',
  OROY:            'Off. Rookie of the Year',
  DROY:            'Def. Rookie of the Year',
  Coach_of_Year:   'Coach of the Year',
  Comeback_Player: 'Comeback Player',
};

function SeasonRecapView({ seasonHistory, history, teams, myTeamId, onViewPlayer }: {
  seasonHistory: SeasonRecord[];
  history: LeagueHistory;
  teams: League['teams'];
  myTeamId: string;
  onViewPlayer?: (id: string) => void;
}) {
  const years = [...seasonHistory].reverse().map(r => r.year);
  const [selectedYear, setSelectedYear] = useState<number>(years[0] ?? 0);

  if (years.length === 0) {
    return <p className="muted" style={{ padding: '1rem 0' }}>No completed seasons yet.</p>;
  }

  const champion   = history.championsByYear[selectedYear];
  const yearAwards = history.seasonAwards.find(sa => sa.year === selectedYear);
  const majorTypes = ['MVP', 'OPOY', 'DPOY', 'OROY', 'DROY', 'Coach_of_Year', 'Comeback_Player'];
  const majorAwards = yearAwards?.awards.filter(a => majorTypes.includes(a.type)) ?? [];

  // Runner-up: team with championshipRound === 'championship' for this year, not the champion
  const allTeamSeasons = Object.entries(history.teamHistory)
    .flatMap(([tid, seasons]) => seasons.map(s => ({ teamId: tid, ...s })));
  const runnerUpEntry = allTeamSeasons.find(
    s => s.year === selectedYear && s.championshipRound === 'championship' && s.teamId !== champion?.teamId,
  );
  const runnerUpTeam = teams.find(t => t.id === runnerUpEntry?.teamId);
  const runnerUpName = runnerUpTeam?.name ?? runnerUpEntry?.teamId ?? null;

  // Build a name map for player lookup
  const nameMap = new Map<string, string>();
  teams.forEach(t => t.roster.forEach(p => nameMap.set(p.id, p.name)));
  history.retiredPlayers.forEach(r => nameMap.set(r.playerId, r.name));

  // Season leaders from playerHistory for this year
  const yearStats = Object.entries(history.playerHistory)
    .flatMap(([pid, seasons]) => seasons.filter(s => s.year === selectedYear).map(s => ({ playerId: pid, ...s })));

  type StatKey = keyof typeof yearStats[0];
  function statLeader(key: StatKey): { playerId: string; name: string; value: number } | null {
    if (yearStats.length === 0) return null;
    const sorted = [...yearStats].sort((a, b) => (b[key] as number) - (a[key] as number));
    const top = sorted[0];
    if (!top || (top[key] as number) <= 0) return null;
    return { playerId: top.playerId, name: nameMap.get(top.playerId) ?? top.playerId, value: top[key] as number };
  }

  const leaders: { label: string; key: StatKey }[] = [
    { label: 'Passing Yards',  key: 'passingYards'        },
    { label: 'Rushing Yards',  key: 'rushingYards'        },
    { label: 'Receiving Yards', key: 'receivingYards'     },
    { label: 'Passing TDs',    key: 'passingTDs'          },
    { label: 'Rushing TDs',    key: 'rushingTDs'          },
    { label: 'Sacks',          key: 'sacks'               },
    { label: 'INTs',           key: 'interceptionsCaught' },
  ];

  // Playoff teams — sorted by how far they went
  const roundOrder: Record<string, number> = { champion: 4, championship: 3, semifinal: 2 };
  const playoffTeams = allTeamSeasons
    .filter(s => s.year === selectedYear && s.madePlayoffs)
    .sort((a, b) =>
      (roundOrder[b.championshipRound ?? ''] ?? 1) - (roundOrder[a.championshipRound ?? ''] ?? 1),
    );

  const isMyTeam = (id: string) => id === myTeamId;

  return (
    <div className="season-recap">
      <div className="recap-year-select">
        <span className="recap-year-label">Season</span>
        <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {champion && (
        <div className={`champion-block${isMyTeam(champion.teamId) ? ' user-champion' : ''}`}>
          <div className="champion-trophy">🏆</div>
          <div className="champion-year">{selectedYear} Champions</div>
          <div className="champion-name">{champion.teamName}</div>
          {runnerUpName && (
            <div className="champion-runnerup">Runner-up: {runnerUpName}</div>
          )}
        </div>
      )}

      <div className="recap-grid">
        {majorAwards.length > 0 && (
          <div className="recap-section">
            <h3>Awards</h3>
            <div className="recap-awards-list">
              {majorAwards.map(a => (
                <div key={a.type} className={`recap-award-row${isMyTeam(a.teamId ?? '') ? ' user-row' : ''}`}>
                  <span className="recap-award-type">{AWARD_SHORT_LABELS[a.type] ?? a.type}</span>
                  {a.playerId && onViewPlayer
                    ? <button className="pd-trigger" onClick={() => onViewPlayer(a.playerId!)}>{a.playerName ?? '—'}</button>
                    : <span className="recap-award-name">{a.playerName ?? a.coachName ?? '—'}</span>}
                  <span className="muted recap-award-team">{a.teamName ?? '—'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {yearStats.length > 0 && (
          <div className="recap-section">
            <h3>Season Leaders</h3>
            <div className="recap-leaders-list">
              {leaders.map(({ label, key }) => {
                const leader = statLeader(key);
                if (!leader) return null;
                return (
                  <div key={key} className="recap-leader-row">
                    <span className="recap-leader-stat">{label}</span>
                    {onViewPlayer
                      ? <button className="pd-trigger" onClick={() => onViewPlayer(leader.playerId)}>{leader.name}</button>
                      : <span className="recap-leader-name">{leader.name}</span>}
                    <span className="recap-leader-val">{leader.value.toLocaleString()}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {playoffTeams.length > 0 && (
        <div className="recap-section recap-playoff-section">
          <h3>Playoff Results</h3>
          <div className="recap-playoff-grid">
            {playoffTeams.map(p => {
              const team = teams.find(t => t.id === p.teamId);
              const resultLabel =
                p.championshipRound === 'champion'      ? '🏆 Champion'    :
                p.championshipRound === 'championship'  ? 'Runner-up'      :
                p.championshipRound === 'semifinal'     ? 'Conf. Final'    : 'First Round';
              return (
                <div
                  key={p.teamId}
                  className={`recap-playoff-team${isMyTeam(p.teamId) ? ' user-team' : ''}${p.championshipRound === 'champion' ? ' champion' : ''}`}
                >
                  <span className="recap-po-name">{team?.name ?? p.teamId}</span>
                  <span className="recap-po-record">{p.wins}–{p.losses}</span>
                  <span className="recap-po-result">{resultLabel}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function PlayoffView({ playoff, teams, seasonHistory, history, myTeamId, busy, advanceBtnLabel, onAdvance, onViewPlayer }: {
  playoff?: PlayoffBracket;
  teams: League['teams'];
  seasonHistory: SeasonRecord[];
  history: LeagueHistory;
  myTeamId: string;
  busy: boolean;
  advanceBtnLabel: string;
  onAdvance: () => void;
  onViewPlayer?: (id: string) => void;
}) {
  const [mode, setMode] = useState<'bracket' | 'recap'>('bracket');
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);

  const teamName  = (id: string) => teams.find(t => t.id === id)?.name ?? id;
  const isMyTeam  = (id: string) => id === myTeamId;
  const done      = advanceBtnLabel === 'Season Complete' || advanceBtnLabel === 'Draft In Progress';
  const hasHistory = seasonHistory.length > 0;

  const ROUND_LABELS: Record<string, string> = {
    wildcard: 'Wild Card', divisional: 'Divisional', conference: 'Conference', championship: 'Championship',
  };
  const ROUND_ORDER = ['wildcard', 'divisional', 'conference', 'championship'];

  const roundGroups = ROUND_ORDER.map(r => ({
    round: r,
    label: ROUND_LABELS[r]!,
    matchups: playoff?.matchups.filter(m => m.round === r) ?? [],
  })).filter(g => g.matchups.length > 0);

  function MatchupCard({ m, isChampionship }: { m: PlayoffBracket['matchups'][0]; isChampionship?: boolean }) {
    // Derive per-team scores from the game object
    const topScore = m.game
      ? (m.game.homeTeam.id === m.topSeedId ? m.game.homeScore : m.game.awayScore)
      : null;
    const botScore = m.game
      ? (m.game.homeTeam.id === m.bottomSeedId ? m.game.homeScore : m.game.awayScore)
      : null;
    const topWon   = !!m.winnerId && m.winnerId === m.topSeedId;
    const botWon   = !!m.winnerId && m.winnerId === m.bottomSeedId;
    const isPlayed = !!m.winnerId;

    return (
      <div
        className={`po-matchup-card${isChampionship ? ' po-championship-card' : ''}${m.game ? ' po-clickable' : ''}`}
        onClick={() => m.game && setSelectedGame(m.game)}
        title={m.game ? 'Click to view box score' : undefined}
      >
        {m.conference && <div className="po-conf-badge">{m.conference}</div>}
        <div className="po-matchup-inner">
          <div className={[
            'po-team-row',
            topWon ? 'winner' : (isPlayed ? 'loser' : ''),
            isMyTeam(m.topSeedId) ? 'my-team' : '',
          ].filter(Boolean).join(' ')}>
            {m.topSeed !== undefined && <span className="po-seed">{m.topSeed}</span>}
            <span className="po-name">{teamName(m.topSeedId)}</span>
            {topScore !== null && <span className="po-score">{topScore}</span>}
            {topWon && <span className="po-win-mark">✓</span>}
          </div>
          <div className={[
            'po-team-row',
            botWon ? 'winner' : (isPlayed ? 'loser' : ''),
            isMyTeam(m.bottomSeedId) ? 'my-team' : '',
          ].filter(Boolean).join(' ')}>
            {m.bottomSeed !== undefined && <span className="po-seed">{m.bottomSeed}</span>}
            <span className="po-name">{teamName(m.bottomSeedId)}</span>
            {botScore !== null && <span className="po-score">{botScore}</span>}
            {botWon && <span className="po-win-mark">✓</span>}
          </div>
          {!isPlayed && <div className="po-pending">TBD</div>}
        </div>
        {m.game && <div className="po-click-hint">box score</div>}
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

      {(playoff?.championId || hasHistory) && (
        <div className="po-mode-tabs">
          <button className={mode === 'bracket' ? 'active' : ''} onClick={() => setMode('bracket')}>Bracket</button>
          {hasHistory && (
            <button className={mode === 'recap' ? 'active' : ''} onClick={() => setMode('recap')}>Season Recap</button>
          )}
        </div>
      )}

      {mode === 'bracket' && (
        <>
          {playoff?.championId && (
            <div className={`champion-banner${isMyTeam(playoff.championId) ? ' champion-banner-mine' : ''}`}>
              🏆 {playoff.year} Champions: <strong>{playoff.championName}</strong>
            </div>
          )}

          {!playoff && <p className="muted">Playoffs have not started yet.</p>}

          {roundGroups.map(g => (
            <div key={g.round} className="po-round-section">
              <h3 className={`po-round-title${g.round === 'championship' ? ' championship' : ''}`}>
                {g.label}
              </h3>
              <div className={`po-matchups${g.round === 'championship' ? ' po-matchups-championship' : ''}`}>
                {g.matchups.map(m => (
                  <MatchupCard key={m.id} m={m} isChampionship={g.round === 'championship'} />
                ))}
              </div>
            </div>
          ))}

          {seasonHistory.length > 0 && (
            <div className="po-round-section">
              <h3 className="po-round-title">Past Champions</h3>
              <div className="po-past-champions">
                {[...seasonHistory].reverse().map(r => (
                  <div key={r.year} className={`po-past-champion-row${r.championId === myTeamId ? ' my-team' : ''}`}>
                    <span className="po-past-year">{r.year}</span>
                    <span className="po-past-name">{r.championName}</span>
                    {r.championId === myTeamId && <span className="po-past-mine">★</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {mode === 'recap' && hasHistory && (
        <SeasonRecapView
          seasonHistory={seasonHistory}
          history={history}
          teams={teams}
          myTeamId={myTeamId}
          onViewPlayer={onViewPlayer}
        />
      )}

      {selectedGame && (
        <div className="pd-overlay" onClick={() => setSelectedGame(null)}>
          <div className="pd-modal po-game-modal" onClick={e => e.stopPropagation()}>
            <div className="pd-header">
              <span className="pd-name">
                {selectedGame.awayTeam.name} @ {selectedGame.homeTeam.name}
              </span>
              <button className="pd-close" onClick={() => setSelectedGame(null)}>✕</button>
            </div>
            <div style={{ padding: '0 1rem 1rem' }}>
              <GameDetail game={selectedGame} />
            </div>
          </div>
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

// ── Hall of Fame ───────────────────────────────────────────────────────────────

const HOF_CONFIG = {
  inductionThreshold: 120,
  longevityPerYear:   3,
  championshipBonus:  20,
  rankBonus: { top3: 25, top5: 15, top10: 8 },
  awardPoints: { MVP: 30, OPOY: 20, DPOY: 20, OROY: 10, DROY: 10, AllPro1: 15, AllPro2: 8, Comeback_Player: 10 } as Record<string, number>,
  statWeights: {
    QB:  { passingYards: 0.018, passingTDs: 5.0, rushingYards: 0.008, rushingTDs: 3.0, receivingYards: 0, receivingTDs: 0, receptions: 0, sacks: 0, interceptionsCaught: 0 },
    RB:  { passingYards: 0, passingTDs: 0, rushingYards: 0.050, rushingTDs: 6.0, receivingYards: 0.015, receivingTDs: 3.0, receptions: 0.20, sacks: 0, interceptionsCaught: 0 },
    WR:  { passingYards: 0, passingTDs: 0, rushingYards: 0, rushingTDs: 0, receivingYards: 0.050, receivingTDs: 6.0, receptions: 0.40, sacks: 0, interceptionsCaught: 0 },
    TE:  { passingYards: 0, passingTDs: 0, rushingYards: 0, rushingTDs: 0, receivingYards: 0.050, receivingTDs: 6.0, receptions: 0.40, sacks: 0, interceptionsCaught: 0 },
    OL:  { passingYards: 0, passingTDs: 0, rushingYards: 0, rushingTDs: 0, receivingYards: 0, receivingTDs: 0, receptions: 0, sacks: 0, interceptionsCaught: 0 },
    DL:  { passingYards: 0, passingTDs: 0, rushingYards: 0, rushingTDs: 0, receivingYards: 0, receivingTDs: 0, receptions: 0, sacks: 10.0, interceptionsCaught: 4.0 },
    LB:  { passingYards: 0, passingTDs: 0, rushingYards: 0, rushingTDs: 0, receivingYards: 0, receivingTDs: 0, receptions: 0, sacks: 8.0, interceptionsCaught: 6.0 },
    CB:  { passingYards: 0, passingTDs: 0, rushingYards: 0, rushingTDs: 0, receivingYards: 0, receivingTDs: 0, receptions: 0, sacks: 3.0, interceptionsCaught: 12.0 },
    SAF: { passingYards: 0, passingTDs: 0, rushingYards: 0, rushingTDs: 0, receivingYards: 0, receivingTDs: 0, receptions: 0, sacks: 4.0, interceptionsCaught: 10.0 },
    ST:  { passingYards: 0, passingTDs: 0, rushingYards: 0, rushingTDs: 0, receivingYards: 0, receivingTDs: 0, receptions: 0, sacks: 0, interceptionsCaught: 0 },
  } as Record<string, Record<string, number>>,
  tierThresholds: { outside_shot: 30, building: 55, strong: 80, likely: 100, hall_of_famer: 120 },
};

const PRIMARY_STATS_CLIENT: Record<string, string[]> = {
  QB: ['passingYards', 'passingTDs'], RB: ['rushingYards', 'rushingTDs'],
  WR: ['receivingYards', 'receivingTDs'], TE: ['receivingYards', 'receivingTDs'],
  OL: [], DL: ['sacks'], LB: ['sacks', 'interceptionsCaught'],
  CB: ['interceptionsCaught'], SAF: ['interceptionsCaught'], ST: [],
};

function getPositionGroupClient(position: string): string {
  switch (position) {
    case 'QB':                       return 'QB';
    case 'RB':                       return 'RB';
    case 'WR':                       return 'WR';
    case 'TE':                       return 'TE';
    case 'OT': case 'OG': case 'C': return 'OL';
    case 'DE': case 'DT':            return 'DL';
    case 'OLB': case 'MLB':          return 'LB';
    case 'CB':                       return 'CB';
    case 'FS': case 'SS':            return 'SAF';
    default:                         return 'ST';
  }
}

/** Typed numeric stat lookup for PlayerSeasonHistoryLine — avoids unsafe Record cast. */
function getSeasonStat(s: PlayerSeasonHistoryLine, stat: string): number {
  switch (stat) {
    case 'passingYards':       return s.passingYards;
    case 'passingTDs':         return s.passingTDs;
    case 'interceptions':      return s.interceptions;
    case 'rushingYards':       return s.rushingYards;
    case 'rushingTDs':         return s.rushingTDs;
    case 'receivingYards':     return s.receivingYards;
    case 'receivingTDs':       return s.receivingTDs;
    case 'receptions':         return s.receptions;
    case 'sacks':              return s.sacks;
    case 'interceptionsCaught': return s.interceptionsCaught;
    case 'gamesPlayed':        return s.gamesPlayed;
    default:                   return 0;
  }
}

function computeClientLegacyScore(playerId: string, position: string, history: LeagueHistory): number {
  const seasons = history.playerHistory[playerId];
  if (!seasons || seasons.length === 0) return 0;

  const posGroup = getPositionGroupClient(position);
  const w = HOF_CONFIG.statWeights[posGroup];

  // Career totals
  let pYds = 0, pTDs = 0, rYds = 0, rTDs = 0, recYds = 0, recTDs = 0, rec = 0, sacks = 0, intC = 0;
  for (const s of seasons) {
    pYds   += s.passingYards;        pTDs  += s.passingTDs;
    rYds   += s.rushingYards;        rTDs  += s.rushingTDs;
    recYds += s.receivingYards;      recTDs += s.receivingTDs;
    rec    += s.receptions;          sacks  += s.sacks;
    intC   += s.interceptionsCaught;
  }

  let score = 0;
  score += pYds   * w.passingYards;
  score += pTDs   * w.passingTDs;
  score += rYds   * w.rushingYards;
  score += rTDs   * w.rushingTDs;
  score += recYds * w.receivingYards;
  score += recTDs * w.receivingTDs;
  score += rec    * w.receptions;
  score += sacks  * w.sacks;
  score += intC   * w.interceptionsCaught;
  score += seasons.length * HOF_CONFIG.longevityPerYear;

  // Awards
  for (const sa of history.seasonAwards) {
    for (const a of sa.awards) {
      if (a.playerId !== playerId) continue;
      score += HOF_CONFIG.awardPoints[a.type] ?? 0;
    }
  }

  // Championships
  for (const s of seasons) {
    if (history.championsByYear[s.year]?.teamId === s.teamId) {
      score += HOF_CONFIG.championshipBonus;
    }
  }

  // All-time rank bonus
  const primStats = PRIMARY_STATS_CLIENT[posGroup] ?? [];
  for (const stat of primStats) {
    const leaders = Object.entries(history.playerHistory)
      .map(([pid, pSeasons]) => ({
        playerId: pid,
        total: pSeasons.reduce((sum, s) => sum + getSeasonStat(s, stat), 0),
      }))
      .filter(e => e.total > 0)
      .sort((a, b) => b.total - a.total);
    const rank = leaders.findIndex(e => e.playerId === playerId) + 1;
    if (rank <= 0) continue;
    if (rank <= 3)       score += HOF_CONFIG.rankBonus.top3;
    else if (rank <= 5)  score += HOF_CONFIG.rankBonus.top5;
    else if (rank <= 10) score += HOF_CONFIG.rankBonus.top10;
  }

  return Math.round(score);
}

function computeClientLegacyTier(score: number): LegacyTier {
  const t = HOF_CONFIG.tierThresholds;
  if (score >= t.hall_of_famer) return 'hall_of_famer';
  if (score >= t.likely)        return 'likely';
  if (score >= t.strong)        return 'strong';
  if (score >= t.building)      return 'building';
  if (score >= t.outside_shot)  return 'outside_shot';
  return 'none';
}

function getLegacyLabel(tier: LegacyTier): string {
  switch (tier) {
    case 'hall_of_famer': return 'Hall of Famer';
    case 'likely':        return 'Likely HoFer';
    case 'strong':        return 'Strong Candidate';
    case 'building':      return 'Building a Case';
    case 'outside_shot':  return 'Outside Shot';
    default:              return 'No Case';
  }
}

function LegacyMeter({ score, tier }: { score: number; tier: LegacyTier }) {
  const maxScore = HOF_CONFIG.tierThresholds.hall_of_famer + 30; // a bit above threshold for visual
  const pct = Math.min(100, Math.round((score / maxScore) * 100));
  const tierColor: Record<LegacyTier, string> = {
    hall_of_famer: '#fbbf24',
    likely:        '#a78bfa',
    strong:        '#34d399',
    building:      '#60a5fa',
    outside_shot:  '#94a3b8',
    none:          '#475569',
  };
  const color = tierColor[tier];
  return (
    <div className="legacy-meter">
      <div className="legacy-meter-header">
        <span className="legacy-meter-label" style={{ color }}>
          {tier === 'hall_of_famer' ? '★ ' : ''}{getLegacyLabel(tier)}
        </span>
        <span className="legacy-meter-score">{score} pts</span>
      </div>
      <div className="legacy-meter-bar-bg">
        <div className="legacy-meter-bar-fill" style={{ width: `${pct}%`, background: color }} />
        <div
          className="legacy-meter-threshold"
          style={{ left: `${Math.round((HOF_CONFIG.tierThresholds.hall_of_famer / maxScore) * 100)}%` }}
          title="HoF threshold"
        />
      </div>
    </div>
  );
}

function HallOfFameView({ history, teams, onViewPlayer }: {
  history: LeagueHistory;
  teams: League['teams'];
  onViewPlayer?: (id: string) => void;
}) {
  const [posFilter, setPosFilter] = useState('all');
  const [teamFilter, setTeamFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'inducted' | 'watch'>('inducted');

  const hof = history.hallOfFame ?? [];

  // Build near-HoF watch list from retired players not yet inducted
  const inducedIds = new Set(hof.map(e => e.playerId));
  const watchList = useMemo(() => {
    return history.retiredPlayers
      .filter(r => !inducedIds.has(r.playerId))
      .map(r => {
        const score = computeClientLegacyScore(r.playerId, r.position, history);
        const tier  = computeClientLegacyTier(score);
        return { ...r, score, tier };
      })
      .filter(r => r.score >= HOF_CONFIG.tierThresholds.outside_shot)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);
  }, [history]);

  // Position groups for filter
  const positions = useMemo(() => {
    const posSet = new Set(hof.map(e => e.position));
    return Array.from(posSet).sort();
  }, [hof]);

  // Teams for filter
  const teamOptions = useMemo(() => {
    const tSet = new Set<string>();
    for (const e of hof) for (const tid of e.teamIds) tSet.add(tid);
    return Array.from(tSet)
      .map(tid => ({ id: tid, name: teams.find(t => t.id === tid)?.name ?? tid }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [hof, teams]);

  const filtered = hof.filter(e => {
    if (posFilter !== 'all' && e.position !== posFilter) return false;
    if (teamFilter !== 'all' && !e.teamIds.includes(teamFilter)) return false;
    return true;
  });

  // Group by induction year
  const byYear = useMemo(() => {
    const map = new Map<number, HallOfFameEntry[]>();
    for (const e of filtered) {
      const arr = map.get(e.inductionYear) ?? [];
      arr.push(e);
      map.set(e.inductionYear, arr);
    }
    return Array.from(map.entries()).sort((a, b) => b[0] - a[0]);
  }, [filtered]);

  return (
    <section className="hof-view">
      <div className="hof-header">
        <h2>Hall of Fame</h2>
        <span className="hof-count">{hof.length} inductees</span>
      </div>

      <div className="hof-mode-tabs">
        <button className={viewMode === 'inducted' ? 'active' : ''} onClick={() => setViewMode('inducted')}>
          Inducted ({hof.length})
        </button>
        <button className={viewMode === 'watch' ? 'active' : ''} onClick={() => setViewMode('watch')}>
          Watch List ({watchList.length})
        </button>
      </div>

      {viewMode === 'inducted' ? (
        <>
          {/* Filters */}
          <div className="hof-filters">
            <select value={posFilter} onChange={e => setPosFilter(e.target.value)}>
              <option value="all">All Positions</option>
              {positions.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={teamFilter} onChange={e => setTeamFilter(e.target.value)}>
              <option value="all">All Teams</option>
              {teamOptions.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          {filtered.length === 0 ? (
            <p className="muted hof-empty">No inductees yet. Players are evaluated for the Hall of Fame after retirement.</p>
          ) : (
            byYear.map(([year, entries]) => (
              <div key={year} className="hof-class">
                <div className="hof-class-header">{year} Induction Class</div>
                <div className="hof-cards">
                  {entries.map(e => (
                    <HofCard key={e.playerId} entry={e} onViewPlayer={onViewPlayer} />
                  ))}
                </div>
              </div>
            ))
          )}
        </>
      ) : (
        <div className="hof-watch-list">
          {watchList.length === 0 ? (
            <p className="muted hof-empty">No retired players with enough legacy score to track.</p>
          ) : (
            watchList.map(r => (
              <div key={r.playerId} className="hof-watch-row">
                <div className="hof-watch-info">
                  <span className="hof-watch-name">{r.name}</span>
                  <span className="hof-watch-pos">{r.position}</span>
                  <span className="hof-watch-years muted">Ret. {r.retirementYear}</span>
                </div>
                <LegacyMeter score={r.score} tier={r.tier} />
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
}

function HofCard({ entry, onViewPlayer }: { entry: HallOfFameEntry; onViewPlayer?: (id: string) => void }) {
  const cs = entry.careerStats;
  const hasPassing   = cs.passingYards > 0;
  const hasRushing   = cs.rushingYards > 0;
  const hasReceiving = cs.receivingYards > 0;
  const hasDefense   = cs.sacks > 0 || cs.interceptionsCaught > 0;

  return (
    <div className="hof-card" onClick={() => onViewPlayer?.(entry.playerId)}>
      <div className="hof-card-header">
        <span className="hof-card-name">{entry.name}</span>
        <span className="hof-card-badge">{entry.position}</span>
      </div>
      <div className="hof-card-teams muted">{entry.teamNames.join(' · ')}</div>
      <div className="hof-card-meta">
        <span>{entry.yearsPlayed} seasons</span>
        {entry.championships > 0 && <span className="hof-card-rings">{'★'.repeat(entry.championships)} Ring{entry.championships > 1 ? 's' : ''}</span>}
      </div>
      <div className="hof-card-stats">
        {hasPassing   && <span>{cs.passingYards.toLocaleString()} Pass Yds · {cs.passingTDs} TD</span>}
        {hasRushing   && <span>{cs.rushingYards.toLocaleString()} Rush Yds · {cs.rushingTDs} TD</span>}
        {hasReceiving && <span>{cs.receivingYards.toLocaleString()} Rec Yds · {cs.receivingTDs} TD</span>}
        {hasDefense   && <span>{cs.sacks > 0 ? `${cs.sacks} Sacks` : ''}{cs.sacks > 0 && cs.interceptionsCaught > 0 ? ' · ' : ''}{cs.interceptionsCaught > 0 ? `${cs.interceptionsCaught} INT` : ''}</span>}
        {!hasPassing && !hasRushing && !hasReceiving && !hasDefense && <span className="muted">Lineman</span>}
      </div>
      <div className="hof-card-awards">
        {Object.entries(entry.awardsCount).map(([type, count]) => (
          <span key={type} className="hof-award-chip">{count > 1 ? `${count}x ` : ''}{type.replace(/_/g, ' ')}</span>
        ))}
      </div>
      <div className="hof-card-score">Legacy Score: {entry.legacyScore}</div>
    </div>
  );
}

// ── Ring of Honor View ─────────────────────────────────────────────────────────

function RingOfHonorView({ history, teams, myTeamId, onViewPlayer }: {
  history: LeagueHistory;
  teams: League['teams'];
  myTeamId: string;
  onViewPlayer?: (id: string) => void;
}) {
  const rohAll = history.ringOfHonor ?? {};
  const [selectedTeamId, setSelectedTeamId] = useState<string>(myTeamId);
  const [posFilter, setPosFilter] = useState<string>('all');

  // Teams that have at least one Ring of Honor entry
  const teamsWithRoH = teams.filter(t => (rohAll[t.id] ?? []).length > 0);

  const entries: RingOfHonorEntry[] = rohAll[selectedTeamId] ?? [];
  const positions = ['all', ...new Set(entries.map(e => e.position))].sort();
  const filtered  = posFilter === 'all' ? entries : entries.filter(e => e.position === posFilter);
  const sorted    = [...filtered].sort((a, b) => b.teamLegacyScore - a.teamLegacyScore);

  const selectedTeamName = teams.find(t => t.id === selectedTeamId)?.name ?? selectedTeamId;

  if (teamsWithRoH.length === 0 && (rohAll[myTeamId] ?? []).length === 0) {
    return (
      <section className="gp-view">
        <h2>Ring of Honor</h2>
        <p className="muted">No players have been inducted into any Ring of Honor yet. Check back after players retire.</p>
      </section>
    );
  }

  return (
    <section className="gp-view roh-view">
      <h2>Ring of Honor</h2>

      {/* Team selector */}
      <div className="roh-team-tabs">
        {teamsWithRoH.map(t => (
          <button
            key={t.id}
            className={`roh-team-tab${t.id === selectedTeamId ? ' active' : ''}`}
            onClick={() => { setSelectedTeamId(t.id); setPosFilter('all'); }}
          >
            {t.abbreviation}
          </button>
        ))}
      </div>

      <div className="roh-header">
        <h3>{selectedTeamName} Ring of Honor</h3>
        {entries.length > 0 && (
          <div className="roh-pos-filter">
            {positions.map(pos => (
              <button
                key={pos}
                className={`roh-pos-btn${posFilter === pos ? ' active' : ''}`}
                onClick={() => setPosFilter(pos)}
              >
                {pos === 'all' ? 'All' : pos}
              </button>
            ))}
          </div>
        )}
      </div>

      {sorted.length === 0 ? (
        <p className="muted">No honorees for this team yet.</p>
      ) : (
        <div className="roh-table-wrap">
          <table className="roh-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Pos</th>
                <th>Yrs</th>
                <th>Score</th>
                <th>Rings</th>
                <th>Inducted</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(e => (
                <tr key={e.playerId} className={e.jerseyRetired ? 'roh-jersey-row' : ''}>
                  <td>
                    <span className="roh-player-name">
                      {e.jerseyRetired && <span className="roh-jersey-icon" title="Jersey Retired">◈ </span>}
                      {onViewPlayer
                        ? <button className="player-link" onClick={() => onViewPlayer(e.playerId)}>{e.name}</button>
                        : e.name
                      }
                    </span>
                  </td>
                  <td className="muted">{e.position}</td>
                  <td className="muted">{e.yearsWithTeam}</td>
                  <td className="ovr-cell">{e.teamLegacyScore}</td>
                  <td>{e.championshipsWithTeam > 0 ? '★'.repeat(e.championshipsWithTeam) : <span className="muted">—</span>}</td>
                  <td className="muted">{e.inductedYear}</td>
                  <td>
                    {Object.entries(e.awardsWithTeam).map(([type, count]) => (
                      <span key={type} className="hof-award-chip">{count > 1 ? `${count}x ` : ''}{type.replace(/_/g, ' ')}</span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="muted coaching-note">
        Ring of Honor recognizes franchise legends based only on contributions to this specific team — seasons, championships, and awards earned here. ◈ indicates a retired jersey.
      </p>
    </section>
  );
}

// ── GM Career View ─────────────────────────────────────────────────────────────

function gmLegacyTier(score: number): string {
  if (score >= 200) return 'Legendary';
  if (score >= 150) return 'Elite';
  if (score >= 100) return 'Respected';
  if (score >= 60)  return 'Established';
  if (score >= 30)  return 'Building';
  return 'Newcomer';
}

function GmCareerView({ career }: { career: GmCareer }) {
  const totalWins   = career.seasons.reduce((s, r) => s + r.wins,   0);
  const totalLosses = career.seasons.reduce((s, r) => s + r.losses, 0);
  const playoffApps = career.seasons.filter(r => r.madePlayoffs).length;
  const championships = career.seasons.filter(r => r.wonChampionship).length;
  const totalDraftPicks = career.seasons.reduce((s, r) => s + r.draftPicksMade, 0);
  const totalTrades     = career.seasons.reduce((s, r) => s + r.tradesMade, 0);
  const totalFASignings = career.seasons.reduce((s, r) => s + r.faSigningsMade, 0);
  const tier = gmLegacyTier(career.legacyScore);

  return (
    <section className="gm-career-view">
      <h2>GM Career</h2>
      <div className="gm-career-header">
        <div className="gm-legacy-score">
          <span className="gm-score-num">{career.legacyScore}</span>
          <span className="gm-score-label">Legacy Score</span>
          <span className={`gm-tier-badge gm-tier-${tier.toLowerCase()}`}>{tier}</span>
        </div>
        <div className="gm-career-meta">
          <div><span className="muted">Team</span> {career.teamName}</div>
          <div><span className="muted">Started</span> {career.startYear}</div>
          <div><span className="muted">Seasons</span> {career.seasons.length}</div>
          <div><span className="muted">Record</span> {totalWins}–{totalLosses}</div>
          <div><span className="muted">Playoffs</span> {playoffApps}x</div>
          <div><span className="muted">Championships</span> {championships}x</div>
        </div>
      </div>

      {/* Transactions summary */}
      <div className="gm-transactions">
        <h3>Career Transactions</h3>
        <div className="gm-tx-row">
          <div className="gm-tx-item"><span className="gm-tx-num">{totalDraftPicks}</span><span className="gm-tx-label">Draft Picks</span></div>
          <div className="gm-tx-item"><span className="gm-tx-num">{totalTrades}</span><span className="gm-tx-label">Trades</span></div>
          <div className="gm-tx-item"><span className="gm-tx-num">{totalFASignings}</span><span className="gm-tx-label">FA Signings</span></div>
        </div>
      </div>

      {/* Achievements */}
      {career.achievements.length > 0 && (
        <div className="gm-achievements">
          <h3>Achievements</h3>
          <div className="gm-ach-grid">
            {career.achievements.map(ach => (
              <div key={ach.id} className="gm-ach-card">
                <div className="gm-ach-label">{ach.label}</div>
                <div className="gm-ach-desc muted">{ach.description}</div>
                <div className="gm-ach-year muted">Unlocked {ach.unlockedYear}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Season-by-season log */}
      {career.seasons.length > 0 && (
        <div className="gm-season-log">
          <h3>Season Log</h3>
          <table className="hof-table">
            <thead>
              <tr>
                <th>Year</th>
                <th>Team</th>
                <th>W</th>
                <th>L</th>
                <th>Playoffs</th>
                <th>Champ</th>
                <th>Picks</th>
                <th>Trades</th>
                <th>FA Signs</th>
              </tr>
            </thead>
            <tbody>
              {[...career.seasons].reverse().map(s => (
                <tr key={s.year} className={s.wonChampionship ? 'gm-champ-row' : ''}>
                  <td>{s.year}</td>
                  <td>{s.teamName}</td>
                  <td>{s.wins}</td>
                  <td>{s.losses}</td>
                  <td>{s.madePlayoffs ? '✓' : '—'}</td>
                  <td>{s.wonChampionship ? '🏆' : '—'}</td>
                  <td>{s.draftPicksMade}</td>
                  <td>{s.tradesMade}</td>
                  <td>{s.faSigningsMade}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {career.seasons.length === 0 && (
        <p className="muted">Complete your first season to see your GM career history.</p>
      )}
    </section>
  );
}

// ── News ───────────────────────────────────────────────────────────────────────

const NEWS_TYPE_LABEL: Record<string, string> = {
  game_result:     'Game',
  playoff_result:  'Playoffs',
  championship:    'Championship',
  award:           'Award',
  signing:         'Signing',
  trade:           'Trade',
  retirement:      'Retirement',
  draft_pick:      'Draft',
  big_performance: 'Performance',
  upset:           'Upset',
  weekly_recap:    'Recap',
  milestone:       'Milestone',
  stat_race:       'Stat Race',
  streak:          'Streak',
  hall_of_fame:    'Hall of Fame',
  coach_change:    'Coaching',
  ring_of_honor:   'Ring of Honor',
  retired_jersey:  'Retired Jersey',
  gm_milestone:    'GM Career',
};

const NEWS_TYPE_CLASS: Record<string, string> = {
  game_result:     'news-game',
  playoff_result:  'news-playoff',
  championship:    'news-championship',
  award:           'news-award',
  signing:         'news-signing',
  trade:           'news-trade',
  retirement:      'news-retirement',
  draft_pick:      'news-draft',
  big_performance: 'news-perf',
  upset:           'news-upset',
  weekly_recap:    'news-recap',
  milestone:       'news-milestone',
  stat_race:       'news-stat-race',
  streak:          'news-streak',
  hall_of_fame:    'news-hof',
  coach_change:    'news-coaching',
  ring_of_honor:   'news-roh',
  retired_jersey:  'news-roh',
  gm_milestone:    'news-gm',
};

// Map news types to filter categories
const NEWS_FILTER_CATEGORY: Record<string, string> = {
  game_result:     'games',
  playoff_result:  'games',
  championship:    'games',
  upset:           'games',
  big_performance: 'games',
  award:           'awards',
  signing:         'transactions',
  trade:           'transactions',
  draft_pick:      'transactions',
  retirement:      'transactions',
  weekly_recap:    'milestones',
  milestone:       'milestones',
  stat_race:       'milestones',
  streak:          'milestones',
  hall_of_fame:    'awards',
  coach_change:    'transactions',
  ring_of_honor:   'awards',
  retired_jersey:  'awards',
  gm_milestone:    'awards',
};

type NewsFilter = 'all' | 'games' | 'transactions' | 'awards' | 'milestones';

function NewsView({ news, myTeamId, onViewPlayer }: {
  news: NewsItem[];
  myTeamId: string;
  onViewPlayer?: (id: string) => void;
}) {
  const [filter, setFilter] = useState<NewsFilter>('all');

  const filtered = filter === 'all'
    ? news
    : news.filter(n => (NEWS_FILTER_CATEGORY[n.type] ?? 'other') === filter);

  const filters: { id: NewsFilter; label: string }[] = [
    { id: 'all',          label: 'All' },
    { id: 'games',        label: 'Games' },
    { id: 'transactions', label: 'Transactions' },
    { id: 'awards',       label: 'Awards' },
  ];

  return (
    <section className="news-section">
      <div className="news-page-header">
        <h2>League News</h2>
      </div>
      <div className="news-filter-bar">
        {filters.map(f => (
          <button
            key={f.id}
            className={`news-filter-btn${filter === f.id ? ' active' : ''}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>
      {filtered.length === 0
        ? <p className="muted" style={{ padding: '1rem 0' }}>
            {news.length === 0 ? 'No news yet — play some games!' : 'No news in this category.'}
          </p>
        : filtered.map(n => (
          <NewsCard
            key={n.id}
            item={n}
            isMyTeam={n.teamIds.includes(myTeamId)}
            onViewPlayer={onViewPlayer}
          />
        ))
      }
    </section>
  );
}

function NewsCard({ item: n, isMyTeam, onViewPlayer }: {
  item: NewsItem;
  isMyTeam: boolean;
  onViewPlayer?: (id: string) => void;
}) {
  const playerMentions = n.mentions?.filter(m => m.entityType === 'player') ?? [];
  return (
    <div className={`news-item ${NEWS_TYPE_CLASS[n.type] ?? ''}${isMyTeam ? ' news-item-mine' : ''}`}>
      <div className="news-header">
        <span className={`news-badge ${NEWS_TYPE_CLASS[n.type] ?? ''}`}>
          {NEWS_TYPE_LABEL[n.type] ?? n.type}
        </span>
        <span className="news-meta">
          {n.week > 0 ? `Wk ${n.week} · ` : ''}{n.year}
        </span>
        {isMyTeam && <span className="news-mine-dot" title="Involves your team" />}
      </div>
      <div className="news-headline">{n.headline}</div>
      <div className="news-body">{n.body}</div>
      {playerMentions.length > 0 && onViewPlayer && (
        <div className="news-mentions">
          {playerMentions.map(m => (
            <button key={m.id} className="news-mention-btn" onClick={() => onViewPlayer(m.id)}>
              {m.name}
            </button>
          ))}
        </div>
      )}
    </div>
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
  const nextYear  = league.draft?.year ?? (league.currentSeason.year + 1);
  const futureYear = nextYear + 1;
  const ownership  = league.draftPickOwnership ?? {};
  const picks: PickAsset[] = [];
  for (const year of [nextYear, futureYear]) {
    for (const team of league.teams) {
      for (let round = 1; round <= 7; round++) {
        const key   = `${year}:${round}:${team.id}`;
        const owner = ownership[key] ?? team.id;
        if (owner === teamId) {
          picks.push({ type: 'pick', year, round, originalTeamId: team.id, originalTeamName: team.name });
        }
      }
    }
  }
  return picks;
}

function TradesView({ league, myTeamId, busy: globalBusy, onPropose, onRespond, onShopPlayer }: {
  league: League;
  myTeamId: string;
  busy: boolean;
  onPropose: (toTeamId: string, fromAssets: TradeAsset[], toAssets: TradeAsset[]) => Promise<void>;
  onRespond: (proposalId: string, accept: boolean) => Promise<void>;
  onShopPlayer: (playerId: string) => Promise<number>;
}) {
  const [respondBusy, setRespondBusy] = useState<string | null>(null);
  const [respondError, setRespondError] = useState<string | null>(null);

  // Proposal builder state
  const [targetTeamId,  setTargetTeamId]  = useState('');
  const [giveSet,       setGiveSet]       = useState<Set<string>>(new Set());
  const [receiveSet,    setReceiveSet]     = useState<Set<string>>(new Set());
  const [proposeBusy,   setProposeBusy]   = useState(false);
  const [proposeError,  setProposeError]  = useState<string | null>(null);

  // Shop player state
  const [shopPlayerId,  setShopPlayerId]  = useState('');
  const [shopStatus,    setShopStatus]    = useState<string | null>(null);

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

  // Cap impact for user after this trade
  const myPayroll       = myTeam.roster.reduce((s, p) => s + p.salary, 0);
  const outgoingSalary  = fromAssets.reduce((s, a) => a.type === 'player' ? s + (myTeam.roster.find(p => p.id === a.playerId)?.salary ?? 0) : s, 0);
  const incomingSalary  = toAssets.reduce((s, a) => a.type === 'player' ? s + (targetTeam?.roster.find(p => p.id === a.playerId)?.salary ?? 0) : s, 0);
  const postTradePayroll = myPayroll - outgoingSalary + incomingSalary;

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

  async function handleShop() {
    if (!shopPlayerId) return;
    setShopStatus(null);
    const count = await onShopPlayer(shopPlayerId);
    setShopStatus(count > 0
      ? `${count} offer${count !== 1 ? 's' : ''} generated — see Incoming Proposals above.`
      : 'No offers found. Try a higher-value or more in-demand player.');
  }

  function teamName(id: string) { return league.teams.find(t => t.id === id)?.name ?? id; }

  function tradeHistoryContext(p: TradeProposal): string {
    if (p.completedAt) {
      const parts: string[] = [];
      if (p.completedWeek)  parts.push(`Wk ${p.completedWeek}`);
      if (p.completedPhase) parts.push(p.completedPhase.replace('_', ' '));
      return parts.length ? ` · ${parts.join(', ')}` : '';
    }
    return '';
  }

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
                <div className="trade-teams">
                  <strong>{teamName(p.fromTeamId)}</strong>
                  <FoPersonalityBadge personality={league.teams.find(t => t.id === p.fromTeamId)?.frontOffice} size="sm" />
                  {' → '}<strong>You</strong>
                </div>
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
            {targetTeam.frontOffice && (
              <div className="trade-partner-identity">
                <FoPersonalityBadge personality={targetTeam.frontOffice} size="md" />
                <span className="muted">{FO_DESC[targetTeam.frontOffice]}</span>
              </div>
            )}
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
            {(fromAssets.length > 0 || toAssets.length > 0) && (
              <div className={`trade-cap-impact ${postTradePayroll > CAP_LIMIT ? 'cap-over' : postTradePayroll > CAP_LIMIT * 0.92 ? 'cap-warn' : ''}`}>
                Post-trade cap: ${postTradePayroll}M / ${CAP_LIMIT}M
                {postTradePayroll > CAP_LIMIT && ' — exceeds cap!'}
              </div>
            )}
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
                  {recvVal >= giveVal * 0.85 ? 'Fair trade' : recvVal >= giveVal * 0.70 ? 'Borderline' : 'Lopsided'}
                </span>
              )}
            </div>
          </>
        )}
      </div>

      <h3 style={{ marginTop: '1.5rem' }}>Shop a Player</h3>
      <div className="shop-player-panel">
        <p className="muted" style={{ marginBottom: '0.6rem' }}>
          Select one of your players to find CPU teams willing to make an offer.
          Any generated offers will appear in Incoming Proposals above.
        </p>
        <div className="shop-player-row">
          <select
            value={shopPlayerId}
            onChange={e => { setShopPlayerId(e.target.value); setShopStatus(null); }}
            className="shop-player-select"
          >
            <option value="">— select player —</option>
            {[...myTeam.roster]
              .sort((a, b) => b.scoutedOverall - a.scoutedOverall)
              .map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.position}, OVR {p.scoutedOverall}, ${p.salary}M)
                </option>
              ))}
          </select>
          <button
            className="btn-primary"
            disabled={!shopPlayerId || globalBusy}
            onClick={handleShop}
          >
            Find Offers
          </button>
        </div>
        {shopStatus && (
          <div className={`shop-status ${shopStatus.startsWith('No offers') ? 'muted' : 'shop-status-ok'}`}>
            {shopStatus}
          </div>
        )}
      </div>

      {history.length > 0 && (
        <>
          <h3 style={{ marginTop: '1.5rem' }}>Recent History</h3>
          {history.map((p: TradeProposal) => {
            const isMine = p.fromTeamId === myTeamId;
            return (
              <div key={p.id} className={`trade-history-row ${p.status}`}>
                <span className="trade-status-badge">{p.status}</span>
                <span>
                  {isMine ? 'You → ' : `${teamName(p.fromTeamId)} → You: `}
                  {describeAssetsDisplay(p.fromAssets)} for {describeAssetsDisplay(p.toAssets)}
                  {!isMine && ` (to ${teamName(p.toTeamId)})`}
                  <span className="trade-history-ctx">{tradeHistoryContext(p)}</span>
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

const DEV_TRAIT_BADGE: Record<string, { short: string; label: string }> = {
  superDev:    { short: 'SD',   label: 'Super Dev — exceptional development trajectory' },
  lateBloomer: { short: 'LB',   label: 'Late Bloomer — peaks after several pro seasons' },
  bust:        { short: 'BUST', label: 'Bust — below-average development potential' },
  declining:   { short: 'DEC',  label: 'Declining — accelerated regression curve' },
};

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
        <h2>
          Roster — {team.name}
          {!isMyTeam && team.frontOffice && (
            <FoPersonalityBadge personality={team.frontOffice} size="sm" />
          )}
        </h2>
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
                  <th>Name</th><th>Pos</th><th>Age</th><th>OVR</th><th>Salary</th><th>Yrs</th><th>Pro</th><th>Inj</th>
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
  const devBadge = isMyTeam && p.devTrait && p.devTrait !== 'normal'
    ? DEV_TRAIT_BADGE[p.devTrait]
    : null;
  return (
    <tr className={injured ? 'injured' : ''}>
      <td>
        {isStarter && <span className="starter-badge">S</span>}
        {onViewPlayer
          ? <button className="player-name-link" onClick={() => onViewPlayer(p.id)}>{p.name}</button>
          : p.name}
        {p.contractDemand && <span className="contract-demand-badge" title={`Wants $${p.contractDemand.salary}M/${p.contractDemand.years}yr`}> !</span>}
        {p.isRookie && <span className="rookie-badge">R</span>}
        {devBadge && <span className={`dev-trait-badge dev-trait-${p.devTrait}`} title={devBadge.label}>{devBadge.short}</span>}
      </td>
      <td>{p.position}</td>
      <td>{p.age}</td>
      <td className="ovr-cell">{p.scoutedOverall}</td>
      <td>${p.salary}M</td>
      <td className={p.yearsRemaining === 1 ? 'expiring' : ''}>{p.yearsRemaining}yr</td>
      <td className="muted">{p.yearsPro ?? 0}yr</td>
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

function calcFAAskingPrice(player: Player): { salary: number; years: number } {
  const premium = 1.05;
  const marketSalary = Math.max(player.salary, Math.max(1, Math.round(player.scoutedOverall / 10)));
  const salary = Math.round(marketSalary * premium);
  let years: number;
  if      (player.age <= 24) years = 4;
  else if (player.age <= 27) years = 3;
  else if (player.age <= 30) years = 2;
  else                       years = 1;
  return { salary, years };
}

function FreeAgentsView({ league, myTeamId, busy, onOffer }: {
  league:    League;
  myTeamId:  string;
  busy:      boolean;
  onOffer:   (playerId: string, salary: number, years: number) => void;
}) {
  const isOffseason = league.phase === 'offseason';
  const myTeam      = league.teams.find(t => t.id === myTeamId)!;
  const payroll     = myTeam.roster.reduce((s, p) => s + p.salary, 0);
  const capRemaining = CAP_LIMIT - payroll;
  const freeAgents   = league.freeAgents;

  const [posFilter, setPosFilter]               = useState('ALL');
  const [offers, setOffers]                     = useState<Record<string, { salary: string; years: string }>>({});

  const positions = ['ALL', ...Array.from(new Set(freeAgents.map(p => p.position))).sort()];
  let sorted = [...freeAgents].sort((a, b) => b.scoutedOverall - a.scoutedOverall);
  if (posFilter !== 'ALL') sorted = sorted.filter(p => p.position === posFilter);

  function getOffer(id: string) {
    return offers[id] ?? { salary: '', years: '' };
  }
  function setOffer(id: string, field: 'salary' | 'years', val: string) {
    setOffers(prev => ({ ...prev, [id]: { ...getOffer(id), [field]: val } }));
  }

  function handleSubmitOffer(player: Player) {
    const o = getOffer(player.id);
    const salary = parseInt(o.salary, 10);
    const years  = parseInt(o.years,  10);
    if (!salary || salary < 1) return;
    if (!years  || years  < 1 || years > 10) return;
    onOffer(player.id, salary, years);
  }

  const capPct = Math.min(100, (payroll / CAP_LIMIT) * 100);

  return (
    <section>
      <div className="fa-header">
        <h2>Free Agents</h2>
        <select value={posFilter} onChange={e => setPosFilter(e.target.value)} className="fa-pos-filter">
          {positions.map(pos => <option key={pos} value={pos}>{pos}</option>)}
        </select>
        <span className="muted">{sorted.length} player{sorted.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="cap-bar-wrap">
        <div className="cap-bar-label">
          <span>Cap: ${payroll}M / ${CAP_LIMIT}M used</span>
          <span className={capRemaining < 10 ? 'cap-bar-tight' : 'muted'}>${capRemaining}M remaining</span>
        </div>
        <div className="cap-bar-track">
          <div className="cap-bar-fill" style={{ width: `${capPct}%`, background: capPct > 90 ? '#e55' : capPct > 75 ? '#e90' : '#4caf' }} />
        </div>
      </div>

      {!isOffseason && <p className="muted" style={{ marginBottom: '0.75rem' }}>Signing available during offseason only.</p>}

      {sorted.length === 0
        ? <p className="muted">No free agents{posFilter !== 'ALL' ? ` at ${posFilter}` : ''}.</p>
        : (
          <table className="fa-table">
            <thead>
              <tr>
                <th>Name</th><th>Pos</th><th>Age</th><th>OVR</th>
                <th>Cur $</th><th>Asking</th>
                {isOffseason && <><th>Offer $</th><th>Yrs</th><th></th></>}
              </tr>
            </thead>
            <tbody>
              {sorted.map(p => {
                const asking = calcFAAskingPrice(p);
                const o      = getOffer(p.id);
                return (
                  <tr key={p.id}>
                    <td>{p.name}{p.isRookie && <span className="rookie-badge">R</span>}</td>
                    <td>{p.position}</td>
                    <td>{p.age}</td>
                    <td className="ovr-cell">{p.scoutedOverall}</td>
                    <td>${p.salary}M</td>
                    <td className="fa-asking">${asking.salary}M / {asking.years}yr</td>
                    {isOffseason && (
                      <>
                        <td>
                          <input
                            type="number" min={1} className="fa-offer-input"
                            placeholder={String(asking.salary)}
                            value={o.salary}
                            onChange={e => setOffer(p.id, 'salary', e.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            type="number" min={1} max={10} className="fa-offer-input fa-offer-years"
                            placeholder={String(asking.years)}
                            value={o.years}
                            onChange={e => setOffer(p.id, 'years', e.target.value)}
                          />
                        </td>
                        <td>
                          <button
                            className="btn-sm btn-positive"
                            disabled={busy || !o.salary || !o.years}
                            onClick={() => handleSubmitOffer(p)}
                          >
                            Offer
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
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
      <div className="team-overview-header">
        <h2 style={{ margin: 0 }}>{team.name}</h2>
        {team.frontOffice && (
          <div className="team-fo-identity">
            <FoPersonalityBadge personality={team.frontOffice} size="md" />
            <span className="team-fo-desc muted">{FO_DESC[team.frontOffice]}</span>
          </div>
        )}
      </div>

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
          <div className="ov-coach"><span className="muted">OC</span> {team.coaches.oc ? `${team.coaches.oc.name} (${team.coaches.oc.overall})` : <span className="neg">Vacant</span>}</div>
          <div className="ov-coach"><span className="muted">DC</span> {team.coaches.dc ? `${team.coaches.dc.name} (${team.coaches.dc.overall})` : <span className="neg">Vacant</span>}</div>
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

  const payroll      = team.roster.reduce((s, p) => s + p.salary, 0);
  const capRemaining = CAP_LIMIT - payroll;
  const capPct       = Math.min(100, (payroll / CAP_LIMIT) * 100);

  return (
    <section>
      <h2>Contracts — {team.name}</h2>

      <div className="cap-bar-wrap">
        <div className="cap-bar-label">
          <span>Cap: ${payroll}M / ${CAP_LIMIT}M used</span>
          <span className={capRemaining < 10 ? 'cap-bar-tight' : 'muted'}>${capRemaining}M remaining</span>
        </div>
        <div className="cap-bar-track">
          <div className="cap-bar-fill" style={{ width: `${capPct}%`, background: capPct > 90 ? '#e55' : capPct > 75 ? '#e90' : '#4caf' }} />
        </div>
      </div>

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

function DraftView({ league, myTeamId, busy, onPick, onSimDraft, onAdvance, onAdvanceOnePick, onAdvanceToMyPick }: {
  league: League;
  myTeamId: string;
  busy: boolean;
  onPick: (playerId: string) => void;
  onSimDraft: () => void;
  onAdvance: () => void;
  onAdvanceOnePick: () => void;
  onAdvanceToMyPick: () => void;
}) {
  const [posFilter, setPosFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'board' | 'ovr' | 'pos'>('board');
  const [showResults, setShowResults] = useState(false);
  const draft = league.draft;

  if (!draft) {
    return (
      <section className="panel">
        <h2>Draft</h2>
        <p className="muted">Draft has not started yet. Advance from the offseason to begin.</p>
      </section>
    );
  }

  const myTeam       = league.teams.find(t => t.id === myTeamId);
  const scoutingData = myTeam?.scoutingData ?? {};
  const draftBoard   = myTeam?.draftBoard   ?? [];

  const currentSlot = draft.slots[draft.currentSlotIdx];
  const isMyTurn    = !draft.complete && currentSlot?.teamId === myTeamId;
  const isCpuTurn   = !draft.complete && !isMyTurn;
  const myTeamName  = myTeam?.name ?? 'Your Team';

  // Next user pick slot (for "your next pick" info)
  const nextUserSlot = draft.slots.find(
    (s, i) => i >= draft.currentSlotIdx && s.teamId === myTeamId && !s.playerId,
  );

  // Cross-reference helper: prospect data for a draft player
  function prospectInfo(player: Player) {
    const pid = player.prospectId;
    if (!pid) return null;
    const state = scoutingData[pid];
    const boardIdx = draftBoard.indexOf(pid);
    return {
      boardRank:  boardIdx >= 0 ? boardIdx + 1 : null,  // 1-based, null if not on board
      report:     state?.report ?? null,
    };
  }

  // Prospect board
  const positions = ['ALL', ...Array.from(new Set(draft.players.map(p => p.position))).sort()];
  let prospects = [...draft.players];
  if (posFilter !== 'ALL') prospects = prospects.filter(p => p.position === posFilter);

  // Sort
  if (sortBy === 'board') {
    prospects = prospects.sort((a, b) => {
      const aRank = a.prospectId ? draftBoard.indexOf(a.prospectId) : -1;
      const bRank = b.prospectId ? draftBoard.indexOf(b.prospectId) : -1;
      // Board-ranked first (ascending rank), then by OVR
      if (aRank >= 0 && bRank < 0) return -1;
      if (aRank < 0 && bRank >= 0) return 1;
      if (aRank >= 0 && bRank >= 0) return aRank - bRank;
      return b.scoutedOverall - a.scoutedOverall;
    });
  } else if (sortBy === 'ovr') {
    prospects = prospects.sort((a, b) => b.scoutedOverall - a.scoutedOverall);
  } else {
    prospects = prospects.sort((a, b) => a.position.localeCompare(b.position) || b.scoutedOverall - a.scoutedOverall);
  }

  // Recent picks (last 12, newest first)
  const recentPicks: DraftSlot[] = draft.slots
    .slice(0, draft.currentSlotIdx)
    .filter(s => s.playerId)
    .slice(-12)
    .reverse();

  // All completed picks for results view
  const completedPicks = draft.slots.filter(s => s.playerId);

  function tierLabel(ovr: number): string {
    if (ovr >= 70) return '★';
    if (ovr >= 57) return '◆';
    return '·';
  }

  const ROUNDS = [1, 2, 3, 4, 5, 6, 7];
  const totalCols = isMyTurn ? 9 : 8; // extra col for Draft button

  return (
    <section className="panel draft-event-panel">
      {/* ── Header ── */}
      <div className="draft-header">
        <h2>{draft.year} Draft
          <span className="draft-phase-badge">
            {draft.complete ? ' — Complete' : ` — Round ${currentSlot?.round ?? '?'}`}
          </span>
        </h2>
        <div className="draft-header-actions">
          {!draft.complete && (
            <button className="btn-sm" disabled={busy} onClick={onSimDraft}>Sim All Remaining</button>
          )}
          {draft.complete && (
            <button className="advance-btn" disabled={busy} onClick={onAdvance}>
              {busy ? 'Loading…' : 'Start Season →'}
            </button>
          )}
          <button
            className={`btn-sm${showResults ? ' active' : ''}`}
            onClick={() => setShowResults(v => !v)}
          >
            Results ({completedPicks.length}/{draft.slots.length})
          </button>
        </div>
      </div>

      {/* ── On-clock status bar ── */}
      {!draft.complete && currentSlot && (
        <div className={`draft-onclock${isMyTurn ? ' draft-onclock-user' : ''}`}>
          <div className="draft-onclock-info">
            <span className="draft-onclock-label">
              Round {currentSlot.round}, Pick {currentSlot.pick} (Overall #{currentSlot.overallPick})
            </span>
            <span className="draft-onclock-team">
              {isMyTurn
                ? `${myTeamName} — YOUR PICK`
                : `On the clock: ${currentSlot.teamName}`}
            </span>
            {isCpuTurn && nextUserSlot && (
              <span className="draft-next-user">
                Your next pick: Rd {nextUserSlot.round}, Pk {nextUserSlot.pick} (#{nextUserSlot.overallPick})
              </span>
            )}
          </div>
          {isCpuTurn && (
            <div className="draft-cpu-actions">
              <button className="btn-sm" disabled={busy} onClick={onAdvanceOnePick}>
                Advance One Pick
              </button>
              <button className="btn-sm btn-positive" disabled={busy} onClick={onAdvanceToMyPick}>
                Skip to My Pick
              </button>
            </div>
          )}
        </div>
      )}
      {draft.complete && (
        <div className="draft-onclock">
          <span className="draft-onclock-label">Draft Complete — {completedPicks.length} picks made</span>
          <span className="draft-onclock-team">Click "Start Season" to begin the regular season.</span>
        </div>
      )}

      {/* ── Draft Results (toggle) ── */}
      {showResults && (
        <div className="draft-results-panel">
          <h3>Draft Results</h3>
          {ROUNDS.map(round => {
            const roundPicks = draft.slots.filter(s => s.round === round && s.playerId);
            return (
              <details key={round} open={round <= 2}>
                <summary className="draft-results-round">
                  Round {round} <span className="muted">({roundPicks.length} picks)</span>
                </summary>
                {roundPicks.length > 0 ? (
                  <table className="draft-table draft-results-table">
                    <thead>
                      <tr><th>#</th><th>Team</th><th>Pos</th><th>Player</th></tr>
                    </thead>
                    <tbody>
                      {roundPicks.map(s => (
                        <tr key={s.overallPick} className={s.teamId === myTeamId ? 'draft-log-user' : ''}>
                          <td className="muted">{s.overallPick}</td>
                          <td>{s.teamName}</td>
                          <td>{s.playerPos}</td>
                          <td className="draft-name">{s.playerName}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="muted" style={{ padding: '0.4rem 0.75rem' }}>No picks yet.</p>
                )}
              </details>
            );
          })}
        </div>
      )}

      <div className="draft-layout">
        {/* ── Available Prospects ── */}
        <div className="draft-board">
          <div className="draft-board-header">
            <span className="draft-board-title">
              Available ({draft.players.length})
            </span>
            <div className="draft-board-filters">
              <select value={posFilter} onChange={e => setPosFilter(e.target.value)}>
                {positions.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <button className={`btn-sm${sortBy === 'board' ? ' active' : ''}`} onClick={() => setSortBy('board')}>Board</button>
              <button className={`btn-sm${sortBy === 'ovr'   ? ' active' : ''}`} onClick={() => setSortBy('ovr')}>OVR</button>
              <button className={`btn-sm${sortBy === 'pos'   ? ' active' : ''}`} onClick={() => setSortBy('pos')}>Pos</button>
            </div>
          </div>
          <div className="draft-board-scroll">
            <table className="draft-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Bd</th>
                  <th>Name</th>
                  <th>Pos</th>
                  <th>Age</th>
                  <th>OVR</th>
                  <th>College</th>
                  <th>Scout</th>
                  {isMyTurn && <th></th>}
                </tr>
              </thead>
              <tbody>
                {prospects.slice(0, 100).map(p => {
                  const info    = prospectInfo(p);
                  const grade   = info?.report?.grade ?? null;
                  const projRd  = info?.report?.projectedRound ?? null;
                  const bdRank  = info?.boardRank ?? null;
                  return (
                    <tr key={p.id} className={`draft-prospect-row${bdRank ? ' draft-on-board' : ''}`}>
                      <td className="draft-tier">{tierLabel(p.scoutedOverall)}</td>
                      <td className="draft-bd-rank">{bdRank ? `#${bdRank}` : '—'}</td>
                      <td className="draft-name">{p.name}</td>
                      <td>{p.position}</td>
                      <td>{p.age}</td>
                      <td className="draft-ovr">{p.scoutedOverall}</td>
                      <td className="draft-college">{p.college ?? '—'}</td>
                      <td className="draft-scout-cell">
                        {grade ? (
                          <span title={projRd ? `Proj Rd ${projRd.min}–${projRd.max}` : ''}>
                            {grade}
                            {projRd && <span className="proj-rd-mini"> Rd{projRd.min}</span>}
                          </span>
                        ) : '—'}
                      </td>
                      {isMyTurn && (
                        <td>
                          <button className="btn-sm btn-positive" disabled={busy} onClick={() => onPick(p.id)}>
                            Draft
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {prospects.length > 100 && (
                  <tr>
                    <td colSpan={totalCols} className="muted" style={{ padding: '0.5rem', textAlign: 'center' }}>
                      +{prospects.length - 100} more — use position filter to narrow
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Recent Picks Log ── */}
        <div className="draft-log">
          <div className="draft-log-title">Recent Picks</div>
          {recentPicks.length === 0 && (
            <p className="muted" style={{ padding: '0.5rem' }}>No picks yet.</p>
          )}
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

// ── Scouting View ──────────────────────────────────────────────────────────────

function ScoutingView({ draftClass, myTeam, busy, onScout }: {
  draftClass: NonNullable<League['draftClass']>;
  myTeam: import('./types').Team;
  busy: boolean;
  onScout: (prospectId: string) => void;
}) {
  const [posFilter, setPosFilter] = useState<string>('ALL');
  const [expanded, setExpanded] = useState<string | null>(null);

  const scoutingData = myTeam.scoutingData ?? {};
  const scoutingPoints = myTeam.scoutingPoints ?? 0;
  const scout = myTeam.scout;

  const positions = ['ALL', ...Array.from(new Set(draftClass.prospects.map(p => p.position))).sort()];
  const filtered = draftClass.prospects.filter(p => posFilter === 'ALL' || p.position === posFilter);

  const COSTS = [10, 20, 35];
  const LEVEL_LABELS = ['Unscouted', 'Level 1', 'Level 2', 'Level 3 (Full)'];

  function confidenceLabel(c: ScoutingReport['confidence']): string {
    return c === 'low' ? 'Low Conf.' : c === 'medium' ? 'Med Conf.' : 'High Conf.';
  }

  return (
    <section className="panel scouting-panel">
      <div className="scouting-header">
        <div>
          <h2>Scouting</h2>
          {scout && <p className="muted">Scout: {scout.name} (OVR {scout.overall})</p>}
        </div>
        <div className="scouting-points">
          <span className="points-val">{scoutingPoints}</span>
          <span className="points-lbl"> pts remaining</span>
        </div>
      </div>

      <div className="scouting-filters">
        {positions.map(pos => (
          <button
            key={pos}
            className={posFilter === pos ? 'active' : ''}
            onClick={() => setPosFilter(pos)}
          >{pos}</button>
        ))}
      </div>

      <div className="prospect-list">
        {filtered.map(p => {
          const state: ProspectScoutingState | undefined = scoutingData[p.id];
          const level = state?.scoutLevel ?? 0;
          const report = state?.report ?? null;
          const nextCost = level < 3 ? COSTS[level] : null;
          const isOpen = expanded === p.id;

          return (
            <div key={p.id} className={`prospect-row${isOpen ? ' open' : ''}`}>
              <div className="prospect-summary" onClick={() => setExpanded(isOpen ? null : p.id)}>
                <span className="prospect-pos">{p.position}</span>
                <span className="prospect-name">{p.name}</span>
                <span className="prospect-meta">{p.college} · Age {p.age}</span>
                <span className={`scout-level-badge level-${level}`}>{LEVEL_LABELS[level]}</span>
                {report && (
                  <span className="proj-round">
                    Rd {report.projectedRound.min}–{report.projectedRound.max}
                  </span>
                )}
                <span className="expand-arrow">{isOpen ? '▲' : '▼'}</span>
              </div>

              {isOpen && (
                <div className="prospect-detail">
                  <div className="prospect-detail-top">
                    <span className="muted">{p.height} · {p.weight} lbs</span>
                    {nextCost !== null && (
                      <button
                        className="btn-scout"
                        disabled={busy || scoutingPoints < nextCost}
                        onClick={() => onScout(p.id)}
                      >
                        Scout ({nextCost} pts)
                      </button>
                    )}
                    {nextCost === null && <span className="muted">Fully scouted</span>}
                  </div>
                  {report ? (
                    <div className="scout-report">
                      <div className="report-row">
                        <span className="report-grade">{report.grade}</span>
                        <span className={`report-conf ${report.confidence}`}>{confidenceLabel(report.confidence)}</span>
                        <span className="muted">Proj Rd {report.projectedRound.min}–{report.projectedRound.max}</span>
                      </div>
                      {report.strengths.length > 0 && (
                        <div className="report-section">
                          <span className="report-label strength-lbl">Strengths:</span>
                          {report.strengths.map((s, i) => <span key={i} className="report-tag strength">{s}</span>)}
                        </div>
                      )}
                      {report.weaknesses.length > 0 && (
                        <div className="report-section">
                          <span className="report-label weakness-lbl">Concerns:</span>
                          {report.weaknesses.map((w, i) => <span key={i} className="report-tag weakness">{w}</span>)}
                        </div>
                      )}
                      {report.notes && <p className="report-notes">{report.notes}</p>}
                    </div>
                  ) : (
                    <p className="muted">No scouting report yet. Scout this prospect to reveal information.</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Draft Board View ───────────────────────────────────────────────────────────

function DraftBoardView({ draftClass, myTeam, onUpdateBoard }: {
  draftClass: NonNullable<League['draftClass']>;
  myTeam: import('./types').Team;
  onUpdateBoard: (board: string[]) => void;
}) {
  const draftBoard = myTeam.draftBoard ?? [];
  const scoutingData = myTeam.scoutingData ?? {};

  const onBoard = draftBoard
    .map(id => draftClass.prospects.find(p => p.id === id))
    .filter((p): p is ClientProspect => !!p);
  const unranked = draftClass.prospects.filter(p => !draftBoard.includes(p.id));

  function addToBoard(prospectId: string) {
    onUpdateBoard([...draftBoard, prospectId]);
  }

  function removeFromBoard(prospectId: string) {
    onUpdateBoard(draftBoard.filter(id => id !== prospectId));
  }

  function moveUp(idx: number) {
    if (idx === 0) return;
    const next = [...draftBoard];
    [next[idx - 1], next[idx]] = [next[idx]!, next[idx - 1]!];
    onUpdateBoard(next);
  }

  function moveDown(idx: number) {
    if (idx >= draftBoard.length - 1) return;
    const next = [...draftBoard];
    [next[idx + 1], next[idx]] = [next[idx]!, next[idx + 1]!];
    onUpdateBoard(next);
  }

  function projRange(p: ClientProspect): string {
    const state = scoutingData[p.id];
    if (!state?.report) return '—';
    const { min, max } = state.report.projectedRound;
    return min === max ? `Rd ${min}` : `Rd ${min}–${max}`;
  }

  return (
    <section className="panel draft-board-panel">
      <h2>Draft Board</h2>
      <p className="muted">{onBoard.length} ranked · {unranked.length} unranked</p>

      {onBoard.length > 0 && (
        <div className="draft-board-list">
          <div className="draft-board-header-row">
            <span>#</span><span>Pos</span><span>Name</span><span>College</span><span>Proj</span><span></span>
          </div>
          {onBoard.map((p, idx) => (
            <div key={p.id} className="draft-board-row ranked">
              <span className="board-rank">{idx + 1}</span>
              <span className="prospect-pos">{p.position}</span>
              <span className="prospect-name">{p.name}</span>
              <span className="muted">{p.college}</span>
              <span className="proj-round">{projRange(p)}</span>
              <span className="board-actions">
                <button onClick={() => moveUp(idx)} disabled={idx === 0}>↑</button>
                <button onClick={() => moveDown(idx)} disabled={idx === onBoard.length - 1}>↓</button>
                <button className="btn-remove" onClick={() => removeFromBoard(p.id)}>✕</button>
              </span>
            </div>
          ))}
        </div>
      )}

      {unranked.length > 0 && (
        <>
          <h3 className="board-section-title">Unranked Prospects</h3>
          <div className="draft-board-list unranked">
            {unranked.map(p => (
              <div key={p.id} className="draft-board-row">
                <span></span>
                <span className="prospect-pos">{p.position}</span>
                <span className="prospect-name">{p.name}</span>
                <span className="muted">{p.college}</span>
                <span className="proj-round">{projRange(p)}</span>
                <span className="board-actions">
                  <button onClick={() => addToBoard(p.id)}>+ Add</button>
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
