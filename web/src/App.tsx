import { useState, useEffect, useRef, useMemo } from 'react';
import { deriveBoxScore } from './boxScore';
import { generateRecap, formatDriveSummary, generateScoutingReport, evaluateGameplan, generateSeasonGrade, generateSeasonSummary } from './gameRecap';
import { generateWeeklyReport } from './weeklyReport';
import { generateGameplanRecommendation } from './gameplanRec';
import { aggregateSeasonStats, type SeasonPlayerStats } from './seasonStats';
import { DashboardSchedule } from './DashboardSchedule';
import { PlaybooksView } from './views/PlaybooksView';
import { FieldView } from './FieldView';
import { TeamLogo } from './TeamLogo';
import { computeMomentum } from './momentum';
import { computeDriveStats, formatDriveTime } from './driveTracker';
import { generateHighlights } from './highlights';
import { generateLeagueAlerts, getActiveAlerts, type LeagueAlert } from './leagueAlerts';
import {
  listLeagues, createLeague, joinLeague, fetchLeague, advanceWeek,
  claimTeam as claimTeamApi, proposeTrade as proposeTradeApi, respondTrade as respondTradeApi,
  extendPlayer as extendPlayerApi, releasePlayer as releasePlayerApi,
  setDepthChart as setDepthChartApi,
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
import { computeStandings, CAP_LIMIT, getVisibleRatings, type League, type Standing, type Game, type Player, type PlayEvent, type TradeProposal, type TradeAsset, type Activity, type PlayoffBracket, type SeasonRecord, type Division, type DraftSlot, type NewsItem, type ClientProspect, type ScoutingReport, type LeagueHistory, type AwardRecord, type PlayerSeasonHistoryLine, type RetiredPlayerRecord, type PlayerSeasonStats, type HallOfFameEntry, type LegacyTier, type Coach, type CoachPersonality, type CoachTrait, type RingOfHonorEntry, type GmCareer, type FrontOfficePersonality } from './types';
import { EmptyState, LoadingState, TabBar } from './components/ui';
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
        <LoadingState message="Restoring session…" />
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
    <div className="auth-screen">
      <div className="auth-bg" />
      <div className="auth-card">
        <div className="auth-brand">
          <h1 className="auth-title">Gridiron</h1>
          <p className="auth-subtitle">Football Simulation League</p>
        </div>
        <div className="auth-mode-toggle">
          <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Log In</button>
          <button className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')}>Sign Up</button>
        </div>
        <form onSubmit={submit} className="auth-form">
          <label className="auth-label">
            <span>Username</span>
            <input value={username} onChange={e => setUsername(e.target.value)} autoFocus placeholder="Enter username" />
          </label>
          <label className="auth-label">
            <span>Password</span>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter password" />
          </label>
          {error && <div className="form-error">{error}</div>}
          <button type="submit" className="auth-submit" disabled={busy}>
            {busy ? 'Working…' : mode === 'login' ? 'Log In' : 'Create Account'}
          </button>
        </form>
        <p className="auth-footer">
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button className="auth-switch" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
            {mode === 'login' ? 'Sign Up' : 'Log In'}
          </button>
        </p>
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
        {summaries === null && <LoadingState />}
        {summaries?.length === 0 && <EmptyState message="No leagues yet. Create or join one to get started." compact />}
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
        {leagues === null && !error && <LoadingState />}
        {leagues?.length === 0 && <EmptyState message="No public leagues yet. Create one!" compact />}
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
  const [tab, setTab] = useState<'dashboard' | 'standings' | 'playoffs' | 'leaders' | 'roster' | 'depth' | 'injuries' | 'free-agents' | 'team' | 'contracts' | 'trades' | 'activity' | 'draft' | 'news' | 'commissioner' | 'gameplan' | 'playbooks' | 'coaching' | 'scouting' | 'college' | 'draft-board' | 'awards' | 'history' | 'hof' | 'legacy' | 'gm' | 'game-center'>('dashboard');
  const [rosterTeamId, setRosterTeamId] = useState(myTeamId);
  const [detailPlayerId, setDetailPlayerId] = useState<string | null>(null);
  const [watchedGameId, setWatchedGameId] = useState<string | null>(null);
  const [scoutFocusId, setScoutFocusId] = useState<string | null>(null);

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

  async function handleExtendPlayer(playerId: string) {
    setBusy(true); setError(null);
    try { setLeague(await extendPlayerApi(leagueId, playerId)); }
    catch (e) { setError(friendlyError(e)); }
    finally { setBusy(false); }
  }

  function handleWatchGame(gameId: string) {
    setWatchedGameId(gameId);
    setError(null);
    setTab('game-center');
  }

  function handleSimGame() { action(advanceWeek); }

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
      if (round === 'conference')   return 'Sim Conference Championship';
      if (round === 'championship') return 'Sim League Championship';
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

  const inRosterSection = tab === 'roster' || tab === 'depth' || tab === 'injuries' || tab === 'free-agents';
  const inGmSection     = tab === 'team' || tab === 'contracts' || tab === 'trades' || tab === 'coaching' || tab === 'legacy' || tab === 'gm' || tab === 'playbooks';

  return (
    <div className="app-shell">
      {/* ── Top nav bar ─────────────────────────────────────────── */}
      <header className="top-nav">
        <div className="top-nav-inner">
          <div className="top-nav-brand">
            <button className="top-nav-back" onClick={onLeave} title="My Leagues">←</button>
            <span className="top-nav-title">{league.displayName}</span>
            <span className="top-nav-season">{league.currentSeason.year} · {phaseLabel()}</span>
          </div>

          <nav className="top-nav-tabs">
            {/* ── Team Management ──────────────────────── */}
            <button className={tab === 'dashboard' ? 'active' : ''} onClick={() => setTab('dashboard')}>Dashboard</button>
            <button className={inGmSection     ? 'active' : ''} onClick={() => setTab('team')}>GM</button>
            <button className={inRosterSection  ? 'active' : ''} onClick={() => setTab('roster')}>Roster</button>

            <span className="nav-sep" />

            {/* ── League ───────────────────────────────── */}
            <button className={tab === 'standings' ? 'active' : ''} onClick={() => setTab('standings')}>Standings</button>
            <button className={tab === 'leaders'   ? 'active' : ''} onClick={() => setTab('leaders')}>Leaders</button>
            <button className={tab === 'news' ? 'active' : ''} onClick={() => setTab('news')}>News</button>
            {hasPlayoffs && (
              <button className={tab === 'playoffs' ? 'active' : ''} onClick={() => setTab('playoffs')}>
                {league.phase === 'postseason' ? 'Playoffs' : 'Offseason'}
              </button>
            )}

            <span className="nav-sep" />

            {/* ── Scouting & Draft ─────────────────────── */}
            {(league.phase === 'draft' || league.draft) && (
              <button className={tab === 'draft' ? 'active' : ''} onClick={() => setTab('draft')}>
                Draft{league.draft && !league.draft.complete && <span className="badge">!</span>}
              </button>
            )}
            {league.collegeData && (
              <button className={tab === 'college' ? 'active' : ''} onClick={() => setTab('college')}>College</button>
            )}
            {league.draftClass && (
              <button className={tab === 'scouting' ? 'active' : ''} onClick={() => setTab('scouting')}>Scouting</button>
            )}
            {league.draftClass && (
              <button className={tab === 'draft-board' ? 'active' : ''} onClick={() => setTab('draft-board')}>Board</button>
            )}

            <span className="nav-sep" />

            {/* ── History & Legacy ─────────────────────── */}
            <button className={tab === 'awards'    ? 'active' : ''} onClick={() => setTab('awards')}>Awards</button>
            <button className={tab === 'history'   ? 'active' : ''} onClick={() => setTab('history')}>History</button>
            <button className={tab === 'hof'       ? 'active' : ''} onClick={() => setTab('hof')}>Hall of Fame</button>

            {/* ── Admin ────────────────────────────────── */}
            {isCommissioner && (
              <>
                <span className="nav-sep" />
                <button className={tab === 'commissioner' ? 'active' : ''} onClick={() => setTab('commissioner')}>Commissioner</button>
              </>
            )}
          </nav>

          <div className="top-nav-actions">
            <span className="top-nav-user">{username}</span>
            {isCommissioner && (
              <button
                className="advance-btn"
                disabled={busy || advanceBtnLabel() === 'Season Complete' || advanceBtnLabel() === 'Draft In Progress'}
                onClick={() => action(advanceWeek)}
              >
                {busy ? 'Simulating…' : advanceBtnLabel()}
              </button>
            )}
            <button className="btn-sm" onClick={onMyLeagues}>My Leagues</button>
          </div>
        </div>
      </header>

      {/* ── Contextual sub-nav ──────────────────────────────────── */}
      {inRosterSection && (
        <div className="sub-nav">
          <div className="sub-nav-inner">
            <button className={tab === 'roster'      ? 'active' : ''} onClick={() => setTab('roster')}>Roster</button>
            <button className={tab === 'depth'       ? 'active' : ''} onClick={() => setTab('depth')}>Depth Chart</button>
            <button className={tab === 'injuries'    ? 'active' : ''} onClick={() => setTab('injuries')}>Injuries</button>
            <button className={tab === 'free-agents' ? 'active' : ''} onClick={() => setTab('free-agents')}>Free Agents</button>
          </div>
        </div>
      )}
      {inGmSection && (
        <div className="sub-nav">
          <div className="sub-nav-inner">
            <button className={tab === 'team'      ? 'active' : ''} onClick={() => setTab('team')}>Overview</button>
            <button className={tab === 'contracts' ? 'active' : ''} onClick={() => setTab('contracts')}>Contracts</button>
            <button className={tab === 'trades'    ? 'active' : ''} onClick={() => setTab('trades')}>
              Trades{pendingTrades > 0 && <span className="badge">{pendingTrades}</span>}
            </button>
            <button className={tab === 'coaching'  ? 'active' : ''} onClick={() => setTab('coaching')}>Coaching</button>
            <button className={tab === 'playbooks' ? 'active' : ''} onClick={() => setTab('playbooks')}>Playbooks</button>
            <button className={tab === 'legacy'    ? 'active' : ''} onClick={() => setTab('legacy')}>Ring of Honor</button>
            {league.gmCareer && (
              <button className={tab === 'gm' ? 'active' : ''} onClick={() => setTab('gm')}>GM Career</button>
            )}
          </div>
        </div>
      )}

      {error && <div className="app-content"><div className="error">{error}</div></div>}

      <div className="app-layout">

      {/* ── Persistent League Feed (left sidebar) ─────────────── */}
      <aside className="app-feed">
        <div className="app-feed-header">
          <span className="app-feed-title">League Feed</span>
          <button className="app-feed-link" onClick={() => setTab('news')}>All →</button>
        </div>
        <div className="app-feed-scroll">
          {(() => {
            const allNews = (league.news ?? []).slice().sort((a, b) => b.createdAt - a.createdAt);
            const feedNews = [
              ...allNews.filter(n =>  n.teamIds.includes(myTeamId)).slice(0, 6),
              ...allNews.filter(n => !n.teamIds.includes(myTeamId)).slice(0, 14),
            ].slice(0, 18);
            if (feedNews.length === 0) return <div className="app-feed-empty">League is live. Advance the week to simulate games and generate news.</div>;
            return feedNews.map(n => {
              const src = FEED_SOURCE[n.type] ?? { name: 'NFL', handle: 'nfl', avatar: '🏈' };
              const isMine = n.teamIds.includes(myTeamId);
              return (
                <div key={n.id} className={`app-feed-item${isMine ? ' app-feed-mine' : ''}`}>
                  <div className="app-feed-item-header">
                    <span className="app-feed-avatar">{src.avatar}</span>
                    <span className="app-feed-source">{src.name}</span>
                    <span className="app-feed-time muted">{fmtNewsAge(n.createdAt)}</span>
                  </div>
                  <div className="app-feed-headline">{n.headline}</div>
                  {n.body && <div className="app-feed-body muted">{n.body}</div>}
                  <div className="app-feed-meta">
                    <span className={`news-badge ${NEWS_TYPE_CLASS[n.type] ?? ''}`}>{NEWS_TYPE_LABEL[n.type] ?? n.type}</span>
                    <span className="app-feed-week muted">Wk {n.week}</span>
                    {isMine && <span className="app-feed-mine-tag">Your Team</span>}
                  </div>
                </div>
              );
            });
          })()}
        </div>
      </aside>

      {/* ── Main content area ──────────────────────────────────── */}
      <div className="app-main">

      {tab === 'dashboard' && (
        <DashboardView
          league={league}
          myTeamId={myTeamId}
          standings={standings}
          busy={busy}
          isCommissioner={isCommissioner}
          onNavTo={setTab as (t: string) => void}
          onWatchGame={handleWatchGame}
          onSimGame={handleSimGame}
          onViewPlayer={handleViewPlayer}
          onViewTeam={(teamId) => { setRosterTeamId(teamId); setTab('roster'); }}
        />
      )}
      {tab === 'standings' && (
        <StandingsView standings={standings} userTeamId={myTeamId} divisions={league.divisions ?? []} onViewTeam={(teamId) => { setRosterTeamId(teamId); setTab('roster'); }} />
      )}
      {tab === 'playoffs' && !isRegularSeason && (
        <PlayoffView
          playoff={league.playoff}
          teams={league.teams}
          seasonHistory={league.seasonHistory}
          history={league.history}
          league={league}
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
          onViewTeam={(teamId) => { setRosterTeamId(teamId); setTab('roster'); }}
        />
      )}
      {tab === 'awards'  && (
        <AwardsView history={league.history} myTeamId={myTeamId} onViewPlayer={handleViewPlayer} />
      )}
      {tab === 'history' && (
        <HistoryView history={league.history} teams={league.teams} myTeamId={myTeamId} onViewPlayer={handleViewPlayer} />
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
      {tab === 'game-center' && (
        <GameCenterView
          league={league}
          myTeamId={myTeamId}
          watchedGameId={watchedGameId}
          onBack={() => setTab('dashboard')}
          onViewPlayer={handleViewPlayer}
        />
      )}
      {tab === 'depth' && (
        <DepthChartView
          team={league.teams.find(t => t.id === myTeamId)!}
          busy={busy}
          onReorder={handleSetDepthChart}
          onViewPlayer={handleViewPlayer}
        />
      )}
      {tab === 'injuries' && (
        <InjuryReportView teams={league.teams} userTeamId={myTeamId} onViewPlayer={handleViewPlayer} />
      )}
      {tab === 'free-agents' && (
        <FreeAgentsView
          league={league}
          myTeamId={myTeamId}
          busy={busy}
          onOffer={handleOfferContract}
          onViewPlayer={handleViewPlayer}
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
          onViewPlayer={handleViewPlayer}
        />
      )}
      {tab === 'draft' && (
        <DraftView
          league={league}
          myTeamId={myTeamId}
          leagueId={leagueId}
          busy={busy}
          onPick={handleDraftPick}
          onSimDraft={handleSimDraft}
          onAdvance={() => action(advanceWeek)}
          onAdvanceOnePick={handleAdvanceDraftPick}
          onAdvanceToMyPick={handleAdvanceToUserPick}
          onLeagueUpdated={setLeague}
        />
      )}
      {tab === 'college' && league.collegeData && (
        <CollegeView
          data={league.collegeData}
          prospects={league.draftClass?.prospects ?? []}
          scoutingData={league.teams.find(t => t.id === myTeamId)?.scoutingData ?? {}}
          scoutingPoints={league.teams.find(t => t.id === myTeamId)?.scoutingPoints ?? 0}
          busy={busy}
          onScout={handleScoutProspect}
          onViewInScouting={(prospectId) => { setTab('scouting'); setScoutFocusId(prospectId); }}
        />
      )}
      {tab === 'scouting' && league.draftClass && (
        <ScoutingView
          draftClass={league.draftClass}
          myTeam={league.teams.find(t => t.id === myTeamId)!}
          busy={busy}
          onScout={handleScoutProspect}
          focusProspectId={scoutFocusId}
          onFocusConsumed={() => setScoutFocusId(null)}
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
      {tab === 'coaching'  && <CoachingView  team={league.teams.find(t => t.id === myTeamId)!} league={league} leagueId={leagueId} onLeagueUpdated={setLeague} />}
      {tab === 'playbooks' && <PlaybooksView team={league.teams.find(t => t.id === myTeamId)!} league={league} leagueId={leagueId} onLeagueUpdated={setLeague} />}

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
      </div>{/* end app-main */}
      </div>{/* end app-layout */}
    </div>
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
  coach, role, isOffseason, onFire, onHire, onPromote, unemployed, schemeMatch, busy: cardBusy,
}: {
  coach: Coach | null;
  role: 'HC' | 'OC' | 'DC';
  isOffseason: boolean;
  onFire?: () => void;
  onHire?: (coachId: string) => void;
  onPromote?: () => void;
  unemployed: Coach[];
  schemeMatch?: boolean;
  busy?: boolean;
}) {
  const [showPool, setShowPool] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const roleLabel = role === 'HC' ? 'Head Coach' : role === 'OC' ? 'Offensive Coordinator' : 'Defensive Coordinator';

  if (!coach) {
    const candidates = unemployed.filter(c => c.role === role || role !== 'HC');
    return (
      <div className="staff-card staff-card--vacant">
        <div className="staff-card-role-tag">{role}</div>
        <div className="staff-card-body">
          <div className="staff-card-name-row">
            <span className="staff-card-vacant-name">Vacant</span>
            <span className="ui-badge ui-badge--danger">Open</span>
          </div>
          <div className="muted" style={{ fontSize: 'var(--text-xs)' }}>{roleLabel}</div>
        </div>
        {isOffseason && (
          <div className="staff-card-actions">
            {role !== 'HC' && <button className="btn-sm" disabled={cardBusy} onClick={onPromote}>Promote</button>}
            <button className="btn-sm btn-primary" disabled={cardBusy} onClick={() => setShowPool(v => !v)}>
              {showPool ? 'Hide' : 'Hire'}
            </button>
          </div>
        )}
        {showPool && (
          <div className="staff-pool">
            {candidates.length === 0
              ? <EmptyState message="No candidates available." compact />
              : candidates.map(c => (
                  <div key={c.id} className="staff-pool-row">
                    <span className="staff-pool-name">{c.name}</span>
                    <span className="ovr-cell">{c.overall}</span>
                    <span className="muted">{(c.offensiveScheme ?? c.defensiveScheme ?? '').replace(/_/g, ' ')}</span>
                    {c.trait && <span className="coach-trait-badge">{traitLabel(c.trait)}</span>}
                    <button className="btn-sm btn-primary" disabled={cardBusy} onClick={() => onHire?.(c.id)}>Hire</button>
                  </div>
                ))
            }
          </div>
        )}
      </div>
    );
  }

  const scheme = role === 'OC' ? coach.offensiveScheme : role === 'DC' ? coach.defensiveScheme : undefined;
  const offScheme = role === 'HC' ? coach.offensiveScheme : undefined;
  const defScheme = role === 'HC' ? coach.defensiveScheme : undefined;

  return (
    <div className={`staff-card${role === 'HC' ? ' staff-card--hc' : ''}`}>
      <div className="staff-card-role-tag">{role}</div>
      <div className="staff-card-body">
        <div className="staff-card-name-row">
          <button className="entity-link staff-card-coach-name" onClick={() => setExpanded(v => !v)}>{coach.name}</button>
          <span className={`staff-card-ovr${coach.overall >= 80 ? ' ovr-elite' : coach.overall < 60 ? ' ovr-low' : ''}`}>{coach.overall}</span>
        </div>
        <div className="staff-card-meta">
          {scheme && <span className="staff-card-scheme">{scheme.replace(/_/g, ' ')}</span>}
          {offScheme && <span className="staff-card-scheme">Off: {offScheme.replace(/_/g, ' ')}</span>}
          {defScheme && <span className="staff-card-scheme">Def: {defScheme.replace(/_/g, ' ')}</span>}
          {schemeMatch !== undefined && (
            <span className={`align-badge${schemeMatch ? ' align-yes' : ' align-no'}`}>
              {schemeMatch ? '✓ Aligned' : '✗ Mismatch'}
            </span>
          )}
        </div>
        <div className="staff-card-badges">
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
      </div>

      {expanded && (
        <div className="staff-profile">
          {coach.trait && (
            <div className="staff-profile-trait">
              <span className="staff-profile-trait-name">{traitLabel(coach.trait)}</span>
              <span className="staff-profile-trait-desc">{traitDesc(coach.trait)}</span>
            </div>
          )}
          <div className="staff-profile-grid">
            <div className="staff-profile-item"><span className="muted">Role</span> {roleLabel}</div>
            <div className="staff-profile-item"><span className="muted">Overall</span> {coach.overall}</div>
            {coach.personality && <div className="staff-profile-item"><span className="muted">Style</span> {personalityLabel(coach.personality)}</div>}
          </div>
        </div>
      )}

      {isOffseason && role !== 'HC' && (
        <div className="staff-card-actions">
          <button className="btn-sm btn-danger" disabled={cardBusy} onClick={onFire}>Fire</button>
        </div>
      )}
    </div>
  );
}

// PlaybooksView extracted to ./views/PlaybooksView.tsx

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

  const staffAvg = Math.round(([hc.overall, oc?.overall, dc?.overall].filter((v): v is number => v != null).reduce((s, v) => s + v, 0)) / [hc, oc, dc].filter(Boolean).length);
  const vacancies = [!oc && 'OC', !dc && 'DC'].filter(Boolean);

  return (
    <section className="roster-page">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="roster-header">
        <div className="roster-header-left">
          <h2 className="roster-title">Coaching Staff</h2>
        </div>
        <div className="roster-header-stats">
          <div className="roster-header-stat"><span className="roster-header-val">{staffAvg}</span><span className="roster-header-lbl">Staff Avg</span></div>
          <div className="roster-header-stat">
            <span className={`roster-header-val${hcOffMatch && hcDefMatch ? ' pos' : !hcOffMatch && !hcDefMatch ? ' neg' : ''}`}>
              {hcOffMatch && hcDefMatch ? '2/2' : hcOffMatch || hcDefMatch ? '1/2' : '0/2'}
            </span>
            <span className="roster-header-lbl">Aligned</span>
          </div>
          {vacancies.length > 0 && <div className="roster-header-stat"><span className="roster-header-val neg">{vacancies.length}</span><span className="roster-header-lbl">Vacant</span></div>}
          {isOffseason && <div className="roster-header-stat"><span className="roster-header-val">{unemployed.length}</span><span className="roster-header-lbl">Available</span></div>}
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      {/* ── Staff cards ────────────────────────────────────────── */}
      <div className="staff-grid">
        <CoachCard
          coach={hc} role="HC" isOffseason={isOffseason}
          onHire={id => handleHire(id, 'HC')}
          onPromote={undefined}
          unemployed={unemployed}
          busy={busy}
        />
        <CoachCard
          coach={oc} role="OC" isOffseason={isOffseason}
          onFire={() => handleFire('OC')}
          onHire={id => handleHire(id, 'OC')}
          onPromote={() => handlePromote('OC')}
          unemployed={unemployed}
          schemeMatch={oc ? hcOffMatch : undefined}
          busy={busy}
        />
        <CoachCard
          coach={dc} role="DC" isOffseason={isOffseason}
          onFire={() => handleFire('DC')}
          onHire={id => handleHire(id, 'DC')}
          onPromote={() => handlePromote('DC')}
          unemployed={unemployed}
          schemeMatch={dc ? hcDefMatch : undefined}
          busy={busy}
        />
      </div>

      {/* ── Scheme alignment note ──────────────────────────────── */}
      <div className="staff-alignment-note">
        <span className="muted">Scheme alignment between HC and coordinators grants a small play success bonus.</span>
      </div>

      {/* ── Coaching pool ──────────────────────────────────────── */}
      {isOffseason && unemployed.length > 0 && (
        <div className="roster-group">
          <div className="roster-group-header">
            <span className="roster-group-toggle">▾</span>
            <span className="roster-group-name">Available Coaches</span>
            <span className="roster-group-count">{unemployed.length}</span>
          </div>
          <table className="ui-table roster-table">
            <thead>
              <tr><th>Name</th><th>Role</th><th className="num">OVR</th><th>Scheme</th><th>Trait</th><th>Style</th></tr>
            </thead>
            <tbody>
              {unemployed.sort((a, b) => b.overall - a.overall).map(c => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td className="roster-pos-cell">{c.role}</td>
                  <td className={`num ovr-cell${c.overall >= 80 ? ' ovr-elite' : c.overall < 60 ? ' ovr-low' : ''}`}>{c.overall}</td>
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
        {members === null && !membersError && <LoadingState />}
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

function LeadersView({ games, teams, history, freeAgents, currentSeasonStats, onViewPlayer, onViewTeam }: {
  games: League['currentSeason']['games'];
  teams: League['teams'];
  history: LeagueHistory;
  freeAgents: Player[];
  currentSeasonStats: Record<string, PlayerSeasonStats>;
  onViewPlayer?: (id: string) => void;
  onViewTeam?: (teamId: string) => void;
}) {
  const [mode, setMode] = useState<'season' | 'career' | 'records'>('season');
  const stats        = aggregateSeasonStats(games);
  const allPlayers   = Object.values(stats);
  const gamesPlayed  = games.filter(g => g.status === 'final').length;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedPlayer = selectedId !== null ? (stats[selectedId] ?? null) : null;
  const abbrToId = useMemo(() => new Map(teams.map(t => [t.abbreviation, t.id])), [teams]);

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
  const tackleLeaders = cssEntries
    .filter(([, p]) => p.tackles > 0)
    .sort(([, a], [, b]) => b.tackles - a.tackles).slice(0, 10)
    .map(([id, p]) => ({ id, abbr: p.teamAbbreviation, val: p.tackles, name: nameMap.get(id)?.name ?? '?' }));

  function handleClick(id: string) {
    if (onViewPlayer) onViewPlayer(id);
    else setSelectedId(id);
  }
  function pBtn(id: string, name: string) {
    return <button className="pd-trigger" onClick={() => handleClick(id)}>{name}</button>;
  }
  function tBtn(abbr: string) {
    const tid = abbrToId.get(abbr);
    if (!tid || !onViewTeam) return <>{abbr}</>;
    return <button className="entity-link entity-link--team" onClick={() => onViewTeam(tid)}>{abbr}</button>;
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
          ? <EmptyState message="No games have been played yet." />
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
                    ? <tr><td colSpan={7}><EmptyState message="No data" compact /></td></tr>
                    : passers.map((p, i) => (
                      <tr key={p.playerId} className={i === 0 ? 'lc-top' : ''}>
                        <td className="col-rank">{i + 1}</td>
                        <td className="col-player">{pBtn(p.playerId, p.name)}</td>
                        <td className="col-team">{tBtn(p.teamAbbreviation)}</td>
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
                    ? <tr><td colSpan={7}><EmptyState message="No data" compact /></td></tr>
                    : rushers.map((p, i) => (
                      <tr key={p.playerId} className={i === 0 ? 'lc-top' : ''}>
                        <td className="col-rank">{i + 1}</td>
                        <td className="col-player">{pBtn(p.playerId, p.name)}</td>
                        <td className="col-team">{tBtn(p.teamAbbreviation)}</td>
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
                    ? <tr><td colSpan={7}><EmptyState message="No data" compact /></td></tr>
                    : receivers.map((p, i) => (
                      <tr key={p.playerId} className={i === 0 ? 'lc-top' : ''}>
                        <td className="col-rank">{i + 1}</td>
                        <td className="col-player">{pBtn(p.playerId, p.name)}</td>
                        <td className="col-team">{tBtn(p.teamAbbreviation)}</td>
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
                    ? <tr><td colSpan={7}><EmptyState message="No touchdowns yet" compact /></td></tr>
                    : tdLeaders.map((p, i) => (
                      <tr key={p.playerId} className={i === 0 ? 'lc-top' : ''}>
                        <td className="col-rank">{i + 1}</td>
                        <td className="col-player">{pBtn(p.playerId, p.name)}</td>
                        <td className="col-team">{tBtn(p.teamAbbreviation)}</td>
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
                        <td className="col-team">{tBtn(p.abbr)}</td>
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
                        <td className="col-team">{tBtn(p.abbr)}</td>
                        <td className="col-num col-primary">{p.val}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Tackles */}
            {tackleLeaders.length > 0 && (
              <div className="leaders-card">
                <div className="lc-header"><span className="lc-category">TACKLES</span><span className="lc-stat-label">TKL</span></div>
                <table className="leaders-table">
                  <thead><tr>
                    <th className="col-rank"></th><th className="col-player">Player</th><th className="col-team">Team</th>
                    <th className="col-num col-primary">TKL</th>
                  </tr></thead>
                  <tbody>
                    {tackleLeaders.map((p, i) => (
                      <tr key={p.id} className={i === 0 ? 'lc-top' : ''}>
                        <td className="col-rank">{i + 1}</td>
                        <td className="col-player">{pBtn(p.id, p.name)}</td>
                        <td className="col-team">{tBtn(p.abbr)}</td>
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
          : <EmptyState message="No historical data yet — complete a season first." />
      )}

      {mode === 'records' && (
        hasCareerData
          ? <SingleSeasonRecordsView records={seasonRecords} onViewPlayer={handleClick} />
          : <EmptyState message="No records yet — complete a season first." />
      )}

    </section>
  );
}

function CareerLeadersGrid({ leaders, onViewPlayer }: {
  leaders: CareerLeaderEntry[];
  onViewPlayer?: (id: string) => void;
}) {
  const passers   = [...leaders].filter(l => l.passingYards > 0).sort((a, b) => b.passingYards - a.passingYards).slice(0, 10);
  const rushers   = [...leaders].filter(l => l.rushingYards > 0).sort((a, b) => b.rushingYards - a.rushingYards).slice(0, 10);
  const receivers = [...leaders].filter(l => l.receivingYards > 0).sort((a, b) => b.receivingYards - a.receivingYards).slice(0, 10);
  const sackers   = [...leaders].filter(l => l.sacks > 0).sort((a, b) => b.sacks - a.sacks).slice(0, 10);
  const inters    = [...leaders].filter(l => l.interceptionsCaught > 0).sort((a, b) => b.interceptionsCaught - a.interceptionsCaught).slice(0, 10);

  function pBtn(l: CareerLeaderEntry) {
    return onViewPlayer
      ? <button className="pd-trigger" onClick={() => onViewPlayer(l.playerId)}>{l.name}</button>
      : <span>{l.name}</span>;
  }

  if (leaders.length === 0) return <EmptyState message="No career data yet." />;

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
  onViewPlayer?: (id: string) => void;
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
                      {onViewPlayer
                        ? <button className="pd-trigger" onClick={() => onViewPlayer(e.playerId)}>{e.name}</button>
                        : e.name}
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
  sacks: number; interceptionsCaught: number; tackles: number;
}

function buildGameLog(player: { playerId: string; name: string }, games: Game[]): GameLogRow[] {
  const rows: GameLogRow[] = [];
  for (const game of games) {
    if (game.status !== 'final') continue;
    const onHome = game.homeTeam.roster.some(p => p.id === player.playerId);
    const onAway = !onHome && game.awayTeam.roster.some(p => p.id === player.playerId);
    if (!onHome && !onAway) continue;

    const isHome    = onHome;
    const teamScore = isHome ? game.homeScore : game.awayScore;
    const oppScore  = isHome ? game.awayScore : game.homeScore;
    const meta = {
      week:         game.week,
      opponentAbbr: isHome ? game.awayTeam.abbreviation : game.homeTeam.abbreviation,
      homeAway:     (isHome ? 'H' : 'A') as 'H' | 'A',
      result:       (teamScore > oppScore ? 'W' : teamScore < oppScore ? 'L' : 'T') as 'W' | 'L' | 'T',
      teamScore,    oppScore,
    };

    // Prefer direct ID lookup in server box score (reliable, includes defense)
    const bsEntry = game.boxScore?.players[player.playerId];
    if (bsEntry) {
      rows.push({
        ...meta,
        completions: bsEntry.completions, attempts: bsEntry.attempts,
        passingYards: bsEntry.passingYards, passingTDs: bsEntry.passingTDs,
        interceptions: bsEntry.interceptions,
        carries: bsEntry.carries, rushingYards: bsEntry.rushingYards,
        rushingTDs: bsEntry.rushingTDs, targets: bsEntry.targets,
        receptions: bsEntry.receptions, receivingYards: bsEntry.receivingYards,
        receivingTDs: bsEntry.receivingTDs,
        sacks: bsEntry.sacks, interceptionsCaught: bsEntry.interceptionsCaught,
        tackles: bsEntry.tackles,
      });
      continue;
    }

    // Legacy fallback: name-based lookup in derived box score (no defense stats)
    const bs = deriveBoxScore(game);
    const nameToId = new Map<string, string>();
    for (const p of [...game.homeTeam.roster, ...game.awayTeam.roster]) {
      nameToId.set(p.name, p.id);
    }
    const pStats = Object.values(bs.players).find(s => nameToId.get(s.name) === player.playerId);
    if (!pStats) continue;
    rows.push({
      ...meta,
      completions: pStats.completions, attempts: pStats.attempts,
      passingYards: pStats.passingYards, passingTDs: pStats.passingTDs,
      interceptions: pStats.interceptions,
      carries: pStats.carries, rushingYards: pStats.rushingYards,
      rushingTDs: pStats.rushingTDs, targets: pStats.targets,
      receptions: pStats.receptions, receivingYards: pStats.receivingYards,
      receivingTDs: pStats.receivingTDs,
      sacks: 0, interceptionsCaught: 0, tackles: 0,
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
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);
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
  const hasSacks     = player.sacks     > 0;
  const hasDefINTs   = player.interceptionsCaught > 0;
  const hasTackles   = player.tackles   > 0;
  const hasDefense   = hasSacks || hasDefINTs || hasTackles;

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
  if (hasDefense) {
    if (hasTackles) glCols.push({ label: 'TKL', value: r => r.tackles });
    if (hasSacks)   glCols.push({ label: 'SCK', value: r => r.sacks, primary: !hasPassing && !hasRushing && !hasReceiving });
    if (hasDefINTs) glCols.push({ label: 'INT', value: r => r.interceptionsCaught });
  }

  // Accolade icons (placeholder until real icons)
  const ACCOLADE_ICON: Record<string, string> = {
    MVP: '🏆', OPOY: '⚡', DPOY: '🛡️', OROY: '🌟', DROY: '🌟',
    AllPro1: '⭐', AllPro2: '☆', Comeback_Player: '🔄', Champion: '💍',
  };

  // Championship count
  const championships = seasonHistory.filter(s =>
    history?.championsByYear[s.year]?.teamId === s.teamId
  ).length;

  // Ring of Honor data for meter
  const rohData = (() => {
    const playerSeasons = history?.playerHistory[player.playerId] ?? [];
    if (playerSeasons.length === 0 || !history) return null;
    const teamCounts = new Map<string, number>();
    for (const s of playerSeasons) teamCounts.set(s.teamId, (teamCounts.get(s.teamId) ?? 0) + 1);
    const primaryTeamId = [...teamCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!primaryTeamId) return null;
    const rohScore = computeClientTeamLegacyScore(player.playerId, position, primaryTeamId, history);
    if (rohScore <= 0) return null;
    const rohThreshold = 55;
    const jerseyThreshold = 100;
    const rohTier: LegacyTier = rohScore >= jerseyThreshold ? 'hall_of_famer' : rohScore >= rohThreshold ? 'likely' : rohScore >= 35 ? 'building' : rohScore >= 20 ? 'outside_shot' : 'none';
    const teamName = allTeams.find(t => t.id === primaryTeamId)?.name ?? primaryTeamId;
    const rohLabel = rohScore >= jerseyThreshold ? '★ Jersey Retired' : rohScore >= rohThreshold ? 'Ring of Honor' : rohScore >= 35 ? 'Building Legacy' : rohScore >= 20 ? 'Franchise Role' : 'Contributing';
    return { rohScore, rohTier, rohLabel, rohThreshold, jerseyThreshold, teamName };
  })();

  // Group ratings into categories for better visual organization
  const ratingGroups = useMemo(() => {
    if (!visibleRatings) return null;
    const entries = Object.entries(visibleRatings);
    if (entries.length <= 4) return { 'Ratings': entries };
    // Split into two roughly equal columns
    const mid = Math.ceil(entries.length / 2);
    return {
      'Primary': entries.slice(0, mid),
      'Secondary': entries.slice(mid),
    };
  }, [visibleRatings]);

  return (
    <div className="pd-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="pd-modal">

        {/* ── Header: identity + key info ── */}
        <div className="pd-header">
          <div className="pd-header-left">
            <div className="pd-face-placeholder" title="Player photo">
              <span className="pd-face-icon">{position.charAt(0)}</span>
            </div>
            <div className="pd-identity">
              <div className="pd-name-row">
                <span className="pd-name">{player.name}</span>
                {hofEntry && <span className="pd-hof-star" title={`Hall of Fame — ${hofEntry.inductionYear}`}>★</span>}
              </div>
              <div className="pd-meta-row">
                <span className="pd-badge pd-badge-pos">{rosterPlayer?.position ?? position}</span>
                <span className="pd-badge">{player.teamAbbreviation}</span>
                {rosterPlayer && (
                  <>
                    <span className="pd-meta-sep">·</span>
                    <span className="pd-meta-text">Age {rosterPlayer.age}</span>
                    <span className="pd-meta-sep">·</span>
                    <span className="pd-meta-text">{rosterPlayer.yearsPro === 0 ? 'Rookie' : `Yr ${rosterPlayer.yearsPro}`}</span>
                  </>
                )}
                {devBadge && (
                  <span className={`pd-badge dev-trait-badge dev-trait-${rosterPlayer!.devTrait}`} title={devBadge.label}>{devBadge.short}</span>
                )}
              </div>
            </div>
          </div>
          {/* Key numbers strip */}
          <div className="pd-header-nums">
            {rosterPlayer && (
              <>
                <div className="pd-header-num">
                  <span className="pd-header-num-val">{rosterPlayer.scoutedOverall}</span>
                  <span className="pd-header-num-lbl">OVR</span>
                </div>
                <div className="pd-header-num">
                  <span className="pd-header-num-val">${rosterPlayer.salary.toFixed(1)}M</span>
                  <span className="pd-header-num-lbl">{rosterPlayer.yearsRemaining}yr</span>
                </div>
              </>
            )}
          </div>
          <button className="pd-close" onClick={onClose}>✕</button>
        </div>

        {/* ── Contract demand (if applicable) ── */}
        {rosterPlayer?.contractDemand && (
          <div className="pd-contract-alert">
            Wants ${rosterPlayer.contractDemand.salary}M / {rosterPlayer.contractDemand.years}yr
          </div>
        )}

        {/* ── Accolades row ── */}
        {(playerAwards.length > 0 || championships > 0) && (
          <div className="pd-accolades">
            {championships > 0 && (
              <div className="pd-accolade" title={`${championships}× League Champion`}>
                <span className="pd-accolade-icon">💍</span>
                <span className="pd-accolade-label">{championships}× Champ</span>
              </div>
            )}
            {(() => {
              const counts = new Map<string, number>();
              for (const a of playerAwards) counts.set(a.type, (counts.get(a.type) ?? 0) + 1);
              return [...counts.entries()]
                .sort((a, b) => {
                  const order = ['MVP', 'OPOY', 'DPOY', 'AllPro1', 'AllPro2', 'OROY', 'DROY', 'Comeback_Player'];
                  return (order.indexOf(a[0]) ?? 99) - (order.indexOf(b[0]) ?? 99);
                })
                .map(([type, count]) => (
                  <div key={type} className="pd-accolade" title={`${count}× ${AWARD_LABELS[type] ?? type}`}>
                    <span className="pd-accolade-icon">{ACCOLADE_ICON[type] ?? '🏅'}</span>
                    <span className="pd-accolade-label">{count}× {type === 'AllPro1' ? 'AP1' : type === 'AllPro2' ? 'AP2' : type}</span>
                  </div>
                ));
            })()}
          </div>
        )}

        {/* ── Legacy meters ── */}
        {showLegacy && (
          <div className="pd-legacy">
            <div className="pd-legacy-section">
              <div className="pd-legacy-title">Hall of Fame Tracker</div>
              <LegacyMeter score={legacyScore} tier={legacyTier} threshold={HOF_CONFIG.tierThresholds.hall_of_famer} />
            </div>
            {rohData && (
              <div className="pd-legacy-section">
                <div className="pd-legacy-title">{rohData.teamName} Ring of Honor</div>
                <LegacyMeter score={rohData.rohScore} tier={rohData.rohTier} label={rohData.rohLabel} threshold={rohData.rohThreshold} maxOverride={rohData.jerseyThreshold + 20} />
              </div>
            )}
          </div>
        )}

        {/* ── Ratings — two-column grouped bars ── */}
        {ratingGroups && (
          <div className="pd-ratings-section">
            <div className="pd-section-label">Player Ratings</div>
            <div className="pd-ratings-columns">
              {Object.entries(ratingGroups).map(([groupLabel, entries]) => (
                <div key={groupLabel} className="pd-ratings-col">
                  {entries.map(([label, val]: [string, number]) => (
                    <div key={label} className="pd-rating-bar-row">
                      <span className="pd-rating-bar-label">{label}</span>
                      <div className="pd-rating-bar-track">
                        <div
                          className={`pd-rating-bar-fill ${val >= 80 ? 'pd-bar-elite' : val >= 65 ? 'pd-bar-avg' : 'pd-bar-low'}`}
                          style={{ width: `${val}%` }}
                        />
                      </div>
                      <span className={`pd-rating-bar-val ${val >= 80 ? 'pd-rating-elite' : val >= 65 ? 'pd-rating-avg' : 'pd-rating-low'}`}>{val}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Game Log (this season) ── */}
        {gameLog.length > 0 && (
          <div className="pd-gamelog-section">
            <div className="pd-section-label">This Season — Game Log</div>
            <div className="pd-table-wrap">
              <table className="pd-table">
                <thead>
                  <tr>
                    <th className="col-num">WK</th>
                    <th>OPP</th>
                    <th className="col-num">RESULT</th>
                    {glCols.map(c => <th key={c.label} className="col-num">{c.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {gameLog.map((r, i) => (
                    <tr key={i}>
                      <td className="col-num pd-week">{r.week === 0 ? 'PO' : r.week}</td>
                      <td className="pd-opp">{r.homeAway === 'A' ? '@' : 'vs'} {r.opponentAbbr}</td>
                      <td className={`col-num pd-result pd-result-${r.result.toLowerCase()}`}>
                        {r.result} {r.teamScore}–{r.oppScore}
                      </td>
                      {glCols.map(c => (
                        <td key={c.label} className={`col-num${c.primary ? ' col-primary' : ''}`}>{c.value(r)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Career Stats ── */}
        {seasonHistory.length > 0 && (
          <PlayerCareerView seasons={seasonHistory} awards={playerAwards} />
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
    conference:   'Conf. Championship',
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
      <section className="roster-page">
        <div className="roster-header"><div className="roster-header-left"><h2 className="roster-title">Awards</h2></div></div>
        <EmptyState icon="🏆" message="No awards yet — complete a season to see awards here." />
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
    <section className="roster-page">
      <div className="roster-header">
        <div className="roster-header-left">
          <h2 className="roster-title">Awards</h2>
          <select className="roster-team-select" value={selectedYear ?? ''} onChange={e => setSelectedYear(Number(e.target.value))}>
            {pastSeasons.map(sa => (
              <option key={sa.year} value={sa.year}>{sa.year} Season</option>
            ))}
          </select>
        </div>
        <div className="roster-header-stats">
          <div className="roster-header-stat"><span className="roster-header-val">{pastSeasons.length}</span><span className="roster-header-lbl">Seasons</span></div>
          {major.length > 0 && <div className="roster-header-stat"><span className="roster-header-val">{major.length}</span><span className="roster-header-lbl">Major</span></div>}
          {allPro1.length > 0 && <div className="roster-header-stat"><span className="roster-header-val">{allPro1.length + allPro2.length}</span><span className="roster-header-lbl">All-Pro</span></div>}
        </div>
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
                  <div className="roster-group">
                    <div className="roster-group-header" style={{ cursor: 'default' }}>
                      <span className="roster-group-name">1st Team All-Pro</span>
                      <span className="roster-group-count">{allPro1.length}</span>
                    </div>
                    <table className="ui-table roster-table">
                      <thead><tr><th>Pos</th><th>Player</th><th>Team</th></tr></thead>
                      <tbody>
                        {allPro1.map((a, i) => (
                          <tr key={i} className={a.teamId === myTeamId ? 'roster-row-starter' : ''}>
                            <td className="roster-pos-cell">{a.position ?? '—'}</td>
                            <td>{a.playerId && onViewPlayer
                              ? <button className="entity-link" onClick={() => onViewPlayer(a.playerId!)}>{a.playerName ?? '—'}</button>
                              : (a.playerName ?? '—')}</td>
                            <td className="muted">{a.teamName ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {allPro2.length > 0 && (
                  <div className="roster-group">
                    <div className="roster-group-header" style={{ cursor: 'default' }}>
                      <span className="roster-group-name">2nd Team All-Pro</span>
                      <span className="roster-group-count">{allPro2.length}</span>
                    </div>
                    <table className="ui-table roster-table">
                      <thead><tr><th>Pos</th><th>Player</th><th>Team</th></tr></thead>
                      <tbody>
                        {allPro2.map((a, i) => (
                          <tr key={i} className={a.teamId === myTeamId ? 'roster-row-starter' : ''}>
                            <td className="roster-pos-cell">{a.position ?? '—'}</td>
                            <td>{a.playerId && onViewPlayer
                              ? <button className="entity-link" onClick={() => onViewPlayer(a.playerId!)}>{a.playerName ?? '—'}</button>
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

function HistoryView({ history, teams, myTeamId, onViewPlayer }: {
  history: LeagueHistory;
  teams: League['teams'];
  myTeamId: string;
  onViewPlayer?: (id: string) => void;
}) {
  const [selectedTeamId, setSelectedTeamId] = useState(myTeamId);
  const teamHistory    = history.teamHistory[selectedTeamId] ?? [];
  const championsList  = Object.entries(history.championsByYear)
    .sort(([a], [b]) => Number(b) - Number(a));
  const myChamps = championsList.filter(([, c]) => c.teamId === myTeamId).length;

  return (
    <section className="roster-page">
      <div className="roster-header">
        <div className="roster-header-left">
          <h2 className="roster-title">League History</h2>
        </div>
        <div className="roster-header-stats">
          {championsList.length > 0 && <div className="roster-header-stat"><span className="roster-header-val">{championsList.length}</span><span className="roster-header-lbl">Seasons</span></div>}
          {myChamps > 0 && <div className="roster-header-stat"><span className="roster-header-val" style={{ color: 'var(--warning)' }}>{myChamps}</span><span className="roster-header-lbl">Your Titles</span></div>}
          <div className="roster-header-stat"><span className="roster-header-val">{history.retiredPlayers.length}</span><span className="roster-header-lbl">Retired</span></div>
        </div>
      </div>

      {/* Champions */}
      {championsList.length > 0 && (
        <div className="roster-group">
          <div className="roster-group-header" style={{ cursor: 'default' }}>
            <span className="roster-group-name">League Champions</span>
            <span className="roster-group-count">{championsList.length}</span>
          </div>
          <table className="ui-table roster-table">
            <thead><tr><th className="num">Year</th><th>Champion</th></tr></thead>
            <tbody>
              {championsList.map(([year, champ]) => (
                <tr key={year} className={champ.teamId === myTeamId ? 'roster-row-starter' : ''}>
                  <td className="num text-mono">{year}</td>
                  <td>
                    {champ.teamName}
                    {champ.teamId === myTeamId && <span className="ui-badge ui-badge--primary" style={{ marginLeft: 'var(--sp-2)' }}>You</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Team season history */}
      <div className="roster-group">
        <div className="roster-group-header" style={{ cursor: 'default' }}>
          <span className="roster-group-name">Team Seasons</span>
          <select className="roster-team-select" value={selectedTeamId} onChange={e => setSelectedTeamId(e.target.value)} onClick={e => e.stopPropagation()}>
            {teams.map(t => (
              <option key={t.id} value={t.id}>{t.name}{t.id === myTeamId ? ' (You)' : ''}</option>
            ))}
          </select>
        </div>
        {teamHistory.length === 0 ? (
          <div className="ui-empty ui-empty--compact">No season history yet for this team.</div>
        ) : (
          <table className="ui-table roster-table">
            <thead>
              <tr><th className="num">Year</th><th className="num">W</th><th className="num">L</th><th className="num">PF</th><th className="num">PA</th><th className="num">Diff</th><th>Playoffs</th></tr>
            </thead>
            <tbody>
              {[...teamHistory].reverse().map((s, i) => (
                <tr key={i} className={s.championshipRound === 'champion' ? 'roster-row-starter' : ''}>
                  <td className="num text-mono">{s.year}</td>
                  <td className="num">{s.wins}</td><td className="num">{s.losses}</td>
                  <td className="num">{s.pointsFor}</td><td className="num">{s.pointsAgainst}</td>
                  <td className={`num ${s.pointsFor - s.pointsAgainst >= 0 ? 'val-pos' : 'val-neg'}`}>
                    {s.pointsFor - s.pointsAgainst > 0 ? '+' : ''}{s.pointsFor - s.pointsAgainst}
                  </td>
                  <td className={s.championshipRound === 'champion' ? 'val-pos' : ''}>
                    {formatPlayoffRound(s.madePlayoffs, s.championshipRound)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Retired players */}
      {history.retiredPlayers.length > 0 && (
        <div className="roster-group">
          <div className="roster-group-header" style={{ cursor: 'default' }}>
            <span className="roster-group-name">Retired Players</span>
            <span className="roster-group-count">{history.retiredPlayers.length}</span>
          </div>
          <table className="ui-table roster-table">
            <thead><tr><th>Name</th><th>Pos</th><th className="num">Year</th><th className="num">Age</th><th className="num">OVR</th></tr></thead>
            <tbody>
              {[...history.retiredPlayers].reverse().slice(0, 25).map(p => (
                <tr key={p.playerId}>
                  <td>{onViewPlayer ? <button className="entity-link" onClick={() => onViewPlayer(p.playerId)}>{p.name}</button> : p.name}</td>
                  <td className="roster-pos-cell">{p.position}</td>
                  <td className="num text-mono">{p.retirementYear}</td>
                  <td className="num">{p.finalAge}</td>
                  <td className={`num ovr-cell${p.finalOverall >= 80 ? ' ovr-elite' : p.finalOverall < 60 ? ' ovr-low' : ''}`}>{p.finalOverall}</td>
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

// ── Feed source metadata ───────────────────────────────────────────────────────
const FEED_SOURCE: Record<string, { name: string; handle: string; avatar: string }> = {
  game_result:     { name: 'NFL Scores',     handle: 'nflscores',   avatar: '🏈' },
  playoff_result:  { name: 'Playoff Central',handle: 'playoffs',    avatar: '🏆' },
  championship:    { name: 'NFL',            handle: 'nfl',         avatar: '🏆' },
  award:           { name: 'NFL Awards',     handle: 'awards',      avatar: '🥇' },
  signing:         { name: 'Free Agency',    handle: 'freeagency',  avatar: '✍️' },
  trade:           { name: 'Trade Tracker',  handle: 'trades',      avatar: '🔄' },
  retirement:      { name: 'NFL Network',    handle: 'nflnetwork',  avatar: '📺' },
  draft_pick:      { name: 'NFL Draft',      handle: 'draft',       avatar: '📋' },
  big_performance: { name: 'NFL Stats',      handle: 'stats',       avatar: '📊' },
  upset:           { name: 'Sports Alert',   handle: 'alert',       avatar: '⚡' },
  weekly_recap:    { name: 'Weekly Wrap',    handle: 'recap',       avatar: '📰' },
  milestone:       { name: 'NFL Records',    handle: 'records',     avatar: '🎯' },
  stat_race:       { name: 'Stat Watch',     handle: 'statwatch',   avatar: '📈' },
  streak:          { name: 'Hot Streaks',    handle: 'streaks',     avatar: '🔥' },
  hall_of_fame:    { name: 'Hall of Fame',   handle: 'hof',         avatar: '⭐' },
  coach_change:    { name: 'Coaching News',  handle: 'coaching',    avatar: '📣' },
  ring_of_honor:   { name: 'Team History',   handle: 'history',     avatar: '💍' },
  retired_jersey:  { name: 'Team History',   handle: 'history',     avatar: '💍' },
  gm_milestone:    { name: 'GM Career',      handle: 'gmcareer',    avatar: '🏢' },
};

function fmtNewsAge(createdAt: number): string {
  const diffMs = Date.now() - createdAt;
  const diffH  = Math.floor(diffMs / 3_600_000);
  if (diffH < 1)  return 'Just now';
  if (diffH < 24) return `${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD}d`;
}

function DashboardView({ league, myTeamId, standings, busy, isCommissioner, onNavTo, onWatchGame, onSimGame, onViewPlayer, onViewTeam }: {
  league: League;
  myTeamId: string;
  standings: Standing[];
  busy: boolean;
  isCommissioner: boolean;
  onNavTo: (t: string) => void;
  onWatchGame: (gameId: string) => void;
  onSimGame: () => void;
  onViewPlayer?: (id: string) => void;
  onViewTeam?: (teamId: string) => void;
}) {
  const team    = league.teams.find(t => t.id === myTeamId)!;
  const games   = league.currentSeason.games;
  const payroll = team.roster.reduce((s, p) => s + p.salary, 0);
  const capSpace = CAP_LIMIT - payroll;
  const injured = team.roster.filter(p => p.injuryWeeksRemaining > 0).length;

  // Record + points
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

  // Win/loss streak
  const orderedResults = games
    .filter(g => g.status === 'final' && (g.homeTeam.id === myTeamId || g.awayTeam.id === myTeamId))
    .sort((a, b) => a.week - b.week)
    .map(g => {
      const isHome = g.homeTeam.id === myTeamId;
      const my = isHome ? g.homeScore : g.awayScore;
      const op = isHome ? g.awayScore : g.homeScore;
      return my > op ? 'W' : my < op ? 'L' : 'T';
    });
  let streakType = '';
  let streakCount = 0;
  for (let i = orderedResults.length - 1; i >= 0; i--) {
    const r = orderedResults[i]!;
    if (streakCount === 0) { streakType = r; streakCount = 1; }
    else if (r === streakType) streakCount++;
    else break;
  }
  const streak = streakCount > 0 ? `${streakType}${streakCount}` : '';

  // Standings rank
  const overallRank = standings.findIndex(s => s.team.id === myTeamId) + 1;

  // Division
  const myDivision = (league.divisions ?? []).find(d => d.teamIds.includes(myTeamId));
  const divStandings = myDivision
    ? standings.filter(s => myDivision.teamIds.includes(s.team.id))
        .sort((a, b) => b.w - a.w || (b.pf - b.pa) - (a.pf - a.pa))
    : standings.slice(0, 4);
  const divRank = divStandings.findIndex(s => s.team.id === myTeamId) + 1;

  // Next game
  const nextGame = games.find(g => g.status !== 'final' && (g.homeTeam.id === myTeamId || g.awayTeam.id === myTeamId));

  // Recent results (last 5)
  const recentGames = games
    .filter(g => g.status === 'final' && (g.homeTeam.id === myTeamId || g.awayTeam.id === myTeamId))
    .slice(-5).reverse();

  const weeklyReport = useMemo(() => generateWeeklyReport(league, standings), [league, standings]);

  return (
    <div className="dashboard">

      {/* ── Team header ─────────────────────────────────────────── */}
      <div className="dash-team-header">
        <div className="dash-team-logo"><TeamLogo abbr={team.abbreviation} size={60} /></div>
        <div className="dash-team-info">
          <div className="dash-team-name">{team.name}</div>
          <div className="dash-team-meta">
            <span className="dash-team-record">{w}–{l}{ties > 0 ? `–${ties}` : ''}</span>
            {myDivision && (
              <span className="dash-team-div">
                {myDivision.conference} · {myDivision.division}
              </span>
            )}
            {divRank > 0 && (
              <span className="dash-team-rank">#{divRank} Div</span>
            )}
            {overallRank > 0 && (
              <span className="dash-team-rank">#{overallRank} Overall</span>
            )}
            {streak && (
              <span className={`dash-team-streak ${streak.startsWith('W') ? 'pos' : streak.startsWith('L') ? 'neg' : ''}`}>
                {streak}
              </span>
            )}
          </div>
          {nextGame && (
            <div className="dash-team-next">
              <div className="dash-next-matchup">
                <span className="muted">Week {nextGame.week} · </span>
                {nextGame.homeTeam.id === myTeamId
                  ? <>vs <button className="link-btn" onClick={() => onViewTeam?.(nextGame.awayTeam.id)}><strong>{nextGame.awayTeam.name}</strong></button></>
                  : <>@ <button className="link-btn" onClick={() => onViewTeam?.(nextGame.homeTeam.id)}><strong>{nextGame.homeTeam.name}</strong></button></>}
              </div>
              <div className="dash-next-actions">
                <button className="btn-watch" onClick={() => onWatchGame(nextGame.id)}>
                  {nextGame.status === 'final' ? 'View Game' : 'Watch Game'}
                </button>
                {isCommissioner && (
                  <button className="btn-sim" disabled={busy} onClick={onSimGame}>Sim Game</button>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="dash-team-pts">
          <div className="dash-pts-row">
            <span className="dash-pts-label">PF</span>
            <span className="dash-pts-val">{pf}</span>
          </div>
          <div className="dash-pts-row">
            <span className="dash-pts-label">PA</span>
            <span className="dash-pts-val">{pa}</span>
          </div>
          <div className="dash-pts-row">
            <span className="dash-pts-label">DIFF</span>
            <span className={`dash-pts-val ${pf - pa >= 0 ? 'pos' : 'neg'}`}>
              {pf - pa >= 0 ? '+' : ''}{pf - pa}
            </span>
          </div>
        </div>
      </div>

      {/* ── Summary cards ───────────────────────────────────────── */}
      <div className="dash-summary-cards">
        <div className="dash-card">
          <div className="dash-card-label">Cap Space</div>
          <div className="dash-card-value">${capSpace.toFixed(1)}M</div>
          <div className="dash-card-sub muted">${payroll.toFixed(1)}M used</div>
        </div>
        <div className="dash-card">
          <div className="dash-card-label">Roster</div>
          <div className="dash-card-value">{team.roster.length}</div>
          {injured > 0
            ? <div className="dash-card-sub neg">{injured} injured</div>
            : <div className="dash-card-sub muted">healthy</div>}
        </div>
        <div className="dash-card">
          <div className="dash-card-label">Week</div>
          <div className="dash-card-value">{league.currentWeek}</div>
          <div className="dash-card-sub muted">of 18</div>
        </div>
        <div className="dash-card">
          <div className="dash-card-label">Division Rank</div>
          <div className="dash-card-value">#{divRank > 0 ? divRank : '—'}</div>
          <div className="dash-card-sub muted">#{overallRank > 0 ? overallRank : '—'} overall</div>
        </div>
        {recentGames.length > 0 && (
          <div className="dash-card dash-card-results">
            <div className="dash-card-label">Last {recentGames.length}</div>
            <div className="dash-result-pills">
              {recentGames.map(g => {
                const isHome = g.homeTeam.id === myTeamId;
                const my = isHome ? g.homeScore : g.awayScore;
                const op = isHome ? g.awayScore : g.homeScore;
                const r  = my > op ? 'W' : my < op ? 'L' : 'T';
                return (
                  <span key={g.id} className={`result-pill ${r === 'W' ? 'pos' : r === 'L' ? 'neg' : ''}`}>{r}</span>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Schedule strip ──────────────────────────────────────── */}
      <DashboardSchedule games={games} myTeamId={myTeamId} currentWeek={league.currentWeek} onViewGame={onWatchGame} />

      {/* ── Dashboard body panels ──────────────────────────────── */}
      <div className="dash-body">

        {/* Weekly Report (top of dashboard) */}
        {weeklyReport && (
          <div className="wr-panel">
            <div className="wr-header">
              <span className="wr-title">Week {weeklyReport.week} Report</span>
              <span className="wr-year">{weeklyReport.year} Season</span>
            </div>
            <div className="wr-headlines">
              {weeklyReport.headlines.map((h, i) => (
                <div key={i} className="wr-headline">{h}</div>
              ))}
            </div>
            {weeklyReport.notableGames.length > 0 && (
              <div className="wr-section">
                <div className="wr-section-title">Notable Games</div>
                <div className="wr-games">
                  {weeklyReport.notableGames.map((g, i) => (
                    <div key={i} className="wr-game">
                      <span className="wr-game-score">{g.away} {g.awayScore} – {g.homeScore} {g.home}</span>
                      <span className="wr-game-tag">{g.tag}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {weeklyReport.standoutPlayers.length > 0 && (
              <div className="wr-section">
                <div className="wr-section-title">Top Performers</div>
                <div className="wr-performers">
                  {weeklyReport.standoutPlayers.map((p, i) => (
                    <div key={i} className="wr-performer">
                      {p.playerId && onViewPlayer ? <button className="entity-link wr-performer-name" onClick={() => onViewPlayer(p.playerId!)}>{p.name}</button> : <span className="wr-performer-name">{p.name}</span>}
                      <span className="wr-performer-team">{p.teamAbbr}</span>
                      <span className="wr-performer-line">{p.line}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {weeklyReport.standoutTeams.length > 0 && (
              <div className="wr-section">
                <div className="wr-section-title">Teams to Watch</div>
                {weeklyReport.standoutTeams.map((t, i) => (
                  <div key={i} className="wr-team-line">
                    <span className="wr-team-abbr">{t.abbr}</span>
                    <span className="wr-team-detail">{t.detail}</span>
                  </div>
                ))}
              </div>
            )}
            {weeklyReport.metaSummary && (
              <div className="wr-meta">{weeklyReport.metaSummary}</div>
            )}
          </div>
        )}

        {/* Panels grid */}
        <div className="dash-panels">

          {/* Division standings */}
          <div className="dash-panel">
            <div className="dash-panel-header">
              <span className="dash-panel-title">{myDivision ? myDivision.division : 'Standings'}</span>
              <button className="dash-panel-link" onClick={() => onNavTo('standings')}>All →</button>
            </div>
            {divStandings.slice(0, 4).map((s, i) => (
              <div key={s.team.id} className={`dash-stand-row${s.team.id === myTeamId ? ' dash-my-team' : ''}`}>
                <span className="dash-stand-rank">{i + 1}</span>
                <TeamLogo abbr={s.team.abbreviation} size={20} />
                <button className="link-btn dash-stand-abbr" onClick={() => onViewTeam?.(s.team.id)}>{s.team.abbreviation}</button>
                <span className="dash-stand-rec">{s.w}–{s.l}</span>
                <span className={`dash-stand-diff ${s.pf - s.pa >= 0 ? 'pos' : 'neg'}`}>
                  {s.pf - s.pa >= 0 ? '+' : ''}{s.pf - s.pa}
                </span>
              </div>
            ))}
          </div>

          {/* Awards */}
          {(() => {
            const lastAwards = league.history.seasonAwards.length > 0
              ? league.history.seasonAwards[league.history.seasonAwards.length - 1]
              : null;
            const majorTypes   = ['MVP', 'OPOY', 'DPOY', 'Coach_of_Year'];
            const majorAwards  = lastAwards?.awards.filter(a => majorTypes.includes(a.type)) ?? [];
            if (!lastAwards || majorAwards.length === 0) return null;
            return (
              <div className="dash-panel">
                <div className="dash-panel-header">
                  <span className="dash-panel-title">{lastAwards.year} Awards</span>
                  <button className="dash-panel-link" onClick={() => onNavTo('awards')}>All →</button>
                </div>
                {majorAwards.map(a => (
                  <div key={a.type} className="dash-award-row">
                    <span className="dash-award-label">{AWARD_LABELS[a.type] ?? a.type}</span>
                    {a.playerId
                      ? <button className="link-btn dash-award-winner" onClick={() => onViewPlayer?.(a.playerId!)}>{a.playerName ?? '—'}</button>
                      : <span className="dash-award-winner">{a.playerName ?? a.coachName ?? '—'}</span>}
                    {a.teamName && <span className="dash-award-team muted">{a.teamName}</span>}
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Hall of Fame */}
          {(() => {
            const hof = league.history.hallOfFame ?? [];
            if (hof.length === 0) return null;
            const recent = hof.slice().sort((a, b) => b.inductionYear - a.inductionYear).slice(0, 4);
            return (
              <div className="dash-panel">
                <div className="dash-panel-header">
                  <span className="dash-panel-title">Hall of Fame</span>
                  <button className="dash-panel-link" onClick={() => onNavTo('hof')}>All →</button>
                </div>
                {recent.map(e => (
                  <div key={e.playerId} className="dash-hof-row">
                    <button className="link-btn dash-hof-name" onClick={() => onViewPlayer?.(e.playerId)}>★ {e.name}</button>
                    <span className="dash-hof-pos muted">{e.position}</span>
                    <span className="dash-hof-year muted">{e.inductionYear}</span>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* GM Career summary */}
          {league.gmCareer && league.gmCareer.seasons.length > 0 && (() => {
            const gm      = league.gmCareer;
            const champs  = gm.seasons.filter(s => s.wonChampionship).length;
            const playoffCount = gm.seasons.filter(s => s.madePlayoffs).length;
            const tier    = gmLegacyTier(gm.legacyScore);

            // Reputation
            const rep = gm.reputation ?? 40;
            const prevRep = gm.prevReputation;
            const repTier: string =
              rep >= 80 ? 'Elite' :
              rep >= 60 ? 'Proven Winner' :
              rep >= 40 ? 'Respected' :
              rep >= 20 ? 'Unproven' : 'Hot Seat';
            const trend: string | null = prevRep != null
              ? (rep > prevRep + 2 ? '↑' : rep < prevRep - 2 ? '↓' : '→')
              : null;
            const repColor: Record<string, string> = {
              'Elite': '#34d399', 'Proven Winner': '#60a5fa', 'Respected': '#fbbf24',
              'Unproven': '#f97316', 'Hot Seat': '#f87171',
            };

            // Short explanation
            let repExplain = '';
            if (gm.seasons.length >= 2) {
              const last = gm.seasons[gm.seasons.length - 1]!;
              const winPct = last.wins / Math.max(1, last.wins + last.losses);
              if (last.wonChampionship) repExplain = 'Championship season boosted your standing.';
              else if (winPct >= 0.7) repExplain = 'Strong winning record elevated your reputation.';
              else if (winPct >= 0.5) repExplain = 'Solid season kept your reputation steady.';
              else repExplain = 'Losing record put pressure on your standing.';
            }

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
                  <span>{playoffCount}x playoffs</span>
                  {champs > 0 && <span>🏆 {champs}x champ</span>}
                </div>
                {gm.seasons.length >= 1 && (
                  <div className="rep-section">
                    <div className="rep-row">
                      <span className="rep-label" style={{ color: repColor[repTier] ?? 'var(--text-primary)' }}>{repTier}</span>
                      {trend && <span className="rep-trend">{trend}</span>}
                      <span className="rep-score">{rep}</span>
                    </div>
                    {repExplain && <p className="rep-explain">{repExplain}</p>}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Coaching Grade */}
          {(() => {
            const grade = generateSeasonGrade(games, myTeamId);
            if (!grade) return null;
            const gradeColor: Record<string, string> = {
              A: '#34d399', 'A-': '#34d399', 'B+': '#60a5fa', B: '#60a5fa', 'B-': '#60a5fa',
              'C+': '#fbbf24', C: '#fbbf24', D: '#f97316', F: '#f87171',
            };
            return (
              <div className="dash-panel">
                <div className="dash-panel-header">
                  <span className="dash-panel-title">Coaching Grade</span>
                  <span className="cg-games">{grade.gamesEval} games</span>
                </div>
                <div className="cg-body">
                  <span className="cg-grade" style={{ color: gradeColor[grade.grade] ?? 'var(--text-primary)' }}>{grade.grade}</span>
                  <div className="cg-record">{grade.wins}W – {grade.losses}L</div>
                </div>
                {grade.strengths.length > 0 && (
                  <div className="cg-list">
                    {grade.strengths.map((s, i) => (
                      <div key={i} className="cg-item cg-item--good">{s}</div>
                    ))}
                  </div>
                )}
                {grade.weaknesses.length > 0 && (
                  <div className="cg-list">
                    {grade.weaknesses.map((w, i) => (
                      <div key={i} className="cg-item cg-item--bad">{w}</div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* League Meta */}
          {league.metaProfile && league.metaProfile.totalCalls >= 50 && (() => {
            const m = league.metaProfile;
            const passPct = (m.passRate * 100).toFixed(0);
            const runPct  = (m.runRate * 100).toFixed(0);
            const deepPct = (m.deepRate * 100).toFixed(0);

            // Trend indicators relative to neutral baselines
            const passDir = m.passRate > 0.55 ? '↑' : m.passRate < 0.45 ? '↓' : '→';
            const deepDir = m.deepRate > 0.28 ? '↑' : m.deepRate < 0.15 ? '↓' : '→';

            // Generate insight
            let insight = '';
            if (m.passRate > 0.60)      insight = 'The league is pass-heavy — run-first teams may find openings.';
            else if (m.passRate < 0.40) insight = 'Run games are dominating — pass rushers and coverage are key.';
            else if (m.deepRate > 0.30) insight = 'Deep shots are trending up — safeties are being tested often.';
            else if (m.deepRate < 0.12) insight = 'Short passing dominates — press coverage and blitzes have an edge.';
            else                        insight = 'The league meta is balanced — no clear exploitable trend.';

            return (
              <div className="dash-panel">
                <div className="dash-panel-header">
                  <span className="dash-panel-title">League Meta</span>
                </div>
                <div className="meta-bars">
                  <div className="meta-bar-row">
                    <span className="meta-bar-label">Pass</span>
                    <div className="meta-bar-track">
                      <div className="meta-bar-fill meta-bar-fill--pass" style={{ width: `${passPct}%` }} />
                    </div>
                    <span className="meta-bar-val">{passPct}% {passDir}</span>
                  </div>
                  <div className="meta-bar-row">
                    <span className="meta-bar-label">Run</span>
                    <div className="meta-bar-track">
                      <div className="meta-bar-fill meta-bar-fill--run" style={{ width: `${runPct}%` }} />
                    </div>
                    <span className="meta-bar-val">{runPct}%</span>
                  </div>
                  <div className="meta-bar-row">
                    <span className="meta-bar-label">Deep</span>
                    <div className="meta-bar-track">
                      <div className="meta-bar-fill meta-bar-fill--deep" style={{ width: `${deepPct}%` }} />
                    </div>
                    <span className="meta-bar-val">{deepPct}% {deepDir}</span>
                  </div>
                </div>
                <p className="meta-insight">{insight}</p>
              </div>
            );
          })()}

          {/* Weekly Prep */}
          {(() => {
            const nextGame = games.find(g => g.status === 'scheduled' && (g.homeTeam.id === myTeamId || g.awayTeam.id === myTeamId));
            if (!nextGame) return null;
            const opp = nextGame.homeTeam.id === myTeamId ? nextGame.awayTeam : nextGame.homeTeam;
            const isHome = nextGame.homeTeam.id === myTeamId;
            const rec = generateGameplanRecommendation(team, league);
            const oppReport = generateScoutingReport(opp);
            const hasScouting = !!oppReport;
            const hasRec = !!rec;

            return (
              <div className="dash-panel wp-panel">
                <div className="dash-panel-header">
                  <span className="dash-panel-title">Week {nextGame.week} Prep</span>
                </div>

                {/* Matchup */}
                <div className="wp-matchup">
                  <TeamLogo abbr={opp.abbreviation} size={28} />
                  <span className="wp-matchup-context">{isHome ? 'Home' : 'Away'} vs</span>
                  <span className="wp-matchup-opp">{opp.abbreviation}</span>
                  <span className="wp-matchup-name">{opp.name}</span>
                </div>

                {/* Checklist items */}
                <div className="wp-steps">
                  <div className={`wp-step${hasScouting ? ' wp-step--done' : ''}`}>
                    <span className="wp-step-icon">{hasScouting ? '✓' : '○'}</span>
                    <span className="wp-step-text">
                      {hasScouting ? oppReport!.summary : 'Scouting data builds as the season progresses.'}
                    </span>
                  </div>
                  <div className={`wp-step${hasRec ? ' wp-step--done' : ''}`}>
                    <span className="wp-step-icon">{hasRec ? '✓' : '○'}</span>
                    <span className="wp-step-text">
                      {hasRec ? `Suggested: ${rec!.presetName}` : 'Play more games to unlock a recommendation.'}
                    </span>
                  </div>
                </div>

                {/* Recommendation detail */}
                {rec && (
                  <div className="wp-rec">
                    <div className="wp-rec-tag">Suggested for this matchup</div>
                    <div className="wp-rec-header">
                      <span className="wp-rec-name">{rec.presetName}</span>
                    </div>
                    {rec.reasons.map((r, i) => (
                      <span key={i} className="wp-rec-reason">{r}</span>
                    ))}
                  </div>
                )}

                <button className="wp-cta" onClick={() => onNavTo('playbooks')}>
                  Open Gameplan
                </button>
              </div>
            );
          })()}

          {/* Team Insights */}
          {(() => {
            const insights: { icon: string; text: string }[] = [];
            const ps = team.playStats;
            const meta = league.metaProfile;

            if (ps) {
              // Find best and worst plays (minimum 5 calls)
              const entries = Object.entries(ps).filter(([, s]) => s.calls >= 5);
              if (entries.length >= 2) {
                const sorted = entries.sort((a, b) => (b[1].totalYards / b[1].calls) - (a[1].totalYards / a[1].calls));
                const best = sorted[0]!;
                const worst = sorted[sorted.length - 1]!;
                const bestAvg = (best[1].totalYards / best[1].calls).toFixed(1);
                const worstAvg = (worst[1].totalYards / worst[1].calls).toFixed(1);
                // Use play ID as display name (strip formation suffix for readability)
                const bestName = best[0].replace(/_\d+$/, '').replace(/_/g, ' ');
                const worstName = worst[0].replace(/_\d+$/, '').replace(/_/g, ' ');
                insights.push({ icon: '📈', text: `Your most effective play is ${bestName} (${bestAvg} avg yds).` });
                if (parseFloat(worstAvg) < 3.0) {
                  insights.push({ icon: '📉', text: `${worstName} is underperforming at ${worstAvg} avg yds — consider reducing its weight.` });
                }
              }

              // Compare team vs meta
              if (meta && meta.totalCalls >= 50) {
                let teamRun = 0, teamPass = 0, teamTotal = 0;
                for (const [id, s] of entries) {
                  teamTotal += s.calls;
                  if (id.includes('zone') || id.includes('power') || id.includes('counter') || id.includes('dive') || id.includes('slam') || id.includes('lead') || id.includes('inside') || id.includes('outside')) {
                    teamRun += s.calls;
                  } else {
                    teamPass += s.calls;
                  }
                }
                if (teamTotal >= 20) {
                  const teamPassRate = teamPass / teamTotal;
                  if (teamPassRate > meta.passRate + 0.12) {
                    insights.push({ icon: '🎯', text: 'You pass more than the league average — defenses may be scheming for it.' });
                  } else if (teamPassRate < meta.passRate - 0.12) {
                    insights.push({ icon: '🎯', text: 'You run more than the league average — your ground game may catch defenses off guard.' });
                  }
                }
              }
            }

            if (insights.length === 0) return null;
            return (
              <div className="dash-panel">
                <div className="dash-panel-header">
                  <span className="dash-panel-title">Performance Notes</span>
                </div>
                <div className="ti-list">
                  {insights.slice(0, 4).map((ins, i) => (
                    <div key={i} className="ti-item">
                      <span className="ti-icon">{ins.icon}</span>
                      <span className="ti-text">{ins.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Quick links */}
          <div className="dash-panel dash-panel-links">
            <div className="dash-panel-header"><span className="dash-panel-title">Quick Access</span></div>
            <button className="dash-link-btn" onClick={() => onNavTo('roster')}>Roster</button>
            <button className="dash-link-btn" onClick={() => onNavTo('contracts')}>Contracts</button>
            <button className="dash-link-btn" onClick={() => onNavTo('free-agents')}>Free Agents</button>
            <button className="dash-link-btn" onClick={() => onNavTo('trades')}>
              Trades{league.tradeProposals.filter(p => p.toTeamId === myTeamId && p.status === 'pending').length > 0
                ? ` (${league.tradeProposals.filter(p => p.toTeamId === myTeamId && p.status === 'pending').length})`
                : ''}
            </button>
          </div>
        </div>{/* end dash-panels */}
      </div>{/* end dash-body */}
    </div>
  );
}

// ── Game Center ────────────────────────────────────────────────────────────────

function GameCenterView({ league, myTeamId, watchedGameId, onBack, onViewPlayer }: {
  league: League;
  myTeamId: string;
  watchedGameId: string | null;
  onBack: () => void;
  onViewPlayer?: (id: string) => void;
}) {
  const allGames = league.currentSeason.games;
  const focusGame = watchedGameId ? allGames.find(g => g.id === watchedGameId) ?? null : null;
  const watchedWeek = focusGame?.week ?? league.currentWeek;
  const weekGames = allGames.filter(g => g.week === watchedWeek);

  // Lifted viewer state (shared with live box score)
  const events = focusGame?.events ?? [];
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const atEnd = events.length === 0 || idx >= events.length - 1;

  useEffect(() => {
    if (!playing) return;
    if (atEnd) { setPlaying(false); return; }
    timerRef.current = setTimeout(() => setIdx(i => i + 1), 800);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [playing, atEnd, idx]);

  useEffect(() => { setIdx(0); setPlaying(false); }, [watchedGameId]);

  // Play logic toggle
  const [showPlayLogic, setShowPlayLogic] = useState(false);

  // Box score team toggle
  const [boxSide, setBoxSide] = useState<'home' | 'away'>('home');

  if (!focusGame) {
    return (
      <div className="game-center">
        <p className="muted">No game found. <button className="btn-sm" onClick={onBack}>Back to Dashboard</button></p>
      </div>
    );
  }

  const homeId = focusGame.homeTeam.id;

  // Name → playerId lookup for clickable gc-right player names (last-name keyed)
  const gcNameToId = new Map<string, string>();
  for (const p of [...focusGame.homeTeam.roster, ...focusGame.awayTeam.roster]) {
    gcNameToId.set(p.name.split(' ').pop() ?? p.name, p.id);
  }
  function gcPBtn(name: string) {
    const pid = gcNameToId.get(name);
    return pid && onViewPlayer
      ? <button className="pd-trigger" onClick={() => onViewPlayer(pid)}>{name}</button>
      : <span className="gc-bs-player-name">{name}</span>;
  }

  // Running score up to current play
  let homeScore = 0, awayScore = 0;
  for (let i = 0; i <= idx && i < events.length; i++) {
    const ev = events[i]!;
    if (ev.result === 'touchdown')       { if (ev.offenseTeamId === homeId) homeScore += 7; else awayScore += 7; }
    if (ev.result === 'field_goal_good') { if (ev.offenseTeamId === homeId) homeScore += 3; else awayScore += 3; }
  }

  const currentEvent = events[idx];
  const quarter = currentEvent?.quarter ?? 1;
  const quarterLabel = atEnd && events.length > 0 ? 'Final' : (quarter <= 4 ? `Q${quarter}` : quarter === 5 ? 'OT' : `OT${quarter - 4}`);

  // Live box score up to idx
  const liveGame = { ...focusGame, events: events.slice(0, idx + 1) };
  const bs = deriveBoxScore(liveGame);

  // Determine which team each player belongs to (by offense team id in events)
  const playerTeamMap = new Map<string, string>();
  for (const ev of liveGame.events) {
    if (ev.ballCarrier) playerTeamMap.set(ev.ballCarrier, ev.offenseTeamId);
    if (ev.target) playerTeamMap.set(ev.target, ev.offenseTeamId);
  }

  const displayTeamId = boxSide === 'home' ? homeId : focusGame.awayTeam.id;
  const displayTeam   = boxSide === 'home' ? focusGame.homeTeam : focusGame.awayTeam;
  const displayTeamStats = boxSide === 'home' ? bs.home : bs.away;
  const allPlayers = Object.values(bs.players);
  const teamPlayers = allPlayers.filter(p => playerTeamMap.get(p.name) === displayTeamId);

  const passers   = teamPlayers.filter(p => p.attempts > 0).sort((a, b) => b.passingYards - a.passingYards);
  const rushers   = teamPlayers.filter(p => p.carries > 0).sort((a, b) => b.rushingYards - a.rushingYards);
  const receivers = teamPlayers.filter(p => p.targets > 0).sort((a, b) => b.receivingYards - a.receivingYards);

  // If no team-specific players yet (early in game), show all
  const hasTeamData = teamPlayers.length > 0;
  const showPassers   = hasTeamData ? passers   : allPlayers.filter(p => p.attempts > 0);
  const showRushers   = hasTeamData ? rushers   : [];
  const showReceivers = hasTeamData ? receivers : [];

  const isMyGame = focusGame.homeTeam.id === myTeamId || focusGame.awayTeam.id === myTeamId;

  // ── New: Momentum ───────────────────────────────────────────────────────────
  const momentum = useMemo(() => computeMomentum(events, idx, homeId), [events, idx, homeId]);

  // ── New: Drive stats ────────────────────────────────────────────────────────
  const drive = useMemo(() => computeDriveStats(events, idx), [events, idx]);
  const driveText = drive ? `${drive.plays} plays · ${drive.yards} yds · ${formatDriveTime(drive.elapsed)}` : undefined;

  // ── New: Around-the-league alerts ───────────────────────────────────────────
  const leagueAlerts = useMemo(
    () => generateLeagueAlerts(weekGames, focusGame.id),
    [weekGames, focusGame.id],
  );
  const [shownAlertIds] = useState(() => new Set<number>());
  const [activeToast, setActiveToast] = useState<LeagueAlert | null>(null);

  // Fire alerts as user progresses through the game
  useEffect(() => {
    if (events.length === 0) return;
    const pct = idx / events.length;
    const firing = getActiveAlerts(leagueAlerts, pct, shownAlertIds);
    if (firing.length > 0) {
      const last = firing[firing.length - 1]!;
      firing.forEach(f => shownAlertIds.add(f.index));
      setActiveToast(last.alert);
      const t = setTimeout(() => setActiveToast(null), 3500);
      return () => clearTimeout(t);
    }
  }, [idx, events.length, leagueAlerts, shownAlertIds]);

  // ── New: Highlights (post-game) ─────────────────────────────────────────────
  const highlights = useMemo(
    () => (atEnd && events.length > 0) ? generateHighlights(events, homeId) : [],
    [atEnd, events, homeId],
  );

  // ── New: H2H rivalry stats ──────────────────────────────────────────────────
  const rivalryStats = useMemo(() => {
    const oppTeam = focusGame.homeTeam.id === myTeamId ? focusGame.awayTeam : focusGame.homeTeam;
    // Check if opponent is owned by a human
    if (!(oppTeam as any).ownerId) return null;
    // Scan completed games between these two teams (current season only — history doesn't store game objects)
    const matchups = league.currentSeason.games.filter(g =>
      g.status === 'final' &&
      ((g.homeTeam.id === myTeamId && g.awayTeam.id === oppTeam.id) ||
       (g.awayTeam.id === myTeamId && g.homeTeam.id === oppTeam.id))
    );
    if (matchups.length === 0) return null;
    let myWins = 0, oppWins = 0;
    let lastResult = '';
    for (const g of matchups) {
      const myIsHome = (g as any).homeTeam?.id === myTeamId;
      const myScore = myIsHome ? g.homeScore : g.awayScore;
      const theirScore = myIsHome ? g.awayScore : g.homeScore;
      if (myScore > theirScore) myWins++;
      else if (theirScore > myScore) oppWins++;
      lastResult = `${(g as any).awayTeam?.abbreviation ?? '?'} ${g.awayScore}, ${(g as any).homeTeam?.abbreviation ?? '?'} ${g.homeScore}`;
    }
    return { myWins, oppWins, total: matchups.length, oppAbbr: oppTeam.abbreviation, lastResult };
  }, [focusGame, myTeamId, league]);

  // ── New: Points by quarter ──────────────────────────────────────────────────
  const pointsByQuarter = useMemo(() => {
    const home: Record<number, number> = {};
    const away: Record<number, number> = {};
    for (let i = 0; i <= idx && i < events.length; i++) {
      const ev = events[i]!;
      const q = ev.quarter;
      if (ev.result === 'touchdown') {
        if (ev.offenseTeamId === homeId) home[q] = (home[q] ?? 0) + 7;
        else away[q] = (away[q] ?? 0) + 7;
      } else if (ev.result === 'field_goal_good') {
        if (ev.offenseTeamId === homeId) home[q] = (home[q] ?? 0) + 3;
        else away[q] = (away[q] ?? 0) + 3;
      }
    }
    const maxQ = Math.max(4, ...Object.keys(home).map(Number), ...Object.keys(away).map(Number));
    const quarters: number[] = [];
    for (let q = 1; q <= maxQ; q++) quarters.push(q);
    return { home, away, quarters };
  }, [events, idx, homeId]);

  return (
    <div className="game-center game-center-4zone">

      {/* Left: Around the League */}
      <div className="gc-left">
        <div className="gc-panel-title">Week {watchedWeek} Scores</div>
        {weekGames.map(g => {
          const isFocus = g.id === focusGame.id;
          const isUser  = g.homeTeam.id === myTeamId || g.awayTeam.id === myTeamId;
          return (
            <div key={g.id} className={`atl-card${isFocus ? ' atl-focus' : ''}${isUser ? ' atl-mine' : ''}`}>
              <div className="atl-teams">
                <TeamLogo abbr={g.awayTeam.abbreviation} size={18} />
                <span className="atl-abbr">{g.awayTeam.abbreviation}</span>
                <span className="atl-at">@</span>
                <span className="atl-abbr">{g.homeTeam.abbreviation}</span>
                <TeamLogo abbr={g.homeTeam.abbreviation} size={18} />
              </div>
              {g.status === 'final' ? (
                <div className="atl-score">{g.awayScore} – {g.homeScore}</div>
              ) : (
                <div className="atl-upcoming muted">Upcoming</div>
              )}
              <div className={`atl-status ${g.status}`}>{g.status === 'final' ? 'Final' : 'Pre'}</div>
            </div>
          );
        })}

        {/* H2H Rivalry Stats */}
        {rivalryStats && (
          <div className="gc-rivalry">
            <div className="gc-rivalry-title">RIVALRY</div>
            <div className="gc-rivalry-record">
              {rivalryStats.myWins > rivalryStats.oppWins
                ? `You lead ${rivalryStats.myWins}-${rivalryStats.oppWins}`
                : rivalryStats.oppWins > rivalryStats.myWins
                  ? `${rivalryStats.oppAbbr} leads ${rivalryStats.oppWins}-${rivalryStats.myWins}`
                  : `Tied ${rivalryStats.myWins}-${rivalryStats.oppWins}`}
            </div>
            {rivalryStats.lastResult && (
              <div className="gc-rivalry-last">Last: {rivalryStats.lastResult}</div>
            )}
          </div>
        )}
      </div>

      {/* Center: Scoreboard + Viewer */}
      <div className="gc-main">
        {/* Pre-game scouting report (when user is involved and game hasn't started) */}
        {isMyGame && focusGame.status === 'scheduled' && (() => {
          const opponent = focusGame.homeTeam.id === myTeamId ? focusGame.awayTeam : focusGame.homeTeam;
          const report = generateScoutingReport(opponent);
          return report ? (
            <div className="gc-scout">
              <div className="gc-scout-title">Scouting Report: {report.teamAbbr}</div>
              <p className="gc-scout-summary">{report.summary}</p>
              <div className="gc-scout-bars">
                <div className="gc-scout-bar">
                  <span className="gc-scout-label">Run/Pass</span>
                  <div className="gc-scout-track">
                    <div className="gc-scout-fill gc-scout-fill--run" style={{ width: `${(report.runRate * 100).toFixed(0)}%` }} />
                  </div>
                  <span className="gc-scout-pct">{(report.runRate * 100).toFixed(0)}% run</span>
                </div>
                {report.passRate > 0.3 && (
                  <div className="gc-scout-bar">
                    <span className="gc-scout-label">Deep Rate</span>
                    <div className="gc-scout-track">
                      <div className="gc-scout-fill gc-scout-fill--deep" style={{ width: `${(report.deepRate * 100).toFixed(0)}%` }} />
                    </div>
                    <span className="gc-scout-pct">{(report.deepRate * 100).toFixed(0)}%</span>
                  </div>
                )}
              </div>
              {report.topPlays.length > 0 && (
                <div className="gc-scout-plays">
                  <span className="gc-scout-label">Top Plays</span>
                  {report.topPlays.slice(0, 3).map((p, i) => (
                    <span key={i} className="gc-scout-play">{p.name} ({p.calls}x, {p.avgYards} avg)</span>
                  ))}
                </div>
              )}
            </div>
          ) : null;
        })()}

        {events.length === 0 ? (
          <>
            <div className="gc-scoreboard">
              <div className="gc-team gc-away">
                <TeamLogo abbr={focusGame.awayTeam.abbreviation} size={44} />
                <div className="gc-team-abbr">{focusGame.awayTeam.abbreviation}</div>
                <div className="gc-team-name">{focusGame.awayTeam.name}</div>
                <div className="gc-team-score">0</div>
              </div>
              <div className="gc-mid">
                <div className="gc-quarter-label">Pre</div>
              </div>
              <div className="gc-team gc-home">
                <div className="gc-team-score">0</div>
                <div className="gc-team-name">{focusGame.homeTeam.name}</div>
                <div className="gc-team-abbr">{focusGame.homeTeam.abbreviation}</div>
                <TeamLogo abbr={focusGame.homeTeam.abbreviation} size={44} />
              </div>
            </div>
            <div className="gc-play-area">
              <p className="muted gc-no-events">
                {focusGame.status === 'scheduled'
                  ? 'Game not yet played. The commissioner can advance the week to simulate games.'
                  : 'Play-by-play data not available for this game.'}
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="gc-field-zone">
              <FieldView
                event={currentEvent ?? null}
                homeAbbr={focusGame.homeTeam.abbreviation}
                awayAbbr={focusGame.awayTeam.abbreviation}
                homeId={homeId}
                homeScore={homeScore}
                awayScore={awayScore}
                quarter={quarterLabel}
                playIndex={idx}
                totalPlays={events.length}
                momentumPct={momentum.pct}
                momentumLeader={momentum.leader}
                driveText={driveText}
              />

              {/* Around-the-league toast overlay */}
              {activeToast && (
                <div className={`gc-atl-toast gc-atl-toast-${activeToast.kind}`}>
                  <span className="gc-atl-toast-icon">
                    {activeToast.kind === 'touchdown' ? '🏈' : activeToast.kind === 'turnover' ? '⚠️' : '📢'}
                  </span>
                  <div className="gc-atl-toast-body">
                    <span className="gc-atl-toast-label">AROUND THE LEAGUE</span>
                    <span className="gc-atl-toast-text">{activeToast.text}</span>
                  </div>
                </div>
              )}
            </div>
            {showPlayLogic && currentEvent?.explanation && (
              <div className="gc-play-logic">
                {currentEvent.explanation.map((r, i) => (
                  <span key={i} className="pbp-reason">{r}</span>
                ))}
              </div>
            )}
          </>
        )}

        <div className="gc-controls">
          <button onClick={() => { setPlaying(false); setIdx(0); }} disabled={idx === 0 && !playing}>Reset</button>
          <button onClick={() => setIdx(i => Math.max(0, i - 1))} disabled={playing || idx === 0}>◀ Prev</button>
          <button
            onClick={() => setPlaying(v => !v)}
            disabled={events.length === 0 || (atEnd && !playing)}
          >
            {playing ? '⏸ Pause' : '▶ Play'}
          </button>
          <button onClick={() => setIdx(i => Math.min(events.length - 1, i + 1))} disabled={playing || atEnd}>Next ▶</button>
          <button
            className={`btn-logic-toggle${showPlayLogic ? ' active' : ''}`}
            onClick={() => setShowPlayLogic(v => !v)}
            title="Show why each play was selected"
          >
            {showPlayLogic ? '🧠 Logic On' : '🧠 Logic'}
          </button>
        </div>

        <div className="gc-back-row">
          <button className="btn-sm" onClick={onBack}>← Dashboard</button>
          {!isMyGame && <span className="muted gc-spectating">Spectating</span>}
        </div>
      </div>

      {/* Right: Live Box Score */}
      <div className="gc-right">
        <div className="gc-panel-title">Box Score</div>
        <div className="gc-bs-tabs">
          <button
            className={boxSide === 'away' ? 'active' : ''}
            onClick={() => setBoxSide('away')}
          >
            {focusGame.awayTeam.abbreviation}
          </button>
          <button
            className={boxSide === 'home' ? 'active' : ''}
            onClick={() => setBoxSide('home')}
          >
            {focusGame.homeTeam.abbreviation}
          </button>
        </div>

        {/* Team summary row */}
        <div className="gc-bs-summary">
          <span className="gc-bs-team-name">{displayTeam.name}</span>
          <div className="gc-bs-stat-row">
            <span>Score</span><span>{displayTeamStats.score}</span>
          </div>
          <div className="gc-bs-stat-row">
            <span>Total Yds</span><span>{displayTeamStats.totalYards}</span>
          </div>
          <div className="gc-bs-stat-row">
            <span>Pass Yds</span><span>{displayTeamStats.passingYards}</span>
          </div>
          <div className="gc-bs-stat-row">
            <span>Rush Yds</span><span>{displayTeamStats.rushingYards}</span>
          </div>
          <div className="gc-bs-stat-row">
            <span>1st Downs</span><span>{displayTeamStats.firstDowns}</span>
          </div>
          <div className="gc-bs-stat-row">
            <span>Turnovers</span><span>{displayTeamStats.turnovers}</span>
          </div>
        </div>

        {showPassers.length > 0 && (
          <div className="gc-bs-section">
            <div className="gc-bs-section-title">Passing</div>
            {showPassers.map(p => (
              <div key={p.name} className="gc-bs-player-row">
                {gcPBtn(p.name)}
                <span className="gc-bs-player-stat">{p.completions}/{p.attempts} · {p.passingYards}y · {p.passingTDs}TD</span>
              </div>
            ))}
          </div>
        )}

        {showRushers.length > 0 && (
          <div className="gc-bs-section">
            <div className="gc-bs-section-title">Rushing</div>
            {showRushers.map(p => (
              <div key={p.name} className="gc-bs-player-row">
                {gcPBtn(p.name)}
                <span className="gc-bs-player-stat">{p.carries} car · {p.rushingYards}y · {p.rushingTDs}TD</span>
              </div>
            ))}
          </div>
        )}

        {showReceivers.length > 0 && (
          <div className="gc-bs-section">
            <div className="gc-bs-section-title">Receiving</div>
            {showReceivers.map(p => (
              <div key={p.name} className="gc-bs-player-row">
                {gcPBtn(p.name)}
                <span className="gc-bs-player-stat">{p.receptions}/{p.targets} · {p.receivingYards}y · {p.receivingTDs}TD</span>
              </div>
            ))}
          </div>
        )}

        {showPassers.length === 0 && showRushers.length === 0 && showReceivers.length === 0 && (
          <p className="muted gc-bs-empty">No stats yet.</p>
        )}
      </div>

      {/* Bottom Ticker: Around-the-League */}
      {events.length > 0 && leagueAlerts.length > 0 && (
        <div className="gc-bottom-ticker">
          <span className="gc-ticker-label">SCORES</span>
          {weekGames.filter(g => g.id !== focusGame.id && g.status === 'final').map(g => (
            <span key={g.id} className="gc-ticker-item">
              {g.awayTeam.abbreviation} {g.awayScore} – {g.homeTeam.abbreviation} {g.homeScore}
            </span>
          ))}
        </div>
      )}

      {/* Points by Quarter row */}
      {events.length > 0 && (
        <div className="gc-qtr-scores">
          <table className="gc-qtr-table">
            <thead>
              <tr>
                <th></th>
                {pointsByQuarter.quarters.map(q => (
                  <th key={q}>{q <= 4 ? `Q${q}` : q === 5 ? 'OT' : `OT${q-4}`}</th>
                ))}
                <th>T</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="gc-qtr-team">{focusGame.awayTeam.abbreviation}</td>
                {pointsByQuarter.quarters.map(q => (
                  <td key={q}>{pointsByQuarter.away[q] ?? 0}</td>
                ))}
                <td className="gc-qtr-total">{awayScore}</td>
              </tr>
              <tr>
                <td className="gc-qtr-team">{focusGame.homeTeam.abbreviation}</td>
                {pointsByQuarter.quarters.map(q => (
                  <td key={q}>{pointsByQuarter.home[q] ?? 0}</td>
                ))}
                <td className="gc-qtr-total">{homeScore}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Postgame Highlights Reel — shown when game is final */}
      {highlights.length > 0 && (
        <div className="gc-highlights">
          <div className="gc-highlights-title">TOP PLAYS</div>
          {highlights.map((h, rank) => (
            <button
              key={h.idx}
              className={`gc-highlight-item gc-highlight-${h.kind}`}
              onClick={() => { setPlaying(false); setIdx(h.idx); }}
            >
              <span className="gc-highlight-rank">#{rank + 1}</span>
              <span className="gc-highlight-desc">{h.description}</span>
              <span className="gc-highlight-q">Q{h.event.quarter}</span>
              <span className="gc-highlight-swing">
                {h.swing > 0 ? `±${h.swing}` : '—'}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Postgame Recap — shown when game is final and viewer reached the end */}
      {focusGame.status === 'final' && focusGame.boxScore && atEnd && events.length > 0 && (
        <div className="gc-recap">
          <GameRecapView game={focusGame} myTeamId={myTeamId} />
        </div>
      )}

    </div>
  );
}

// ── Standings ──────────────────────────────────────────────────────────────────

function StandingsView({ standings, userTeamId, divisions, onViewTeam }: {
  standings: Standing[];
  userTeamId: string;
  divisions: Division[];
  onViewTeam?: (teamId: string) => void;
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
                  <TeamLogo abbr={s.team.abbreviation} size={22} />
                  <button className="link-btn stand-team-name" onClick={() => onViewTeam?.(s.team.id)}>{s.team.name}</button>
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
                <td>
                  <button className="link-btn" onClick={() => onViewTeam?.(s.team.id)}>{s.team.name}</button>
                  {s.team.id === userTeamId && <span className="you">YOU</span>}
                </td>
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

// ── College View ──────────────────────────────────────────────────────────────

function CollegeView({ data, prospects, scoutingData, scoutingPoints, busy, onScout, onViewInScouting }: {
  data: import('./types').CollegeData;
  prospects: import('./types').ClientProspect[];
  scoutingData: Record<string, import('./types').ProspectScoutingState>;
  scoutingPoints: number;
  busy: boolean;
  onScout: (prospectId: string) => void;
  onViewInScouting: (prospectId: string) => void;
}) {
  const [activeConf, setActiveConf] = useState(data.conferences[0]?.name ?? '');
  const [activeCategory, setActiveCategory] = useState<string>('passing');
  const COSTS = [10, 20, 35];
  const LEVEL_LABELS = ['Unscouted', 'Level 1', 'Level 2', 'Full'];

  const conf = data.conferences.find(c => c.name === activeConf);
  const leaders = data.statLeaders.filter(l => l.category === activeCategory);

  const catLabels: Record<string, string> = {
    passing: 'Passing', rushing: 'Rushing', receiving: 'Receiving',
    sacks: 'Sacks', interceptions: 'Interceptions',
  };

  return (
    <section className="college-view">
      <h2 className="section-title">College Football — {data.year} Draft Class</h2>

      {/* Conference Standings */}
      <div className="col-section">
        <h3 className="col-section-title">Conference Standings</h3>
        <div className="col-conf-tabs">
          {data.conferences.map(c => (
            <button key={c.name} className={`col-conf-tab${activeConf === c.name ? ' active' : ''}`} onClick={() => setActiveConf(c.name)}>
              {c.name}
            </button>
          ))}
        </div>
        {conf && (
          <table className="col-standings-table">
            <thead><tr><th>#</th><th>Team</th><th>W</th><th>L</th></tr></thead>
            <tbody>
              {conf.teams.map((t, i) => (
                <tr key={t.name}>
                  <td className="col-rank">{i + 1}</td>
                  <td className="col-team-name">{t.name}</td>
                  <td className="col-w">{t.wins}</td>
                  <td className="col-l">{t.losses}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Stat Leaders */}
      <div className="col-section">
        <h3 className="col-section-title">Stat Leaders</h3>
        <div className="col-cat-tabs">
          {Object.entries(catLabels).map(([key, label]) => (
            <button key={key} className={`col-cat-tab${activeCategory === key ? ' active' : ''}`} onClick={() => setActiveCategory(key)}>
              {label}
            </button>
          ))}
        </div>
        <div className="col-leaders">
          {leaders.length === 0 && <p className="muted">No leaders in this category.</p>}
          {leaders.map((l, i) => (
            <div key={i} className="col-leader">
              <span className="col-leader-rank">{i + 1}</span>
              <div className="col-leader-info">
                <span className="col-leader-name">{l.name}</span>
                <span className="col-leader-college">{l.college}</span>
              </div>
              <span className="col-leader-stat">{l.stat}</span>
              <button className="col-leader-view" onClick={() => onViewInScouting(l.prospectId)}>View</button>
            </div>
          ))}
        </div>
      </div>

      {/* Combine Results */}
      {prospects.some(p => p.combine) && (
        <div className="col-section">
          <h3 className="col-section-title">Combine / Pro Day Results</h3>
          <div className="combine-list">
            {prospects.filter(p => p.combine).slice(0, 15).map(p => {
              const c = p.combine!;
              const stockCls = c.stockMove === 'rising' ? 'combine-rising' : c.stockMove === 'falling' ? 'combine-falling' : 'combine-neutral';
              return (
                <div key={p.id} className={`combine-row ${stockCls}`}>
                  <div className="combine-player">
                    <span className="combine-pos">{p.position}</span>
                    <span className="combine-name">{p.name}</span>
                    <span className={`combine-stock combine-stock--${c.stockMove}`}>
                      {c.stockMove === 'rising' ? '↑' : c.stockMove === 'falling' ? '↓' : '—'}
                    </span>
                  </div>
                  <div className="combine-metrics">
                    <span className="combine-metric"><span className="combine-metric-label">40</span> {c.fortyYard}s</span>
                    <span className="combine-metric"><span className="combine-metric-label">Bench</span> {c.benchPress}</span>
                    <span className="combine-metric"><span className="combine-metric-label">Vert</span> {c.vertJump}"</span>
                    <span className="combine-metric"><span className="combine-metric-label">Broad</span> {c.broadJump}"</span>
                    <span className="combine-metric"><span className="combine-metric-label">3-cone</span> {c.threeCone}s</span>
                  </div>
                  <p className="combine-headline">{c.headline}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top Prospects */}
      <div className="col-section">
        <div className="col-section-header">
          <h3 className="col-section-title">Top Prospects</h3>
          <span className="col-points">{scoutingPoints} scouting pts</span>
        </div>
        <table className="col-prospects-table">
          <thead><tr><th>#</th><th>Name</th><th>Pos</th><th>College</th><th>Size</th><th>Scout</th><th></th></tr></thead>
          <tbody>
            {prospects.slice(0, 25).map((p, i) => {
              const state = scoutingData[p.id];
              const level = state?.scoutLevel ?? 0;
              const report = state?.report ?? null;
              const nextCost = level < 3 ? COSTS[level]! : null;
              const canAfford = nextCost !== null && scoutingPoints >= nextCost;
              return (
                <tr key={p.id} className={level > 0 ? 'col-row-scouted' : ''}>
                  <td className="col-rank">{i + 1}</td>
                  <td className="col-prospect-name">{p.name}</td>
                  <td className="col-prospect-pos">{p.position}</td>
                  <td className="col-prospect-college">{p.college}</td>
                  <td className="col-prospect-size">{p.height}, {p.weight} lbs</td>
                  <td className="col-scout-cell">
                    {level >= 3 ? (
                      <span className="col-scout-done">{LEVEL_LABELS[level]}</span>
                    ) : report ? (
                      <span className="col-scout-partial">Lv{level} · Rd {report.projectedRound.min}–{report.projectedRound.max}</span>
                    ) : (
                      <span className="col-scout-none">Unscouted</span>
                    )}
                  </td>
                  <td className="col-actions">
                    {nextCost !== null && (
                      <button
                        className="col-scout-btn"
                        disabled={busy || !canAfford}
                        onClick={() => onScout(p.id)}
                        title={canAfford ? `Scout (${nextCost} pts)` : `Need ${nextCost} pts`}
                      >
                        Scout ({nextCost})
                      </button>
                    )}
                    <button className="col-view-btn" onClick={() => onViewInScouting(p.id)} title="View full report">
                      View
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

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

function PlayoffView({ playoff, teams, seasonHistory, history, league: leagueObj, myTeamId, busy, advanceBtnLabel, onAdvance, onViewPlayer }: {
  playoff?: PlayoffBracket;
  teams: League['teams'];
  seasonHistory: SeasonRecord[];
  history: LeagueHistory;
  league: League;
  myTeamId: string;
  busy: boolean;
  advanceBtnLabel: string;
  onAdvance: () => void;
  onViewPlayer?: (id: string) => void;
}) {
  const [mode, setMode] = useState<'bracket' | 'recap' | 'report'>('bracket');
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);

  const teamName  = (id: string) => teams.find(t => t.id === id)?.name ?? id;
  const teamAbbr  = (id: string) => teams.find(t => t.id === id)?.abbreviation ?? '';
  const isMyTeam  = (id: string) => id === myTeamId;
  const done      = advanceBtnLabel === 'Season Complete' || advanceBtnLabel === 'Draft In Progress';
  const hasHistory = seasonHistory.length > 0;

  const ROUND_LABELS: Record<string, string> = {
    wildcard: 'Wild Card', divisional: 'Divisional', conference: 'Conference Championship', championship: 'League Championship',
  };
  const ROUND_ORDER = ['wildcard', 'divisional', 'conference', 'championship'];

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
            <TeamLogo abbr={teamAbbr(m.topSeedId)} size={20} />
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
            <TeamLogo abbr={teamAbbr(m.bottomSeedId)} size={20} />
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
          <button className={mode === 'report' ? 'active' : ''} onClick={() => setMode('report')}>Year-End Report</button>
        </div>
      )}

      {mode === 'bracket' && (
        <>
          {!playoff && <EmptyState message="Playoffs have not started yet." />}

          {playoff && (() => {
            const icRounds = ROUND_ORDER.slice(0, 3).map(r => ({
              round: r, label: ROUND_LABELS[r]!,
              matchups: playoff.matchups.filter(m => m.round === r && m.conference === 'IC'),
            }));
            const scRounds = ROUND_ORDER.slice(0, 3).map(r => ({
              round: r, label: ROUND_LABELS[r]!,
              matchups: playoff.matchups.filter(m => m.round === r && m.conference === 'SC'),
            }));
            const champMatchup = playoff.matchups.find(m => m.round === 'championship');

            return (
              <div className="bracket-wrap">
                {playoff.championId && (
                  <div className={`bracket-champion${isMyTeam(playoff.championId) ? ' bracket-champion-mine' : ''}`}>
                    <TeamLogo abbr={teamAbbr(playoff.championId)} size={56} />
                    <div className="bracket-champion-trophy">🏆</div>
                    <div className="bracket-champion-year">{playoff.year} Champions</div>
                    <div className="bracket-champion-name">{playoff.championName}</div>
                  </div>
                )}

                <div className="bracket-flow">
                  <div className="bracket-wing">
                    <div className="bracket-wing-label">Iron Conference</div>
                    <div className="bracket-wing-rounds">
                      {icRounds.filter(r => r.matchups.length > 0).map(g => (
                        <div key={g.round} className="bracket-round">
                          <div className="bracket-round-label">{g.label}</div>
                          <div className="bracket-round-matchups">
                            {g.matchups.map(m => <MatchupCard key={m.id} m={m} />)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bracket-center">
                    <div className="bracket-round">
                      <div className="bracket-round-label bracket-round-label-champ">Championship</div>
                      {champMatchup
                        ? <MatchupCard m={champMatchup} isChampionship />
                        : <div className="bracket-tbd">TBD</div>}
                    </div>
                  </div>

                  <div className="bracket-wing">
                    <div className="bracket-wing-label">Shield Conference</div>
                    <div className="bracket-wing-rounds">
                      {scRounds.filter(r => r.matchups.length > 0).map(g => (
                        <div key={g.round} className="bracket-round">
                          <div className="bracket-round-label">{g.label}</div>
                          <div className="bracket-round-matchups">
                            {g.matchups.map(m => <MatchupCard key={m.id} m={m} />)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {seasonHistory.length > 0 && (
            <div className="bracket-history">
              <div className="bracket-history-title">Past Champions</div>
              <div className="bracket-history-list">
                {[...seasonHistory].reverse().map(r => (
                  <div key={r.year} className={`bracket-history-row${r.championId === myTeamId ? ' bracket-history-mine' : ''}`}>
                    <span className="bracket-history-year">{r.year}</span>
                    <span className="bracket-history-name">{r.championName}</span>
                    {r.championId === myTeamId && <span className="ui-badge ui-badge--primary">You</span>}
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

      {mode === 'report' && (() => {
        const myTeam = teams.find(t => t.id === myTeamId);
        if (!myTeam) return <p className="muted">Team not found.</p>;
        const gm = leagueObj.gmCareer;
        const madePlayoffs = playoff?.matchups.some(m => m.topSeedId === myTeamId || m.bottomSeedId === myTeamId) ?? false;
        const wonChampionship = playoff?.championId === myTeamId;
        const summary = generateSeasonSummary(
          leagueObj.currentSeason.games, myTeamId, myTeam.name, myTeam.abbreviation,
          leagueObj.currentSeason.year, madePlayoffs, wonChampionship,
          gm?.reputation, gm?.prevReputation,
        );
        if (!summary) return <p className="muted" style={{ padding: '1rem' }}>Not enough games played yet for a season report.</p>;

        const gradeColor: Record<string, string> = {
          A: '#34d399', 'A-': '#34d399', 'B+': '#60a5fa', B: '#60a5fa', 'B-': '#60a5fa',
          'C+': '#fbbf24', C: '#fbbf24', D: '#f97316', F: '#f87171',
        };
        const repColor: Record<string, string> = {
          'Elite': '#34d399', 'Proven Winner': '#60a5fa', 'Respected': '#fbbf24',
          'Unproven': '#f97316', 'Hot Seat': '#f87171',
        };

        return (
          <div className="yer-container">
            <div className="yer-header">
              <span className="yer-year">{summary.year} Season</span>
              <span className="yer-team">{summary.teamAbbr}</span>
              <span className="yer-record">{summary.record}</span>
            </div>
            <div className="yer-headline">{summary.headline}</div>

            <div className="yer-metrics">
              {summary.grade && (
                <div className="yer-metric">
                  <span className="yer-metric-label">Coaching Grade</span>
                  <span className="yer-metric-value" style={{ color: gradeColor[summary.grade] ?? 'var(--text-primary)' }}>{summary.grade}</span>
                </div>
              )}
              {summary.repChange && (
                <div className="yer-metric">
                  <span className="yer-metric-label">Reputation</span>
                  <span className="yer-metric-value" style={{ color: repColor[summary.repChange.tier] ?? 'var(--text-primary)' }}>{summary.repChange.tier}</span>
                  <span className="yer-metric-delta">
                    {summary.repChange.to > summary.repChange.from ? '+' : ''}{summary.repChange.to - summary.repChange.from}
                  </span>
                </div>
              )}
            </div>

            {summary.highlights.length > 0 && (
              <div className="yer-section">
                <h4 className="yer-section-title">Season Highlights</h4>
                {summary.highlights.map((h, i) => (
                  <div key={i} className="yer-highlight">{h}</div>
                ))}
              </div>
            )}

            <div className="yer-outlook">
              <h4 className="yer-section-title">Looking Ahead</h4>
              <p className="yer-outlook-text">{summary.outlook}</p>
            </div>
          </div>
        );
      })()}

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
              <GameDetail game={selectedGame} onViewPlayer={onViewPlayer} myTeamId={myTeamId} />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ── Game Recap View ───────────────────────────────────────────────────────────

function GameRecapView({ game, myTeamId }: { game: Game; myTeamId?: string }) {
  const recap = useMemo(() => generateRecap(game), [game]);
  if (!recap) return <p className="muted">Recap not available.</p>;

  const [showDrives, setShowDrives] = useState(false);
  const isMyGame = myTeamId && (game.homeTeam.id === myTeamId || game.awayTeam.id === myTeamId);
  const review = useMemo(() => isMyGame ? evaluateGameplan(game, myTeamId!) : null, [game, myTeamId]);

  const momentIcon: Record<string, string> = {
    touchdown: '🏈', turnover: '⚠', big_play: '⚡', sack: '💥', field_goal: '🥅', long_drive: '📏',
  };

  return (
    <div className="recap-container">
      {/* Headline + Paragraph */}
      <div className="recap-headline">{recap.headline}</div>
      <p className="recap-paragraph">{recap.paragraph}</p>

      {/* Gameplan Review */}
      {review && (
        <div className="recap-section">
          <h4 className="recap-section-title">Gameplan Review</h4>
          <div className={`gpr-card gpr-${review.verdict}`}>
            <div className="gpr-header">
              <span className={`gpr-verdict gpr-verdict--${review.verdict}`}>
                {review.verdict === 'effective' ? '●' : review.verdict === 'mixed' ? '◐' : '○'}
              </span>
              <span className="gpr-label">{review.label}</span>
            </div>
            <div className="gpr-metrics">
              {review.metrics.map((m, i) => (
                <div key={i} className="gpr-metric">
                  <span className="gpr-metric-label">{m.label}</span>
                  <span className={`gpr-metric-value${m.good ? ' gpr-good' : ' gpr-bad'}`}>{m.value}</span>
                </div>
              ))}
            </div>
            <div className="gpr-insights">
              {review.insights.map((ins, i) => (
                <p key={i} className="gpr-insight">{ins}</p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Standout Players */}
      {recap.standouts.length > 0 && (
        <div className="recap-section">
          <h4 className="recap-section-title">Standout Performances</h4>
          <div className="recap-standouts">
            {recap.standouts.map((s, i) => (
              <div key={i} className="recap-standout">
                <span className="recap-standout-name">{s.name}</span>
                <span className="recap-standout-line">{s.line}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Key Moments */}
      {recap.keyMoments.length > 0 && (
        <div className="recap-section">
          <h4 className="recap-section-title">Key Moments</h4>
          <div className="recap-moments">
            {recap.keyMoments.map((m, i) => (
              <div key={i} className={`recap-moment recap-moment-${m.type}`}>
                <span className="recap-moment-q">Q{m.quarter}</span>
                <span className="recap-moment-icon">{momentIcon[m.type] ?? '•'}</span>
                <span className="recap-moment-desc">{m.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Drive Summaries */}
      <div className="recap-section">
        <button className="recap-drives-toggle" onClick={() => setShowDrives(v => !v)}>
          {showDrives ? '▾' : '▸'} Drive Summaries ({recap.drives.length} drives)
        </button>
        {showDrives && (
          <div className="recap-drives">
            {recap.drives.map((d, i) => (
              <div key={i} className={`recap-drive recap-drive-${d.result}`}>
                <span className="recap-drive-team">{d.teamAbbr}</span>
                <span className="recap-drive-q">Q{d.quarter}</span>
                <span className="recap-drive-text">{formatDriveSummary(d)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Game Detail ────────────────────────────────────────────────────────────────

function GameDetail({ game, onViewPlayer, myTeamId }: { game: Game; onViewPlayer?: (id: string) => void; myTeamId?: string }) {
  const isFinal = game.status === 'final';
  const [tab, setTab] = useState<'recap' | 'pbp' | 'box' | 'watch'>('recap');
  const lines = isFinal ? formatGameLog(game) : null;

  const tabLabels: Record<string, string> = { recap: 'Recap', pbp: 'Play-by-Play', box: 'Box Score', watch: 'Watch' };

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
          {(['recap', 'pbp', 'box', 'watch'] as const).map(t => (
            <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
              {tabLabels[t]}
            </button>
          ))}
        </nav>
      )}

      {isFinal && tab === 'recap' && <GameRecapView game={game} myTeamId={myTeamId} />}
      {(!isFinal || tab === 'pbp') && (
        <div className="pbp-scroll">
          {lines
            ? lines.map((line, i) => <PbpLine key={i} line={line} game={game} />)
            : <p className="pbp-empty">This game has not been played yet.</p>}
        </div>
      )}
      {isFinal && tab === 'box'   && <BoxScoreView game={game} onViewPlayer={onViewPlayer} />}
      {isFinal && tab === 'watch' && <GameViewer game={game} />}
    </section>
  );
}

function PbpLine({ line, game, explanation }: { line: string; game: Game; explanation?: string[] }) {
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

  return (
    <div className={cls}>
      {line || '\u00a0'}
      {explanation && explanation.length > 0 && (
        <div className="pbp-explanation">
          {explanation.map((r, i) => <span key={i} className="pbp-reason">{r}</span>)}
        </div>
      )}
    </div>
  );
}

// ── Box Score ──────────────────────────────────────────────────────────────────

function BoxScoreView({ game, onViewPlayer }: { game: Game; onViewPlayer?: (id: string) => void }) {
  const bs = game.boxScore;

  function pBtn(id: string, name: string) {
    return onViewPlayer
      ? <button className="pd-trigger" onClick={() => onViewPlayer(id)}>{name}</button>
      : <span>{name}</span>;
  }

  function TeamRow({ ts }: { ts: { teamId: string; score: number; pointsByQuarter: [number, number, number, number]; totalYards: number; rushingYards: number; passingYards: number; firstDowns: number; turnovers: number; sacksAllowed: number } }) {
    const abbr = ts.teamId === game.homeTeam.id ? game.homeTeam.abbreviation : game.awayTeam.abbreviation;
    return (
      <tr>
        <td>{abbr}</td>
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

  if (!bs) {
    // Legacy fallback: no player IDs, no scoring summary, no defense section
    const legacy    = deriveBoxScore(game);
    const passers   = Object.values(legacy.players).filter(p => p.attempts > 0).sort((a, b) => b.passingYards - a.passingYards);
    const rushers   = Object.values(legacy.players).filter(p => p.carries  > 0).sort((a, b) => b.rushingYards - a.rushingYards);
    const receivers = Object.values(legacy.players).filter(p => p.targets  > 0).sort((a, b) => b.receivingYards - a.receivingYards);
    return (
      <div className="box-score">
        <table>
          <thead><tr><th>Team</th><th>Q1</th><th>Q2</th><th>Q3</th><th>Q4</th><th>Total</th><th>Yds</th><th>Rush</th><th>Pass</th><th>1D</th><th>TO</th><th>Sks</th></tr></thead>
          <tbody><TeamRow ts={legacy.away} /><TeamRow ts={legacy.home} /></tbody>
        </table>
        {passers.length > 0 && (<><h4>Passing</h4><table>
          <thead><tr><th>Player</th><th>C/ATT</th><th>YDS</th><th>TD</th><th>INT</th><th>SCK</th></tr></thead>
          <tbody>{passers.map(p => <tr key={p.name}><td>{p.name}</td><td>{p.completions}/{p.attempts}</td><td>{p.passingYards}</td><td>{p.passingTDs}</td><td>{p.interceptions}</td><td>{p.sacksTotal}</td></tr>)}</tbody>
        </table></>)}
        {rushers.length > 0 && (<><h4>Rushing</h4><table>
          <thead><tr><th>Player</th><th>CAR</th><th>YDS</th><th>TD</th></tr></thead>
          <tbody>{rushers.map(p => <tr key={p.name}><td>{p.name}</td><td>{p.carries}</td><td>{p.rushingYards}</td><td>{p.rushingTDs}</td></tr>)}</tbody>
        </table></>)}
        {receivers.length > 0 && (<><h4>Receiving</h4><table>
          <thead><tr><th>Player</th><th>TGT</th><th>REC</th><th>YDS</th><th>TD</th></tr></thead>
          <tbody>{receivers.map(p => <tr key={p.name}><td>{p.name}</td><td>{p.targets}</td><td>{p.receptions}</td><td>{p.receivingYards}</td><td>{p.receivingTDs}</td></tr>)}</tbody>
        </table></>)}
      </div>
    );
  }

  // Primary path: game.boxScore present — has player IDs, tackles, scoring summary
  const players       = Object.values(bs.players);
  const homePlayers   = players.filter(p => p.teamId === game.homeTeam.id);
  const awayPlayers   = players.filter(p => p.teamId === game.awayTeam.id);
  const passers       = players.filter(p => p.attempts > 0).sort((a, b) => b.passingYards   - a.passingYards);
  const rushers       = players.filter(p => p.carries  > 0).sort((a, b) => b.rushingYards   - a.rushingYards);
  const receivers     = players.filter(p => p.targets  > 0).sort((a, b) => b.receivingYards - a.receivingYards);
  const defFilter = (pp: typeof players) =>
    pp.filter(p => p.tackles > 0 || p.sacks > 0 || p.interceptionsCaught > 0)
      .sort((a, b) => b.tackles - a.tackles || b.sacks - a.sacks);
  const homeDefenders = defFilter(homePlayers);
  const awayDefenders = defFilter(awayPlayers);
  const homeAbbr      = game.homeTeam.abbreviation;
  const awayAbbr      = game.awayTeam.abbreviation;

  function DefTable({ defenders, teamAbbr }: { defenders: typeof homeDefenders; teamAbbr: string }) {
    if (defenders.length === 0) return null;
    return (
      <>
        <h5 className="bs-defense-team">{teamAbbr}</h5>
        <table>
          <thead><tr><th>Player</th><th>TKL</th><th>SCK</th><th>INT</th></tr></thead>
          <tbody>
            {defenders.map(p => (
              <tr key={p.playerId}>
                <td>{pBtn(p.playerId, p.name)}</td>
                <td>{p.tackles}</td>
                <td>{p.sacks}</td>
                <td>{p.interceptionsCaught}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    );
  }

  return (
    <div className="box-score">

      {/* Scoring summary */}
      {bs.scoringPlays && bs.scoringPlays.length > 0 && (
        <>
          <h4>Scoring</h4>
          <table className="scoring-summary">
            <tbody>
              {bs.scoringPlays.map(sp => {
                const scorerName = bs.players[sp.scorerId]?.name ?? '?';
                const teamAbbr   = sp.teamId === game.homeTeam.id ? homeAbbr : awayAbbr;
                const scoreStr   = `${sp.homeScore}–${sp.awayScore}`;
                const assistId   = sp.assistId;
                const assistName = assistId ? (bs.players[assistId]?.name ?? '?') : null;
                return (
                  <tr key={sp.eventIndex}>
                    <td className="sp-q">Q{sp.quarter}</td>
                    <td className="sp-team">{teamAbbr}</td>
                    <td className="sp-scorer">{pBtn(sp.scorerId, scorerName)}</td>
                    <td className="sp-desc">
                      {sp.type === 'touchdown_pass' && assistId && assistName
                        ? <>{sp.yards}-yd pass from {pBtn(assistId, assistName)}</>
                        : sp.type === 'field_goal'
                        ? `${sp.yards}-yd field goal`
                        : `${sp.yards}-yd run`}
                    </td>
                    <td className="sp-score">{scoreStr}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      {/* Team totals */}
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
              {passers.map(p => (
                <tr key={p.playerId}>
                  <td>{pBtn(p.playerId, p.name)}</td>
                  <td>{p.completions}/{p.attempts}</td>
                  <td>{p.passingYards}</td>
                  <td>{p.passingTDs}</td>
                  <td>{p.interceptions}</td>
                  <td>{p.sacksAllowed}</td>
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
              {rushers.map(p => (
                <tr key={p.playerId}>
                  <td>{pBtn(p.playerId, p.name)}</td>
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
              {receivers.map(p => (
                <tr key={p.playerId}>
                  <td>{pBtn(p.playerId, p.name)}</td>
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

      {(homeDefenders.length > 0 || awayDefenders.length > 0) && (
        <>
          <h4>Defense</h4>
          <DefTable defenders={awayDefenders} teamAbbr={awayAbbr} />
          <DefTable defenders={homeDefenders} teamAbbr={homeAbbr} />
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
  const [showPlayLogic, setShowPlayLogic] = useState(false);
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
  const quarterLabel = atEnd && events.length > 0 ? 'Final' : (quarter <= 4 ? `Q${quarter}` : quarter === 5 ? 'OT' : `OT${quarter - 4}`);

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
          : <PbpLine line={playText} game={game} explanation={showPlayLogic ? currentEvent?.explanation : undefined} />}
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
        <button
          className={`btn-logic-toggle${showPlayLogic ? ' active' : ''}`}
          onClick={() => setShowPlayLogic(v => !v)}
          title="Show why each play was selected"
        >
          {showPlayLogic ? '🧠 Logic On' : '🧠 Logic'}
        </button>
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
// Seeded pick: deterministic per-event so commentary doesn't change on re-render
function pickTemplate(templates: string[], ev: PlayEvent): string {
  const seed = ((ev.quarter * 1000 + ev.down * 100 + ev.yardLine + ev.yards + ev.distance) >>> 0) % templates.length;
  return templates[seed]!;
}

function formatPlay(ev: PlayEvent): string {
  const sit   = `${downStr(ev.down)}&${ev.distance} ${fieldPos(ev.yardLine).padEnd(7)}`;
  const qb    = ev.ballCarrier ?? '?';
  const wr    = ev.target ?? '?';
  const yds   = Math.abs(ev.yards);
  const ydStr = `${ev.yards} yd${yds !== 1 ? 's' : ''}`;
  const isBig = yds >= 15;
  let action: string;

  switch (ev.type) {
    case 'inside_run': {
      if (ev.result === 'touchdown') {
        action = pickTemplate([
          `${qb} dives in — TOUCHDOWN`,
          `${qb} punches it in — TOUCHDOWN`,
          `${qb} finds the hole and scores — TOUCHDOWN`,
          `${qb} bulls his way into the end zone — TOUCHDOWN`,
        ], ev);
      } else if (ev.yards < 0) {
        action = pickTemplate([
          `${qb} stuffed at the line — loss of ${yds}`,
          `${qb} hit in the backfield for a ${yds}-yard loss`,
          `Nowhere to go — ${qb} brought down for a loss of ${yds}`,
        ], ev);
      } else if (ev.yards === 0) {
        action = pickTemplate([
          `${qb} stopped for no gain`,
          `${qb} runs into a wall — no gain`,
          `${qb} gets nothing on the carry`,
        ], ev);
      } else if (isBig) {
        action = pickTemplate([
          `${qb} bursts through the middle for ${ydStr}!`,
          `Huge hole up the gut — ${qb} rumbles for ${ydStr}`,
          `${qb} breaks free inside for a gain of ${yds}`,
        ], ev);
      } else {
        action = pickTemplate([
          `${qb} runs up the middle for ${ydStr}`,
          `${qb} pushes forward for ${ydStr}`,
          `${qb} picks up ${ydStr} between the tackles`,
          `Handoff to ${qb} — ${ydStr} on the ground`,
          `${qb} finds a crease for ${ydStr}`,
        ], ev);
      }
      break;
    }
    case 'outside_run': {
      if (ev.result === 'touchdown') {
        action = pickTemplate([
          `${qb} sweeps in — TOUCHDOWN`,
          `${qb} turns the corner and scores — TOUCHDOWN`,
          `${qb} takes it to the house — TOUCHDOWN`,
          `${qb} races to the pylon — TOUCHDOWN`,
        ], ev);
      } else if (ev.yards < 0) {
        action = pickTemplate([
          `${qb} strung out for a ${yds}-yard loss`,
          `${qb} caught behind the line — loss of ${yds}`,
          `${qb} tries to bounce outside, loses ${yds}`,
        ], ev);
      } else if (ev.yards === 0) {
        action = pickTemplate([
          `${qb} contained at the edge — no gain`,
          `${qb} goes nowhere on the outside`,
        ], ev);
      } else if (isBig) {
        action = pickTemplate([
          `${qb} breaks it outside for ${ydStr}!`,
          `${qb} turns the corner and picks up ${ydStr}`,
          `Big run to the outside — ${qb} for ${ydStr}`,
        ], ev);
      } else {
        action = pickTemplate([
          `${qb} takes it outside for ${ydStr}`,
          `${qb} bounces it to the edge — ${ydStr}`,
          `${qb} sweeps right for ${ydStr}`,
          `Outside handoff to ${qb}, ${ydStr}`,
          `${qb} skirts the edge for a gain of ${yds}`,
        ], ev);
      }
      break;
    }
    case 'short_pass': {
      if (ev.result === 'touchdown') {
        action = pickTemplate([
          `${qb} fires to ${wr} — TOUCHDOWN`,
          `Quick throw to ${wr}, he's in — TOUCHDOWN`,
          `${qb} finds ${wr} for the score — TOUCHDOWN`,
        ], ev);
      } else if (ev.result === 'success') {
        if (isBig) {
          action = pickTemplate([
            `${qb} finds ${wr} underneath, breaks loose for ${ydStr}!`,
            `Quick pass to ${wr} — ${ydStr} after the catch`,
            `${qb} hits ${wr} on a short throw, ${wr} does the rest — ${ydStr}`,
          ], ev);
        } else {
          action = pickTemplate([
            `${qb} dumps it off to ${wr} for ${ydStr}`,
            `${qb} finds ${wr} for ${ydStr}`,
            `Quick throw to ${wr}, ${ydStr}`,
            `${qb} connects with ${wr} underneath — ${ydStr}`,
            `Short pass to ${wr} — picks up ${ydStr}`,
          ], ev);
        }
      } else {
        action = pickTemplate([
          `${qb} throws to ${wr} — incomplete`,
          `Pass to ${wr} falls incomplete`,
          `${qb} can't connect with ${wr}`,
          `Incomplete — ${wr} couldn't bring it in`,
        ], ev);
      }
      break;
    }
    case 'medium_pass': {
      if (ev.result === 'touchdown') {
        action = pickTemplate([
          `${qb} hits ${wr} in stride — TOUCHDOWN`,
          `${qb} threads it to ${wr} — TOUCHDOWN`,
          `Beautiful throw to ${wr}, he scores — TOUCHDOWN`,
        ], ev);
      } else if (ev.result === 'success') {
        if (isBig) {
          action = pickTemplate([
            `${qb} hits ${wr} over the middle for ${ydStr}!`,
            `Nice throw from ${qb} — ${wr} picks up ${ydStr}`,
            `${qb} connects with ${wr} for a big gain of ${yds}`,
          ], ev);
        } else {
          action = pickTemplate([
            `${qb} hits ${wr} for ${ydStr}`,
            `${qb} throws to ${wr} — ${ydStr}`,
            `${qb} finds ${wr} across the middle for ${ydStr}`,
            `Pass to ${wr} is complete — ${ydStr}`,
            `${qb} connects with ${wr}, gain of ${yds}`,
          ], ev);
        }
      } else {
        action = pickTemplate([
          `${qb} throws over the middle — incomplete`,
          `Pass intended for ${wr} — broken up`,
          `${qb} can't find ${wr} — incomplete`,
          `Incomplete pass — ${wr} was covered`,
        ], ev);
      }
      break;
    }
    case 'deep_pass': {
      if (ev.result === 'touchdown') {
        action = pickTemplate([
          `${qb} goes deep to ${wr} — TOUCHDOWN!`,
          `Bomb to ${wr}! He hauls it in — TOUCHDOWN`,
          `${qb} airs it out to ${wr} — TOUCHDOWN!`,
          `${wr} gets behind the defense — ${qb} finds him for the score — TOUCHDOWN`,
        ], ev);
      } else if (ev.result === 'success') {
        action = pickTemplate([
          `${qb} goes deep to ${wr} — ${ydStr}!`,
          `${qb} launches it downfield, ${wr} comes down with it — ${ydStr}`,
          `Deep ball to ${wr}, he makes the grab — ${ydStr}`,
          `Big play! ${qb} connects with ${wr} for ${ydStr}`,
        ], ev);
      } else {
        action = pickTemplate([
          `${qb} goes long to ${wr} — overthrown`,
          `Deep shot to ${wr} — incomplete`,
          `${qb} takes a shot downfield — ${wr} can't get there`,
          `${qb} fires deep but ${wr} can't haul it in`,
        ], ev);
      }
      break;
    }
    case 'scramble': {
      if (ev.result === 'touchdown') {
        action = pickTemplate([
          `${qb} scrambles and scores — TOUCHDOWN`,
          `${qb} takes off and runs it in — TOUCHDOWN`,
        ], ev);
      } else {
        action = pickTemplate([
          `${qb} scrambles for ${ydStr}`,
          `${qb} takes off — picks up ${ydStr}`,
          `Nothing open — ${qb} scrambles for ${ydStr}`,
        ], ev);
      }
      break;
    }
    case 'sack': {
      action = pickTemplate([
        `${qb} is sacked — loss of ${yds}`,
        `${qb} brought down behind the line — ${ydStr}`,
        `Sack! ${qb} goes down for a loss of ${yds}`,
        `The rush gets home — ${qb} sacked for ${ydStr}`,
      ], ev);
      break;
    }
    case 'interception': {
      action = pickTemplate([
        `${qb} throws to ${wr} — INTERCEPTED!`,
        `Picked off! ${qb}'s pass intended for ${wr} is INTERCEPTED`,
        `${qb} forces one to ${wr} — INTERCEPTED`,
        `Turnover! ${qb}'s pass is picked off`,
      ], ev);
      break;
    }
    case 'fumble': {
      action = pickTemplate([
        `${qb} puts it on the ground — FUMBLE! Turnover`,
        `Fumble! ${qb} loses the ball`,
        `${qb} coughs it up — turnover on the FUMBLE`,
      ], ev);
      break;
    }
    case 'field_goal': {
      const fgDist = (100 - ev.yardLine) + 17;
      if (ev.result === 'field_goal_good') {
        action = pickTemplate([
          `${fgDist}-yard field goal is GOOD`,
          `FG from ${fgDist} — right through the uprights`,
          `The ${fgDist}-yarder is GOOD — three points`,
        ], ev);
      } else {
        action = pickTemplate([
          `${fgDist}-yard field goal attempt — NO GOOD`,
          `FG from ${fgDist} is wide — NO GOOD`,
          `He misses the ${fgDist}-yarder — NO GOOD`,
        ], ev);
      }
      break;
    }
    case 'punt': {
      action = pickTemplate([
        `Punt — ${ydStr} downfield`,
        `Punted away for ${ydStr}`,
        `Booming punt — ${ydStr}`,
      ], ev);
      break;
    }
    default: action = ev.type;
  }

  const fd = ev.firstDown ? ' ↑' : '';
  return `${sit} | ${action}${fd}`;
}
function formatGameLog(game: Game): string[] {
  const lines: string[] = [];
  const homeId = game.homeTeam.id;
  let q = 0, homeScore = 0, awayScore = 0;
  for (const ev of (game.events ?? [])) {
    if (ev.quarter !== q) {
      if (q > 0) { lines.push(`  Score: ${game.awayTeam.abbreviation} ${awayScore} — ${game.homeTeam.abbreviation} ${homeScore}`); lines.push(''); }
      q = ev.quarter;
      const qLabel = q <= 4 ? `Q${q}` : q === 5 ? 'OT' : `OT${q - 4}`;
      lines.push(`── ${qLabel} ──`);
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
  inductionThreshold: 150,
  longevityPerYear:   2,
  championshipBonus:  12,
  rankBonus: { top3: 15, top5: 10, top10: 5 },
  seasonalRankPoints: { top1: 6, top3: 4, top5: 2, top10: 1 },
  awardPoints: { MVP: 25, OPOY: 15, DPOY: 15, OROY: 5, DROY: 5, AllPro1: 12, AllPro2: 5, Comeback_Player: 3 } as Record<string, number>,
  // Stat weights are now reduced (0.3× multiplier) — seasonal league ranks carry primary weight
  statWeights: {
    QB:  { passingYards: 0.018, passingTDs: 5.0, rushingYards: 0.008, rushingTDs: 2.0, receivingYards: 0, receivingTDs: 0, receptions: 0, sacks: 0, interceptionsCaught: 0 },
    RB:  { passingYards: 0, passingTDs: 0, rushingYards: 0.050, rushingTDs: 6.0, receivingYards: 0.015, receivingTDs: 2.0, receptions: 0.30, sacks: 0, interceptionsCaught: 0 },
    WR:  { passingYards: 0, passingTDs: 0, rushingYards: 0, rushingTDs: 0, receivingYards: 0.050, receivingTDs: 6.0, receptions: 0.40, sacks: 0, interceptionsCaught: 0 },
    TE:  { passingYards: 0, passingTDs: 0, rushingYards: 0, rushingTDs: 0, receivingYards: 0.050, receivingTDs: 6.0, receptions: 0.40, sacks: 0, interceptionsCaught: 0 },
    OL:  { passingYards: 0, passingTDs: 0, rushingYards: 0, rushingTDs: 0, receivingYards: 0, receivingTDs: 0, receptions: 0, sacks: 0, interceptionsCaught: 0 },
    DL:  { passingYards: 0, passingTDs: 0, rushingYards: 0, rushingTDs: 0, receivingYards: 0, receivingTDs: 0, receptions: 0, sacks: 10.0, interceptionsCaught: 4.0 },
    LB:  { passingYards: 0, passingTDs: 0, rushingYards: 0, rushingTDs: 0, receivingYards: 0, receivingTDs: 0, receptions: 0, sacks: 8.0, interceptionsCaught: 6.0 },
    CB:  { passingYards: 0, passingTDs: 0, rushingYards: 0, rushingTDs: 0, receivingYards: 0, receivingTDs: 0, receptions: 0, sacks: 3.0, interceptionsCaught: 12.0 },
    SAF: { passingYards: 0, passingTDs: 0, rushingYards: 0, rushingTDs: 0, receivingYards: 0, receivingTDs: 0, receptions: 0, sacks: 4.0, interceptionsCaught: 10.0 },
    ST:  { passingYards: 0, passingTDs: 0, rushingYards: 0, rushingTDs: 0, receivingYards: 0, receivingTDs: 0, receptions: 0, sacks: 0, interceptionsCaught: 0 },
  } as Record<string, Record<string, number>>,
  // Stats tracked for seasonal league rankings, per position group
  seasonalRankStats: {
    QB: ['passingYards', 'passingTDs'], RB: ['rushingYards', 'rushingTDs'],
    WR: ['receivingYards', 'receivingTDs'], TE: ['receivingYards', 'receptions'],
    OL: [], DL: ['sacks'], LB: ['tackles', 'sacks'],
    CB: ['interceptionsCaught'], SAF: ['interceptionsCaught'], ST: [],
  } as Record<string, string[]>,
  tierThresholds: { outside_shot: 40, building: 70, strong: 100, likely: 130, hall_of_famer: 150 },
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
  const srp = HOF_CONFIG.seasonalRankPoints;

  // 1. Era-relative seasonal league rank (primary stat contribution)
  const rankStats = HOF_CONFIG.seasonalRankStats[posGroup] ?? [];
  let score = 0;
  for (const s of seasons) {
    for (const stat of rankStats) {
      // Gather all players' values for this stat in this season
      const entries: number[] = [];
      let myVal = 0;
      for (const [pid, pSeasons] of Object.entries(history.playerHistory)) {
        const ps = pSeasons.find(ps2 => ps2.year === s.year);
        if (!ps) continue;
        const v = getSeasonStat(ps, stat);
        if (v > 0) {
          entries.push(v);
          if (pid === playerId) myVal = v;
        }
      }
      if (myVal <= 0) continue;
      entries.sort((a, b) => b - a);
      const rank = entries.indexOf(myVal) + 1;
      if (rank === 1)       score += srp.top1;
      else if (rank <= 3)   score += srp.top3;
      else if (rank <= 5)   score += srp.top5;
      else if (rank <= 10)  score += srp.top10;
    }
  }

  // 2. Small career stat contribution (0.3× multiplier — seasonal ranks carry primary weight)
  let pYds = 0, pTDs = 0, rYds = 0, rTDs = 0, recYds = 0, recTDs = 0, rec = 0, sacks = 0, intC = 0;
  for (const s of seasons) {
    pYds   += s.passingYards;        pTDs  += s.passingTDs;
    rYds   += s.rushingYards;        rTDs  += s.rushingTDs;
    recYds += s.receivingYards;      recTDs += s.receivingTDs;
    rec    += s.receptions;          sacks  += s.sacks;
    intC   += s.interceptionsCaught;
  }
  score += pYds   * w.passingYards * 0.3;
  score += pTDs   * w.passingTDs * 0.3;
  score += rYds   * w.rushingYards * 0.3;
  score += rTDs   * w.rushingTDs * 0.3;
  score += recYds * w.receivingYards * 0.3;
  score += recTDs * w.receivingTDs * 0.3;
  score += rec    * w.receptions * 0.3;
  score += sacks  * w.sacks * 0.3;
  score += intC   * w.interceptionsCaught * 0.3;

  // 3. Longevity
  score += seasons.length * HOF_CONFIG.longevityPerYear;

  // 4. Awards
  for (const sa of history.seasonAwards) {
    for (const a of sa.awards) {
      if (a.playerId !== playerId) continue;
      score += HOF_CONFIG.awardPoints[a.type] ?? 0;
    }
  }

  // 5. Championships
  for (const s of seasons) {
    if (history.championsByYear[s.year]?.teamId === s.teamId) {
      score += HOF_CONFIG.championshipBonus;
    }
  }

  // 6. All-time career rank bonus (smaller complement to seasonal ranks)
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

function LegacyMeter({ score, tier, label, threshold, maxOverride }: {
  score: number; tier: LegacyTier;
  label?: string; threshold?: number; maxOverride?: number;
}) {
  const thresholdVal = threshold ?? HOF_CONFIG.tierThresholds.hall_of_famer;
  const maxScore = maxOverride ?? thresholdVal + 30;
  const pct = Math.min(100, Math.round((score / maxScore) * 100));
  const thresholdPct = Math.round((thresholdVal / maxScore) * 100);
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
          {tier === 'hall_of_famer' ? '★ ' : ''}{label ?? getLegacyLabel(tier)}
        </span>
        <span className="legacy-meter-score">{score} / {thresholdVal}</span>
      </div>
      <div className="legacy-meter-bar-bg">
        <div className="legacy-meter-bar-fill" style={{ width: `${pct}%`, background: color }} />
        <div
          className="legacy-meter-threshold"
          style={{ left: `${thresholdPct}%` }}
          title={`${label ?? 'HoF'} threshold: ${thresholdVal}`}
        />
      </div>
    </div>
  );
}

/** Compute a team-specific Ring of Honor score for a player (client-side mirror). */
function computeClientTeamLegacyScore(
  playerId: string, position: string, teamId: string, history: LeagueHistory,
): number {
  const allSeasons = history.playerHistory[playerId] ?? [];
  const teamSeasons = allSeasons.filter(s => s.teamId === teamId);
  if (teamSeasons.length === 0) return 0;

  const posGroup = getPositionGroupClient(position);
  const w = HOF_CONFIG.statWeights[posGroup] ?? {};
  const rankStats = HOF_CONFIG.seasonalRankStats[posGroup] ?? [];

  let score = 0;

  // 1. Era-relative seasonal rank (team seasons only, but ranked league-wide)
  for (const s of teamSeasons) {
    for (const stat of rankStats) {
      const entries: number[] = [];
      let myVal = 0;
      for (const [pid, pSeasons] of Object.entries(history.playerHistory)) {
        const ps = pSeasons.find(ps2 => ps2.year === s.year);
        if (!ps) continue;
        const v = getSeasonStat(ps, stat);
        if (v > 0) {
          entries.push(v);
          if (pid === playerId) myVal = v;
        }
      }
      if (myVal <= 0) continue;
      entries.sort((a, b) => b - a);
      const rank = entries.indexOf(myVal) + 1;
      if (rank === 1)       score += 5;
      else if (rank <= 3)   score += 3;
      else if (rank <= 5)   score += 2;
      else if (rank <= 10)  score += 1;
    }
  }

  // 2. Small stat contribution (0.3× multiplier, team seasons only)
  let pYds = 0, pTDs = 0, rYds = 0, rTDs = 0, recYds = 0, recTDs = 0, rec = 0, sacks = 0, intC = 0;
  for (const s of teamSeasons) {
    pYds += s.passingYards; pTDs += s.passingTDs;
    rYds += s.rushingYards; rTDs += s.rushingTDs;
    recYds += s.receivingYards; recTDs += s.receivingTDs;
    rec += s.receptions; sacks += s.sacks; intC += s.interceptionsCaught;
  }
  score += (pYds * (w.passingYards ?? 0) + pTDs * (w.passingTDs ?? 0) +
    rYds * (w.rushingYards ?? 0) + rTDs * (w.rushingTDs ?? 0) +
    recYds * (w.receivingYards ?? 0) + recTDs * (w.receivingTDs ?? 0) +
    rec * (w.receptions ?? 0) + sacks * (w.sacks ?? 0) + intC * (w.interceptionsCaught ?? 0)) * 0.3;

  // 3. Longevity + loyalty
  score += teamSeasons.length * 2;
  if (teamSeasons.length > 3) score += (teamSeasons.length - 3) * 3;

  // 4. Awards earned while on team
  const rohAwards: Record<string, number> = { MVP: 20, OPOY: 12, DPOY: 12, OROY: 4, DROY: 4, AllPro1: 10, AllPro2: 4, Comeback_Player: 2 };
  for (const sa of history.seasonAwards) {
    for (const a of sa.awards) {
      if (a.playerId !== playerId) continue;
      if (!teamSeasons.some(s => s.year === sa.year)) continue;
      score += rohAwards[a.type] ?? 0;
    }
  }

  // 5. Championships with team
  for (const s of teamSeasons) {
    if (history.championsByYear[s.year]?.teamId === teamId) score += 10;
  }

  return Math.round(score);
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
            <EmptyState icon="★" message="No inductees yet. Players are evaluated for the Hall of Fame after retirement." />
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
            <EmptyState message="No retired players with enough legacy score to track." compact />
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

type NewsFilter = 'all' | 'my-team' | 'games' | 'transactions' | 'awards' | 'milestones';

const NEWS_IMPORTANCE: Record<string, number> = {
  championship: 3, hall_of_fame: 3, ring_of_honor: 2, retired_jersey: 2,
  playoff_result: 2, award: 2, trade: 2, upset: 2, gm_milestone: 2,
  milestone: 1, big_performance: 1, stat_race: 1, streak: 1,
};

function NewsView({ news, myTeamId, onViewPlayer }: {
  news: NewsItem[];
  myTeamId: string;
  onViewPlayer?: (id: string) => void;
}) {
  const [filter, setFilter] = useState<NewsFilter>('all');

  const sorted = [...news].sort((a, b) => b.createdAt - a.createdAt);
  const myTeamCount = sorted.filter(n => n.teamIds.includes(myTeamId)).length;

  let filtered: NewsItem[];
  if (filter === 'my-team') {
    filtered = sorted.filter(n => n.teamIds.includes(myTeamId));
  } else if (filter === 'all') {
    filtered = sorted;
  } else {
    filtered = sorted.filter(n => (NEWS_FILTER_CATEGORY[n.type] ?? 'other') === filter);
  }

  const filters: { id: NewsFilter; label: string; count?: number }[] = [
    { id: 'all',          label: 'All' },
    { id: 'my-team',      label: 'My Team', count: myTeamCount },
    { id: 'games',        label: 'Games' },
    { id: 'transactions', label: 'Transactions' },
    { id: 'awards',       label: 'Awards' },
    { id: 'milestones',   label: 'Milestones' },
  ];

  return (
    <section className="roster-page">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="roster-header">
        <div className="roster-header-left">
          <h2 className="roster-title">League News</h2>
        </div>
        <div className="roster-header-stats">
          <div className="roster-header-stat"><span className="roster-header-val">{news.length}</span><span className="roster-header-lbl">Stories</span></div>
          {myTeamCount > 0 && <div className="roster-header-stat"><span className="roster-header-val" style={{ color: 'var(--primary)' }}>{myTeamCount}</span><span className="roster-header-lbl">Your Team</span></div>}
        </div>
      </div>

      {/* ── Filters ────────────────────────────────────────────── */}
      <TabBar
        tabs={filters.map(f => ({ id: f.id, label: f.label, badge: f.count && f.count > 0 ? f.count : undefined }))}
        activeId={filter}
        onSelect={(id) => setFilter(id as NewsFilter)}
        size="sm"
      />

      {/* ── Feed ───────────────────────────────────────────────── */}
      {filtered.length === 0
        ? <EmptyState message={news.length === 0 ? 'No news yet — advance the week to generate stories.' : 'No news in this category.'} />
        : <div className="news-feed">
            {filtered.map(n => (
              <NewsCard
                key={n.id}
                item={n}
                isMyTeam={n.teamIds.includes(myTeamId)}
                importance={NEWS_IMPORTANCE[n.type] ?? 0}
                onViewPlayer={onViewPlayer}
              />
            ))}
          </div>
      }
    </section>
  );
}

function NewsCard({ item: n, isMyTeam, importance, onViewPlayer }: {
  item: NewsItem;
  isMyTeam: boolean;
  importance?: number;
  onViewPlayer?: (id: string) => void;
}) {
  const playerMentions = n.mentions?.filter(m => m.entityType === 'player') ?? [];
  const imp = importance ?? 0;
  return (
    <div className={`news-item ${NEWS_TYPE_CLASS[n.type] ?? ''}${isMyTeam ? ' news-item-mine' : ''}${imp >= 3 ? ' news-item-major' : imp >= 2 ? ' news-item-notable' : ''}`}>
      <div className="news-header">
        <span className={`news-badge ${NEWS_TYPE_CLASS[n.type] ?? ''}`}>
          {NEWS_TYPE_LABEL[n.type] ?? n.type}
        </span>
        {isMyTeam && <span className="news-mine-tag">Your Team</span>}
        <span className="news-meta">
          {n.week > 0 ? `Wk ${n.week}` : ''}{n.week > 0 && n.year ? ' · ' : ''}{n.year}
        </span>
      </div>
      <div className="news-headline">{n.headline}</div>
      {n.body && <div className="news-body">{n.body}</div>}
      {playerMentions.length > 0 && onViewPlayer && (
        <div className="news-mentions">
          {playerMentions.map(m => (
            <button key={m.id} className="entity-link news-mention-btn" onClick={() => onViewPlayer(m.id)}>
              {m.name}
            </button>
          ))}
        </div>
      )}
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
  const [proposeSuccess, setProposeSuccess] = useState<string | null>(null);

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
    setProposeBusy(true); setProposeError(null); setProposeSuccess(null);
    try {
      const partnerName = teamName(targetTeamId);
      await onPropose(targetTeamId, fromAssets, toAssets);
      setGiveSet(new Set()); setReceiveSet(new Set()); setTargetTeamId('');
      setProposeSuccess(`Trade proposal sent to ${partnerName}. Check incoming proposals for their response.`);
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

  // Grouped player rendering helper
  function renderGroupedChecklist(roster: Player[], selectedSet: Set<string>, onToggle: (key: string) => void, picks: PickAsset[]) {
    return (
      <div className="trade-asset-browser">
        {/* Draft picks section */}
        {picks.length > 0 && (
          <div className="trade-picks-section">
            <div className="trade-picks-header">Draft Picks</div>
            <div className="trade-picks-list">
              {picks.map(pk => {
                const k = pickKey(pk); const checked = selectedSet.has(k);
                return (
                  <label key={k} className={`trade-check pick${checked ? ' selected' : ''}`}>
                    <input type="checkbox" checked={checked} onChange={() => onToggle(k)} />
                    <span className="trade-pick-label">{pk.year} R{pk.round}</span>
                    <span className="muted">{pk.originalTeamName}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}
        {/* Position groups */}
        {ROSTER_POS_GROUPS.map(group => {
          const players = roster
            .filter(p => group.positions.includes(p.position))
            .sort((a, b) => b.scoutedOverall - a.scoutedOverall);
          if (players.length === 0) return null;
          return (
            <div key={group.label} className="trade-pos-group">
              <div className="trade-pos-header">
                <span className="trade-pos-name">{group.label}</span>
                <span className="trade-pos-count">{players.length}</span>
              </div>
              <div className="trade-pos-list">
                {players.map(p => {
                  const k = `p:${p.id}`; const checked = selectedSet.has(k);
                  return (
                    <label key={k} className={`trade-check${checked ? ' selected' : ''}`}>
                      <input type="checkbox" checked={checked} onChange={() => onToggle(k)} />
                      <span className="trade-check-name">{p.name}</span>
                      <span className="trade-check-pos">{p.position}</span>
                      <span className={`trade-check-ovr${p.scoutedOverall >= 80 ? ' ovr-elite' : p.scoutedOverall < 60 ? ' ovr-low' : ''}`}>{p.scoutedOverall}</span>
                      <span className="trade-check-sal">${p.salary}M</span>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
        {roster.length === 0 && picks.length === 0 && <EmptyState message="No assets available." compact />}
      </div>
    );
  }

  return (
    <section className="roster-page">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="roster-header">
        <div className="roster-header-left">
          <h2 className="roster-title">Trades</h2>
        </div>
        <div className="roster-header-stats">
          {incoming.length > 0 && <div className="roster-header-stat"><span className="roster-header-val neg">{incoming.length}</span><span className="roster-header-lbl">Incoming</span></div>}
          <div className="roster-header-stat"><span className="roster-header-val">{history.filter(p => p.status === 'accepted').length}</span><span className="roster-header-lbl">Completed</span></div>
          <div className="roster-header-stat"><span className="roster-header-val">${(CAP_LIMIT - myPayroll).toFixed(1)}M</span><span className="roster-header-lbl">Cap Space</span></div>
        </div>
      </div>

      {/* ── Incoming Proposals ──────────────────────────────────── */}
      {incoming.length > 0 && (
        <div className="trade-section">
          <div className="trade-section-title">Incoming Proposals <span className="ui-count">{incoming.length}</span></div>
          {respondError && <div className="form-error">{respondError}</div>}
          {incoming.map((p: TradeProposal) => {
            const gv = p.fromAssets.reduce((s, a) => s + assetDisplayValue(a), 0);
            const rv = p.toAssets.reduce((s, a) => s + assetDisplayValue(a), 0);
            return (
              <div key={p.id} className="trade-card">
                <div className="trade-teams">
                  <strong>{teamName(p.fromTeamId)}</strong>
                  <FoPersonalityBadge personality={league.teams.find(t => t.id === p.fromTeamId)?.frontOffice} size="sm" />
                  <span className="muted">→</span>
                  <strong>You</strong>
                </div>
                <div className="trade-sides">
                  <div className="trade-side">
                    <span className="trade-side-label">They give <span className="muted">({gv})</span></span>
                    {p.fromAssets.map((a, i) => <div key={i} className="trade-asset">{assetLabel(a)}</div>)}
                    {p.fromAssets.length === 0 && <div className="muted">nothing</div>}
                  </div>
                  <div className="trade-side">
                    <span className="trade-side-label">You give <span className="muted">({rv})</span></span>
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
        </div>
      )}

      {/* ── Trade Builder ──────────────────────────────────────── */}
      <div className="trade-section">
        <div className="trade-section-title">Propose Trade</div>
        {proposeError && <div className="form-error">{proposeError}</div>}
        {proposeSuccess && <div className="trade-success">{proposeSuccess}</div>}

        <div className="trade-builder">
          <div className="trade-builder-row">
            <label>Trade partner:</label>
            <select value={targetTeamId} onChange={e => { setTargetTeamId(e.target.value); setGiveSet(new Set()); setReceiveSet(new Set()); }}>
              <option value="">— select team —</option>
              {aiTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            {targetTeam?.frontOffice && <FoPersonalityBadge personality={targetTeam.frontOffice} size="sm" />}
          </div>

          {targetTeam && (
            <>
              {/* Proposal summary strip */}
              <div className="trade-summary">
                <div className="trade-summary-side">
                  <div className="trade-summary-label">You send ({fromAssets.length})</div>
                  {fromAssets.length > 0
                    ? <div className="trade-summary-assets">{fromAssets.map((a, i) => <span key={i} className="trade-summary-chip">{a.type === 'player' ? `${a.playerName} (${a.playerPos})` : `${a.year} R${a.round}`}</span>)}</div>
                    : <div className="muted trade-summary-empty">Select players or picks below</div>}
                  {giveVal > 0 && <div className="trade-summary-val">Value: {giveVal}</div>}
                </div>
                <div className="trade-summary-arrow">⇄</div>
                <div className="trade-summary-side">
                  <div className="trade-summary-label">You receive ({toAssets.length})</div>
                  {toAssets.length > 0
                    ? <div className="trade-summary-assets">{toAssets.map((a, i) => <span key={i} className="trade-summary-chip">{a.type === 'player' ? `${a.playerName} (${a.playerPos})` : `${a.year} R${a.round}`}</span>)}</div>
                    : <div className="muted trade-summary-empty">Select players or picks below</div>}
                  {recvVal > 0 && <div className="trade-summary-val">Value: {recvVal}</div>}
                </div>
              </div>

              {/* Cap impact + fairness */}
              {(fromAssets.length > 0 || toAssets.length > 0) && (
                <div className="trade-impact-row">
                  <div className={`trade-cap-impact${postTradePayroll > CAP_LIMIT ? ' cap-over' : postTradePayroll > CAP_LIMIT * 0.92 ? ' cap-warn' : ''}`}>
                    Post-trade cap: ${postTradePayroll.toFixed(1)}M / ${CAP_LIMIT}M
                    {postTradePayroll > CAP_LIMIT && ' — exceeds cap!'}
                  </div>
                  {giveVal > 0 && recvVal > 0 && (
                    <span className={`trade-fairness ${recvVal >= giveVal * 0.85 ? 'fair' : recvVal >= giveVal * 0.70 ? 'borderline' : 'unfair'}`}>
                      {recvVal >= giveVal * 0.85 ? 'Fair trade' : recvVal >= giveVal * 0.70 ? 'Borderline' : 'Lopsided'}
                    </span>
                  )}
                </div>
              )}

              {/* Submit */}
              <div className="trade-submit-row">
                <button
                  className="btn-primary"
                  disabled={proposeBusy || (fromAssets.length === 0 && toAssets.length === 0)}
                  onClick={submitProposal}
                >
                  {proposeBusy ? 'Submitting…' : 'Submit Proposal'}
                </button>
                {(fromAssets.length > 0 || toAssets.length > 0) && (
                  <button className="btn-sm" onClick={() => { setGiveSet(new Set()); setReceiveSet(new Set()); }}>Clear</button>
                )}
              </div>

              {/* Two-sided asset browsers */}
              <div className="trade-sides">
                <div className="trade-side">
                  <div className="trade-side-header">
                    <strong>{myTeam.name}</strong>
                    <span className="muted">{myTeam.roster.length} players · {myPicks.length} picks</span>
                  </div>
                  {renderGroupedChecklist(myTeam.roster, giveSet, toggleGive, myPicks)}
                </div>
                <div className="trade-side">
                  <div className="trade-side-header">
                    <strong>{targetTeam.name}</strong>
                    <span className="muted">{targetTeam.roster.length} players · {targetPicks.length} picks</span>
                  </div>
                  {renderGroupedChecklist(targetTeam.roster, receiveSet, toggleReceive, targetPicks)}
                </div>
              </div>
            </>
          )}
          {!targetTeam && <EmptyState message="Select a trade partner above to begin building a proposal." compact />}
        </div>
      </div>

      {/* ── Shop a Player ──────────────────────────────────────── */}
      <div className="trade-section">
        <div className="trade-section-title">Shop a Player</div>
        <div className="shop-player-panel">
          <div className="contracts-section-intro">Select one of your players to find CPU teams willing to make an offer.</div>
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
            <div className={`shop-status${shopStatus.startsWith('No offers') ? ' muted' : ' shop-status-ok'}`}>
              {shopStatus}
            </div>
          )}
        </div>
      </div>

      {/* ── History ────────────────────────────────────────────── */}
      {history.length > 0 && (
        <div className="trade-section">
          <div className="trade-section-title">Recent History</div>
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
        </div>
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
  const capSpace = CAP_LIMIT - payroll;
  const injured  = team.roster.filter(p => p.injuryWeeksRemaining > 0).length;
  const demands  = team.roster.filter(p => p.contractDemand).length;
  const avgOvr   = team.roster.length > 0 ? Math.round(team.roster.reduce((s, p) => s + p.scoutedOverall, 0) / team.roster.length) : 0;
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  function toggleGroup(label: string) {
    setCollapsed(prev => ({ ...prev, [label]: !prev[label] }));
  }

  return (
    <section className="roster-page">
      {/* Header */}
      <div className="roster-header">
        <div className="roster-header-left">
          <TeamLogo abbr={team.abbreviation} size={36} />
          <h2 className="roster-title">
            Roster
            {!isMyTeam && team.frontOffice && (
              <FoPersonalityBadge personality={team.frontOffice} size="sm" />
            )}
          </h2>
          <select className="roster-team-select" value={selectedId} onChange={e => onSelect(e.target.value)}>
            {teams.map(t => (
              <option key={t.id} value={t.id}>{t.name}{t.id === userTeamId ? ' (You)' : ''}</option>
            ))}
          </select>
        </div>
        <div className="roster-header-stats">
          <div className="roster-header-stat"><span className="roster-header-val">{team.roster.length}</span><span className="roster-header-lbl">Players</span></div>
          <div className="roster-header-stat"><span className="roster-header-val">{avgOvr}</span><span className="roster-header-lbl">Avg OVR</span></div>
          <div className="roster-header-stat"><span className={`roster-header-val${capSpace < 5 ? ' neg' : ''}`}>${capSpace.toFixed(1)}M</span><span className="roster-header-lbl">Cap Space</span></div>
          {injured > 0 && <div className="roster-header-stat"><span className="roster-header-val neg">{injured}</span><span className="roster-header-lbl">Injured</span></div>}
          {isMyTeam && demands > 0 && <div className="roster-header-stat"><span className="roster-header-val" style={{ color: 'var(--warning)' }}>{demands}</span><span className="roster-header-lbl">Demands</span></div>}
        </div>
      </div>

      {isMyTeam && !isOffseason && (demands > 0 || injured > 0) && (
        <EmptyState message="Roster moves (cut, extend) available during the offseason." compact />
      )}

      {/* Position groups */}
      <div className="roster-groups">
        {ROSTER_POS_GROUPS.map(group => {
          const players = team.roster
            .filter(p => group.positions.includes(p.position))
            .sort((a, b) => b.scoutedOverall - a.scoutedOverall);
          if (players.length === 0) return null;
          const groupAvg = Math.round(players.reduce((s, p) => s + p.scoutedOverall, 0) / players.length);
          const groupInjured = players.filter(p => p.injuryWeeksRemaining > 0).length;
          const isCollapsed = !!collapsed[group.label];

          return (
            <div key={group.label} className="roster-group">
              <button className={`roster-group-header${isCollapsed ? ' roster-group-collapsed' : ''}`} onClick={() => toggleGroup(group.label)}>
                <span className="roster-group-toggle">{isCollapsed ? '▸' : '▾'}</span>
                <span className="roster-group-name">{group.label}</span>
                <span className="roster-group-count">{players.length}</span>
                <span className={`roster-group-ovr${groupAvg >= 75 ? ' pos' : groupAvg < 60 ? ' neg' : ''}`}>{groupAvg} OVR</span>
                {groupInjured > 0 && <span className="roster-group-inj">{groupInjured} IR</span>}
              </button>
              {!isCollapsed && (
                <table className="ui-table roster-table">
                  <thead>
                    <tr>
                      <th>Name</th><th>Pos</th><th className="num">Age</th><th className="num">OVR</th><th className="num">Salary</th><th className="num">Yrs</th><th className="num">Pro</th><th>Status</th>
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
              )}
            </div>
          );
        })}
      </div>
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
    <tr className={`roster-row${injured ? ' roster-row-injured' : ''}${isStarter ? ' roster-row-starter' : ''}`}>
      <td className="roster-name-cell">
        {isStarter && <span className="starter-badge">S</span>}
        {onViewPlayer
          ? <button className="entity-link" onClick={() => onViewPlayer(p.id)}>{p.name}</button>
          : p.name}
        {p.isRookie && <span className="rookie-badge">R</span>}
        {devBadge && <span className={`dev-trait-badge dev-trait-${p.devTrait}`} title={devBadge.label}>{devBadge.short}</span>}
      </td>
      <td className="roster-pos-cell">{p.position}</td>
      <td className="num">{p.age}</td>
      <td className={`num ovr-cell${p.scoutedOverall >= 80 ? ' ovr-elite' : p.scoutedOverall < 60 ? ' ovr-low' : ''}`}>{p.scoutedOverall}</td>
      <td className="num">${p.salary}M</td>
      <td className={`num${p.yearsRemaining === 1 ? ' expiring' : ''}`}>{p.yearsRemaining}yr</td>
      <td className="num muted">{p.yearsPro ?? 0}</td>
      <td className="roster-status-cell">
        {injured && <span className="ui-badge ui-badge--danger">IR {p.injuryWeeksRemaining}wk</span>}
        {p.contractDemand && <span className="ui-badge ui-badge--warning" title={`Wants $${p.contractDemand.salary}M/${p.contractDemand.years}yr`}>!</span>}
        {!injured && !p.contractDemand && <span className="muted">—</span>}
      </td>
      {isMyTeam && (
        <td className="action-cell">
          {isOffseason && <button className="btn-sm btn-danger" disabled={busy} onClick={onRelease}>Cut</button>}
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

function DepthChartView({ team, busy, onReorder, onViewPlayer }: {
  team: League['teams'][0];
  busy: boolean;
  onReorder: (slot: string, playerIds: string[]) => void;
  onViewPlayer?: (id: string) => void;
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
                  {onViewPlayer ? <button className="entity-link depth-name" onClick={() => onViewPlayer(p.id)}>{p.name}</button> : <span className="depth-name">{p.name}</span>}
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

function InjuryReportView({ teams, userTeamId, onViewPlayer }: { teams: League['teams']; userTeamId: string; onViewPlayer?: (id: string) => void }) {
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
              <td>{onViewPlayer ? <button className="entity-link" onClick={() => onViewPlayer(p.id)}>{p.name}</button> : p.name}</td>
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

function FreeAgentsView({ league, myTeamId, busy, onOffer, onViewPlayer }: {
  league:    League;
  myTeamId:  string;
  busy:      boolean;
  onOffer:   (playerId: string, salary: number, years: number) => void;
  onViewPlayer?: (id: string) => void;
}) {
  const isOffseason  = league.phase === 'offseason';
  const myTeam       = league.teams.find(t => t.id === myTeamId)!;
  const payroll      = myTeam.roster.reduce((s, p) => s + p.salary, 0);
  const capRemaining = CAP_LIMIT - payroll;
  const freeAgents   = league.freeAgents;
  const faAvgOvr     = freeAgents.length > 0 ? Math.round(freeAgents.reduce((s, p) => s + p.scoutedOverall, 0) / freeAgents.length) : 0;
  const faInjured    = freeAgents.filter(p => p.injuryWeeksRemaining > 0).length;

  const [offers, setOffers]       = useState<Record<string, { salary: string; years: string }>>({});
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  function toggleGroup(label: string) { setCollapsed(prev => ({ ...prev, [label]: !prev[label] })); }
  function getOffer(id: string) { return offers[id] ?? { salary: '', years: '' }; }
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
    <section className="roster-page">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="roster-header">
        <div className="roster-header-left">
          <h2 className="roster-title">Free Agents</h2>
        </div>
        <div className="roster-header-stats">
          <div className="roster-header-stat"><span className="roster-header-val">{freeAgents.length}</span><span className="roster-header-lbl">Available</span></div>
          <div className="roster-header-stat"><span className="roster-header-val">{faAvgOvr}</span><span className="roster-header-lbl">Avg OVR</span></div>
          <div className="roster-header-stat"><span className={`roster-header-val${capRemaining < 10 ? ' neg' : ''}`}>${capRemaining.toFixed(1)}M</span><span className="roster-header-lbl">Cap Space</span></div>
          {faInjured > 0 && <div className="roster-header-stat"><span className="roster-header-val neg">{faInjured}</span><span className="roster-header-lbl">Injured</span></div>}
        </div>
      </div>

      {/* Cap bar */}
      <div className="fa-cap-bar">
        <div className="fa-cap-label">
          <span>Cap: ${payroll.toFixed(1)}M / ${CAP_LIMIT}M</span>
          <span className={capRemaining < 10 ? 'neg' : 'muted'}>${capRemaining.toFixed(1)}M remaining</span>
        </div>
        <div className="fa-cap-track">
          <div className="fa-cap-fill" style={{ width: `${capPct}%`, background: capPct > 90 ? 'var(--danger)' : capPct > 75 ? 'var(--warning)' : 'var(--info)' }} />
        </div>
      </div>

      {!isOffseason && <EmptyState message="Signing available during offseason only. Browse the market to plan ahead." compact />}

      {/* ── Position groups ────────────────────────────────────── */}
      <div className="roster-groups">
        {ROSTER_POS_GROUPS.map(group => {
          const players = freeAgents
            .filter(p => group.positions.includes(p.position))
            .sort((a, b) => b.scoutedOverall - a.scoutedOverall);
          if (players.length === 0) return null;
          const groupAvg = Math.round(players.reduce((s, p) => s + p.scoutedOverall, 0) / players.length);
          const groupInj = players.filter(p => p.injuryWeeksRemaining > 0).length;
          const isCollapsed = !!collapsed[group.label];

          return (
            <div key={group.label} className="roster-group">
              <button className={`roster-group-header${isCollapsed ? ' roster-group-collapsed' : ''}`} onClick={() => toggleGroup(group.label)}>
                <span className="roster-group-toggle">{isCollapsed ? '▸' : '▾'}</span>
                <span className="roster-group-name">{group.label}</span>
                <span className="roster-group-count">{players.length}</span>
                <span className={`roster-group-ovr${groupAvg >= 70 ? ' pos' : groupAvg < 55 ? ' neg' : ''}`}>{groupAvg} OVR</span>
                {groupInj > 0 && <span className="roster-group-inj">{groupInj} IR</span>}
              </button>
              {!isCollapsed && (
                <table className="ui-table roster-table">
                  <thead>
                    <tr>
                      <th>Name</th><th>Pos</th><th className="num">Age</th><th className="num">OVR</th>
                      <th className="num">Asking</th>
                      {isOffseason && <><th>Offer $</th><th>Yrs</th><th></th></>}
                    </tr>
                  </thead>
                  <tbody>
                    {players.map(p => {
                      const asking = calcFAAskingPrice(p);
                      const o      = getOffer(p.id);
                      const injured = p.injuryWeeksRemaining > 0;
                      return (
                        <tr key={p.id} className={injured ? 'roster-row-injured' : ''}>
                          <td className="roster-name-cell">
                            {onViewPlayer ? <button className="entity-link" onClick={() => onViewPlayer(p.id)}>{p.name}</button> : <span>{p.name}</span>}
                            {p.isRookie && <span className="rookie-badge">R</span>}
                            {injured && <span className="ui-badge ui-badge--danger">IR</span>}
                          </td>
                          <td className="roster-pos-cell">{p.position}</td>
                          <td className="num">{p.age}</td>
                          <td className={`num ovr-cell${p.scoutedOverall >= 80 ? ' ovr-elite' : p.scoutedOverall < 60 ? ' ovr-low' : ''}`}>{p.scoutedOverall}</td>
                          <td className="num fa-asking">${asking.salary}M / {asking.years}yr</td>
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
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Team Overview ──────────────────────────────────────────────────────────────

function TeamOverviewView({ league, myTeamId }: { league: League; myTeamId: string }) {
  const team    = league.teams.find(t => t.id === myTeamId)!;
  const games   = league.currentSeason.games;
  const payroll = team.roster.reduce((s, p) => s + p.salary, 0);
  const capSpace = CAP_LIMIT - payroll;
  const injured  = team.roster.filter(p => p.injuryWeeksRemaining > 0).length;

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

  const gamesPlayed = w + l + ties;
  const ppg = gamesPlayed > 0 ? (pf / gamesPlayed).toFixed(1) : '—';
  const oppPpg = gamesPlayed > 0 ? (pa / gamesPlayed).toFixed(1) : '—';

  // Next game
  const nextGame = games.find(g => g.status !== 'final' && (g.homeTeam.id === myTeamId || g.awayTeam.id === myTeamId));
  const recentGames = games
    .filter(g => g.status === 'final' && (g.homeTeam.id === myTeamId || g.awayTeam.id === myTeamId))
    .slice(-5).reverse();

  // Roster breakdown by position group
  const posGroups = [
    { label: 'QB', positions: ['QB'] },
    { label: 'RB', positions: ['RB'] },
    { label: 'WR', positions: ['WR'] },
    { label: 'TE', positions: ['TE'] },
    { label: 'OL', positions: ['OT', 'OG', 'C'] },
    { label: 'DL', positions: ['DE', 'DT'] },
    { label: 'LB', positions: ['OLB', 'MLB', 'LB'] },
    { label: 'DB', positions: ['CB', 'FS', 'SS', 'S'] },
    { label: 'K/P', positions: ['K', 'P'] },
  ];
  const rosterByGroup = posGroups.map(g => ({
    ...g,
    count: team.roster.filter(p => g.positions.includes(p.position)).length,
    avgOvr: (() => {
      const players = team.roster.filter(p => g.positions.includes(p.position));
      return players.length > 0 ? Math.round(players.reduce((s, p) => s + p.scoutedOverall, 0) / players.length) : 0;
    })(),
  }));

  // Team-wide average OVR
  const avgOvr = team.roster.length > 0 ? Math.round(team.roster.reduce((s, p) => s + p.scoutedOverall, 0) / team.roster.length) : 0;

  // Division / conference context
  const teamDiv = league.divisions?.find(d => d.teamIds.includes(myTeamId));
  const conf = teamDiv?.conference ?? '';
  const div = teamDiv?.division ?? '';
  const diff = pf - pa;

  // Streak
  const streakGames = [...recentGames];
  let streakType = '';
  let streakCount = 0;
  if (streakGames.length > 0) {
    const firstResult = (() => {
      const g = streakGames[0]!;
      const isH = g.homeTeam.id === myTeamId;
      const ms = isH ? g.homeScore : g.awayScore;
      const os = isH ? g.awayScore : g.homeScore;
      return ms > os ? 'W' : ms < os ? 'L' : 'T';
    })();
    streakType = firstResult;
    for (const g of streakGames) {
      const isH = g.homeTeam.id === myTeamId;
      const ms = isH ? g.homeScore : g.awayScore;
      const os = isH ? g.awayScore : g.homeScore;
      const r = ms > os ? 'W' : ms < os ? 'L' : 'T';
      if (r === firstResult) streakCount++;
      else break;
    }
  }

  return (
    <section className="ov-page">

      {/* ── Team header ────────────────────────────────────────── */}
      <div className="ov-header">
        <div className="ov-header-identity">
          <div className="ov-header-logo-wrap">
            <TeamLogo abbr={team.abbreviation} size={56} />
          </div>
          <div>
            <h2 className="ov-header-name">{team.name}</h2>
            <div className="ov-header-meta">
              <span className="ov-header-record">{w}–{l}{ties > 0 ? `–${ties}` : ''}</span>
              {conf && div && <span className="ov-header-division">{conf} {div}</span>}
              {team.frontOffice && <FoPersonalityBadge personality={team.frontOffice} size="sm" />}
            </div>
          </div>
        </div>
        <div className="ov-header-stats">
          <div className="ov-header-stat"><span className="ov-header-stat-val">{ppg}</span><span className="ov-header-stat-lbl">PPG</span></div>
          <div className="ov-header-stat"><span className="ov-header-stat-val">{oppPpg}</span><span className="ov-header-stat-lbl">OPP PPG</span></div>
          <div className="ov-header-stat">
            <span className={`ov-header-stat-val ${diff >= 0 ? 'pos' : 'neg'}`}>{diff >= 0 ? '+' : ''}{diff}</span>
            <span className="ov-header-stat-lbl">DIFF</span>
          </div>
          <div className="ov-header-stat"><span className="ov-header-stat-val">{avgOvr}</span><span className="ov-header-stat-lbl">AVG OVR</span></div>
          {streakCount > 0 && (
            <div className="ov-header-stat">
              <span className={`ov-header-stat-val ${streakType === 'W' ? 'pos' : streakType === 'L' ? 'neg' : ''}`}>{streakType}{streakCount}</span>
              <span className="ov-header-stat-lbl">STREAK</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Two-column main content ────────────────────────────── */}
      <div className="ov-columns">

        {/* LEFT — Primary content */}
        <div className="ov-col-primary">

          {/* Roster Breakdown */}
          <div className="ov-section">
            <div className="ov-section-title">Roster Breakdown</div>
            <div className="ov-roster-grid">
              {rosterByGroup.filter(g => g.count > 0).map(g => (
                <div key={g.label} className="ov-roster-cell">
                  <span className="ov-roster-pos">{g.label}</span>
                  <span className="ov-roster-count">{g.count}</span>
                  <span className={`ov-roster-ovr ${g.avgOvr >= 75 ? 'pos' : g.avgOvr < 60 ? 'neg' : ''}`}>{g.avgOvr} OVR</span>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Results */}
          {recentGames.length > 0 && (
            <div className="ov-section">
              <div className="ov-section-title">Recent Results</div>
              <div className="ov-results-list">
                {recentGames.map(g => {
                  const isHome = g.homeTeam.id === myTeamId;
                  const myScore  = isHome ? g.homeScore : g.awayScore;
                  const oppScore = isHome ? g.awayScore : g.homeScore;
                  const opp = isHome ? g.awayTeam : g.homeTeam;
                  const result = myScore > oppScore ? 'W' : myScore < oppScore ? 'L' : 'T';
                  return (
                    <div key={g.id} className={`ov-result-row ov-result-${result.toLowerCase()}`}>
                      <span className="ov-result-week">WK {g.week}</span>
                      <span className="ov-result-opponent">
                        <TeamLogo abbr={opp.abbreviation} size={20} />
                        <span>{isHome ? 'vs' : '@'} {opp.name}</span>
                      </span>
                      <span className={`ov-result-outcome ov-result-${result.toLowerCase()}`}>
                        <span className="ov-result-letter">{result}</span>
                        <span className="ov-result-score">{myScore}–{oppScore}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT — Sidebar */}
        <div className="ov-col-sidebar">

          {/* Cap Space */}
          <div className="ov-sidebar-card">
            <div className="ov-sidebar-card-title">Cap Space</div>
            <div className={`ov-sidebar-big-num ${capSpace < 5 ? 'neg' : capSpace > 30 ? 'pos' : ''}`}>${capSpace.toFixed(1)}M</div>
            <div className="ov-cap-bar-track">
              <div className="ov-cap-bar-fill" style={{ width: `${Math.min(100, (payroll / CAP_LIMIT) * 100)}%` }} />
            </div>
            <div className="ov-cap-bar-labels">
              <span>${payroll.toFixed(1)}M used</span>
              <span>${CAP_LIMIT}M cap</span>
            </div>
          </div>

          {/* Roster Status */}
          <div className="ov-sidebar-card">
            <div className="ov-sidebar-card-title">Roster</div>
            <div className="ov-sidebar-kv">
              <div className="ov-kv"><span>Players</span><span className="ov-kv-val">{team.roster.length}</span></div>
              <div className="ov-kv"><span>Injured</span><span className={`ov-kv-val ${injured > 0 ? 'neg' : ''}`}>{injured > 0 ? injured : 'None'}</span></div>
              <div className="ov-kv"><span>Avg Age</span><span className="ov-kv-val">{team.roster.length > 0 ? (team.roster.reduce((s, p) => s + p.age, 0) / team.roster.length).toFixed(1) : '—'}</span></div>
            </div>
          </div>

          {/* Coaching Staff */}
          <div className="ov-sidebar-card">
            <div className="ov-sidebar-card-title">Coaching Staff</div>
            <div className="ov-coaches-list">
              <div className="ov-coach-row">
                <span className="ov-coach-role">HC</span>
                <span className="ov-coach-name">{team.coaches.hc.name}</span>
                <span className="ov-coach-ovr">{team.coaches.hc.overall}</span>
              </div>
              <div className="ov-coach-row">
                <span className="ov-coach-role">OC</span>
                {team.coaches.oc
                  ? <><span className="ov-coach-name">{team.coaches.oc.name}</span><span className="ov-coach-ovr">{team.coaches.oc.overall}</span></>
                  : <span className="ov-coach-vacant">Vacant</span>}
              </div>
              <div className="ov-coach-row">
                <span className="ov-coach-role">DC</span>
                {team.coaches.dc
                  ? <><span className="ov-coach-name">{team.coaches.dc.name}</span><span className="ov-coach-ovr">{team.coaches.dc.overall}</span></>
                  : <span className="ov-coach-vacant">Vacant</span>}
              </div>
            </div>
          </div>

          {/* Next Game */}
          <div className="ov-sidebar-card">
            <div className="ov-sidebar-card-title">Next Game</div>
            {nextGame ? (
              <div className="ov-next-game">
                <div className="ov-next-game-week">Week {nextGame.week}</div>
                <div className="ov-next-game-matchup">
                  <TeamLogo abbr={(nextGame.homeTeam.id === myTeamId ? nextGame.awayTeam : nextGame.homeTeam).abbreviation} size={32} />
                  <div className="ov-next-game-info">
                    <span className="ov-next-game-label">{nextGame.homeTeam.id === myTeamId ? 'vs' : '@'}</span>
                    <span className="ov-next-game-opp">{nextGame.homeTeam.id === myTeamId ? nextGame.awayTeam.name : nextGame.homeTeam.name}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="muted" style={{ padding: 'var(--sp-2) 0' }}>{league.phase === 'offseason' ? 'Offseason' : 'No upcoming games'}</div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Contracts ──────────────────────────────────────────────────────────────────

function ContractsView({ team, isOffseason, busy, onExtend, onRelease, onViewPlayer }: {
  team: League['teams'][0];
  isOffseason: boolean;
  busy: boolean;
  onExtend: (playerId: string) => void;
  onRelease: (playerId: string) => void;
  onViewPlayer?: (playerId: string) => void;
}) {
  const payroll      = team.roster.reduce((s, p) => s + p.salary, 0);
  const capRemaining = CAP_LIMIT - payroll;
  const capPct       = Math.min(100, (payroll / CAP_LIMIT) * 100);
  const withDemands  = team.roster.filter(p => p.contractDemand);
  const expiring     = team.roster.filter(p => p.yearsRemaining === 1);
  const avgSalary    = team.roster.length > 0 ? (payroll / team.roster.length).toFixed(1) : '0';
  const topContract  = team.roster.length > 0 ? [...team.roster].sort((a, b) => b.salary - a.salary)[0] : null;

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [view, setView]           = useState<'groups' | 'demands' | 'expiring'>('groups');

  function toggleGroup(label: string) { setCollapsed(prev => ({ ...prev, [label]: !prev[label] })); }

  function CRow({ p }: { p: Player }) {
    const isExp = p.yearsRemaining === 1;
    const isExpensive = p.salary >= 15;
    return (
      <tr className={`${isExp ? 'roster-row-expiring' : ''}${p.contractDemand ? ' roster-row-demand' : ''}`}>
        <td className="roster-name-cell">
          {onViewPlayer
            ? <button className="entity-link" onClick={() => onViewPlayer(p.id)}>{p.name}</button>
            : p.name}
        </td>
        <td className="roster-pos-cell">{p.position}</td>
        <td className="num">{p.age}</td>
        <td className={`num ovr-cell${p.scoutedOverall >= 80 ? ' ovr-elite' : p.scoutedOverall < 60 ? ' ovr-low' : ''}`}>{p.scoutedOverall}</td>
        <td className="num text-mono">${p.salary}M{isExpensive && <span className="ui-badge ui-badge--warning" style={{ marginLeft: '0.3rem', fontSize: '0.55rem' }}>$$</span>}</td>
        <td className={`num${isExp ? ' expiring' : ''}`}>{p.yearsRemaining}yr</td>
        <td className="roster-status-cell">
          {p.contractDemand
            ? <span className="demand-tag">${p.contractDemand.salary}M/{p.contractDemand.years}yr</span>
            : isExp
              ? <span className="ui-badge ui-badge--warning">Expiring</span>
              : <span className="muted">—</span>}
        </td>
        {isOffseason && (
          <td className="action-cell">
            {p.contractDemand && <button className="btn-sm btn-positive" disabled={busy} onClick={() => onExtend(p.id)}>Extend</button>}
            <button className="btn-sm btn-danger" disabled={busy} onClick={() => onRelease(p.id)}>Cut</button>
          </td>
        )}
      </tr>
    );
  }

  return (
    <section className="roster-page">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="roster-header">
        <div className="roster-header-left">
          <h2 className="roster-title">Contracts</h2>
        </div>
        <div className="roster-header-stats">
          <div className="roster-header-stat"><span className="roster-header-val">{team.roster.length}</span><span className="roster-header-lbl">Contracts</span></div>
          <div className="roster-header-stat"><span className={`roster-header-val${capRemaining < 10 ? ' neg' : ''}`}>${capRemaining.toFixed(1)}M</span><span className="roster-header-lbl">Cap Space</span></div>
          <div className="roster-header-stat"><span className="roster-header-val">${avgSalary}M</span><span className="roster-header-lbl">Avg Salary</span></div>
          {expiring.length > 0 && <div className="roster-header-stat"><span className="roster-header-val" style={{ color: 'var(--warning)' }}>{expiring.length}</span><span className="roster-header-lbl">Expiring</span></div>}
          {withDemands.length > 0 && <div className="roster-header-stat"><span className="roster-header-val neg">{withDemands.length}</span><span className="roster-header-lbl">Demands</span></div>}
        </div>
      </div>

      {/* Cap bar */}
      <div className="fa-cap-bar">
        <div className="fa-cap-label">
          <span>Cap: ${payroll.toFixed(1)}M / ${CAP_LIMIT}M</span>
          {topContract && <span className="muted">Top: {topContract.name} ${topContract.salary}M</span>}
          <span className={capRemaining < 10 ? 'neg' : 'muted'}>${capRemaining.toFixed(1)}M remaining</span>
        </div>
        <div className="fa-cap-track">
          <div className="fa-cap-fill" style={{ width: `${capPct}%`, background: capPct > 90 ? 'var(--danger)' : capPct > 75 ? 'var(--warning)' : 'var(--info)' }} />
        </div>
      </div>

      {/* View tabs */}
      <TabBar
        tabs={[
          { id: 'groups', label: 'By Position' },
          { id: 'demands', label: 'Demands', badge: withDemands.length > 0 ? withDemands.length : undefined, disabled: withDemands.length === 0 },
          { id: 'expiring', label: 'Expiring', badge: expiring.length > 0 ? expiring.length : undefined, disabled: expiring.length === 0 },
        ]}
        activeId={view}
        onSelect={(id) => setView(id as 'groups' | 'demands' | 'expiring')}
        size="sm"
      />

      {/* ── Demands view ───────────────────────────────────────── */}
      {view === 'demands' && (
        withDemands.length > 0 ? (
          <div className="roster-group">
            <div className="contracts-section-intro">Players requesting new contracts. Extend or let them walk to free agency.</div>
            <table className="ui-table roster-table">
              <thead><tr><th>Player</th><th>Pos</th><th className="num">Age</th><th className="num">OVR</th><th className="num">Salary</th><th className="num">Yrs</th><th>Demand</th>{isOffseason && <th></th>}</tr></thead>
              <tbody>{withDemands.sort((a, b) => b.salary - a.salary).map(p => <CRow key={p.id} p={p} />)}</tbody>
            </table>
          </div>
        ) : <EmptyState message="No contract demands at this time." />
      )}

      {/* ── Expiring view ──────────────────────────────────────── */}
      {view === 'expiring' && (
        expiring.length > 0 ? (
          <div className="roster-group">
            <div className="contracts-section-intro">Contracts expiring after this season. These players become free agents unless extended.</div>
            <table className="ui-table roster-table">
              <thead><tr><th>Player</th><th>Pos</th><th className="num">Age</th><th className="num">OVR</th><th className="num">Salary</th><th className="num">Yrs</th><th>Status</th>{isOffseason && <th></th>}</tr></thead>
              <tbody>{expiring.sort((a, b) => b.scoutedOverall - a.scoutedOverall).map(p => <CRow key={p.id} p={p} />)}</tbody>
            </table>
          </div>
        ) : <EmptyState message="No expiring contracts." />
      )}

      {/* ── Position groups view ───────────────────────────────── */}
      {view === 'groups' && (
        <div className="roster-groups">
          {ROSTER_POS_GROUPS.map(group => {
            const players = team.roster
              .filter(p => group.positions.includes(p.position))
              .sort((a, b) => b.salary - a.salary);
            if (players.length === 0) return null;
            const groupCap = players.reduce((s, p) => s + p.salary, 0);
            const groupExp = players.filter(p => p.yearsRemaining === 1).length;
            const groupDem = players.filter(p => p.contractDemand).length;
            const isCollapsed = !!collapsed[group.label];

            return (
              <div key={group.label} className="roster-group">
                <button className={`roster-group-header${isCollapsed ? ' roster-group-collapsed' : ''}`} onClick={() => toggleGroup(group.label)}>
                  <span className="roster-group-toggle">{isCollapsed ? '▸' : '▾'}</span>
                  <span className="roster-group-name">{group.label}</span>
                  <span className="roster-group-count">{players.length}</span>
                  <span className="roster-group-ovr">${groupCap.toFixed(1)}M</span>
                  {groupExp > 0 && <span className="roster-group-inj" style={{ color: 'var(--warning)' }}>{groupExp} exp</span>}
                  {groupDem > 0 && <span className="roster-group-inj">{groupDem} demand</span>}
                </button>
                {!isCollapsed && (
                  <table className="ui-table roster-table">
                    <thead><tr><th>Player</th><th>Pos</th><th className="num">Age</th><th className="num">OVR</th><th className="num">Salary</th><th className="num">Yrs</th><th>Status</th>{isOffseason && <th></th>}</tr></thead>
                    <tbody>{players.map(p => <CRow key={p.id} p={p} />)}</tbody>
                  </table>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}


// ── Draft View ─────────────────────────────────────────────────────────────────

function DraftView({ league, myTeamId, leagueId, busy, onPick, onSimDraft, onAdvance, onAdvanceOnePick, onAdvanceToMyPick, onLeagueUpdated }: {
  league: League;
  myTeamId: string;
  leagueId: string;
  busy: boolean;
  onPick: (playerId: string) => void;
  onSimDraft: () => void;
  onAdvance: () => void;
  onAdvanceOnePick: () => void;
  onAdvanceToMyPick: () => void;
  onLeagueUpdated: (l: League) => void;
}) {
  const [posFilter, setPosFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'board' | 'ovr' | 'pos'>('board');
  const [showResults, setShowResults] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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

  // Your picks this draft
  const myPicks = draft.slots.filter(s => s.teamId === myTeamId && s.playerId);

  // Selected prospect detail
  const selectedPlayer = selectedId ? draft.players.find(p => p.id === selectedId) : null;
  const selectedInfo   = selectedPlayer ? prospectInfo(selectedPlayer) : null;

  // ── Draft feedback: board target alerts, pick commentary, falling players ──

  // Board targets taken by other teams (check recent picks)
  const boardAlerts: string[] = [];
  for (const s of recentPicks) {
    if (s.teamId === myTeamId) continue;
    // Check if the drafted player's prospectId was on our board
    // We need to match via player name since we don't have prospectId on DraftSlot
    const boardProspectIds = draftBoard;
    const draftedProspects = league.draftClass?.prospects ?? [];
    for (const bid of boardProspectIds) {
      const bp = draftedProspects.find(pr => pr.id === bid);
      if (bp && s.playerName === bp.name && s.playerPos === bp.position) {
        boardAlerts.push(`${s.playerPos} ${s.playerName} was taken by ${s.teamName} (R${s.round}P${s.pick})`);
      }
    }
  }

  // Pick commentary helper
  function pickCommentary(slot: DraftSlot): string | null {
    if (!slot.playerId || !slot.playerName) return null;
    // Find prospect info for this pick
    const draftedProspects = league.draftClass?.prospects ?? [];
    const prospect = draftedProspects.find(pr => pr.name === slot.playerName);
    if (!prospect) return null;
    const state = scoutingData[prospect.id];
    const proj = state?.report?.projectedRound;
    if (!proj) return null;
    const round = slot.round;
    if (round < proj.min) return 'Reach';
    if (round > proj.max) return 'Value';
    return null;
  }

  // Falling players: past their projected max round
  function fallingTag(player: Player): string | null {
    const info = prospectInfo(player);
    if (!info?.report?.projectedRound) return null;
    const proj = info.report.projectedRound;
    const currentRound = currentSlot?.round ?? 1;
    if (currentRound > proj.max) return 'Falling';
    return null;
  }

  // Best available: top 3 by OVR among remaining
  const bestAvailableIds = new Set(
    [...draft.players].sort((a, b) => b.scoutedOverall - a.scoutedOverall).slice(0, 3).map(p => p.id),
  );

  function tierLabel(ovr: number): string {
    if (ovr >= 70) return '★';
    if (ovr >= 57) return '◆';
    return '·';
  }

  // ── Draft trade state ──────────────────────────────────────────────────────
  const [showTrade, setShowTrade] = useState(false);
  const [tradeTeamId, setTradeTeamId] = useState('');
  const [tradeGive, setTradeGive] = useState<Set<string>>(new Set());   // slot keys: "round:pick"
  const [tradeGet, setTradeGet] = useState<Set<string>>(new Set());
  const [tradeResult, setTradeResult] = useState<string | null>(null);
  const [tradeBusy, setTradeBusy] = useState(false);

  // Available picks per team (undrafted slots)
  const myUndrafted = draft.slots.filter(s => s.teamId === myTeamId && !s.playerId && s.overallPick >= draft.currentSlotIdx);
  const otherTeams = league.teams.filter(t => t.id !== myTeamId);
  const theirUndrafted = tradeTeamId
    ? draft.slots.filter(s => s.teamId === tradeTeamId && !s.playerId && s.overallPick >= draft.currentSlotIdx)
    : [];

  function slotKey(s: DraftSlot): string { return `${s.round}:${s.pick}`; }

  function toggleGive(key: string) {
    setTradeGive(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
    setTradeResult(null);
  }
  function toggleGet(key: string) {
    setTradeGet(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
    setTradeResult(null);
  }

  // Find the original team for a slot (needed for TradeAsset)
  function findOriginalTeam(slot: DraftSlot): { id: string; name: string } {
    // The slot's original team is the one at this draft position based on standings order
    // For simplicity, we scan draftPickOwnership to find who originally held this slot
    // If no ownership entry, the original team IS the current team
    for (const [key, ownerId] of Object.entries(league.draftPickOwnership ?? {})) {
      const [_yr, rd, origId] = key.split(':');
      if (Number(rd) === slot.round && ownerId === slot.teamId) {
        const origTeam = league.teams.find(t => t.id === origId);
        if (origTeam) return { id: origTeam.id, name: origTeam.name };
      }
    }
    return { id: slot.teamId, name: slot.teamName };
  }

  async function submitDraftTrade() {
    if (tradeGive.size === 0 || tradeGet.size === 0 || !tradeTeamId) return;
    setTradeBusy(true); setTradeResult(null);
    const fromAssets: TradeAsset[] = myUndrafted
      .filter(s => tradeGive.has(slotKey(s)))
      .map(s => {
        const orig = findOriginalTeam(s);
        return { type: 'pick' as const, year: draft!.year, round: s.round, originalTeamId: orig.id, originalTeamName: orig.name };
      });
    const toAssets: TradeAsset[] = theirUndrafted
      .filter(s => tradeGet.has(slotKey(s)))
      .map(s => {
        const orig = findOriginalTeam(s);
        return { type: 'pick' as const, year: draft!.year, round: s.round, originalTeamId: orig.id, originalTeamName: orig.name };
      });
    try {
      const updated = await proposeTradeApi(leagueId, myTeamId, tradeTeamId, fromAssets, toAssets);
      // Check if accepted (last trade proposal status)
      const lastProposal = updated.tradeProposals[updated.tradeProposals.length - 1];
      if (lastProposal?.status === 'accepted') {
        setTradeResult('Trade accepted!');
        onLeagueUpdated(updated);
        setTradeGive(new Set()); setTradeGet(new Set());
      } else {
        setTradeResult('Trade rejected — they want more value.');
        onLeagueUpdated(updated);
      }
    } catch (e) {
      setTradeResult(friendlyError(e));
    }
    finally { setTradeBusy(false); }
  }

  const ROUNDS = [1, 2, 3, 4, 5, 6, 7];
  const totalCols = isMyTurn ? 9 : 8;

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
            <>
              <button className={`btn-sm${showTrade ? ' active' : ''}`} onClick={() => { setShowTrade(v => !v); setTradeResult(null); }}>Trade Picks</button>
              <button className="btn-sm" disabled={busy} onClick={onSimDraft}>Sim All Remaining</button>
            </>
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

      {/* ── Board Target Alerts ── */}
      {boardAlerts.length > 0 && (
        <div className="draft-alerts">
          {boardAlerts.slice(0, 3).map((a, i) => (
            <div key={i} className="draft-alert">
              <span className="draft-alert-icon">⚠</span>
              <span className="draft-alert-text">{a}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Draft Trade Panel ── */}
      {showTrade && !draft.complete && (
        <div className="draft-trade-panel">
          <div className="draft-trade-header">
            <h3>Trade Draft Picks</h3>
            <button className="btn-sm" onClick={() => setShowTrade(false)}>Close</button>
          </div>
          <div className="draft-trade-body">
            <div className="draft-trade-col">
              <label className="draft-trade-label">Trade with</label>
              <select className="draft-trade-select" value={tradeTeamId} onChange={e => { setTradeTeamId(e.target.value); setTradeGive(new Set()); setTradeGet(new Set()); setTradeResult(null); }}>
                <option value="">Select team…</option>
                {otherTeams.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            {tradeTeamId && (
              <>
                <div className="draft-trade-sides">
                  <div className="draft-trade-side">
                    <div className="draft-trade-side-label">You give</div>
                    {myUndrafted.length === 0 && <p className="muted">No picks available</p>}
                    {myUndrafted.map(s => {
                      const key = slotKey(s);
                      return (
                        <label key={key} className={`draft-trade-pick${tradeGive.has(key) ? ' selected' : ''}`}>
                          <input type="checkbox" checked={tradeGive.has(key)} onChange={() => toggleGive(key)} />
                          R{s.round} P{s.pick} (#{s.overallPick})
                        </label>
                      );
                    })}
                  </div>
                  <div className="draft-trade-side">
                    <div className="draft-trade-side-label">You get</div>
                    {theirUndrafted.length === 0 && <p className="muted">No picks available</p>}
                    {theirUndrafted.map(s => {
                      const key = slotKey(s);
                      return (
                        <label key={key} className={`draft-trade-pick${tradeGet.has(key) ? ' selected' : ''}`}>
                          <input type="checkbox" checked={tradeGet.has(key)} onChange={() => toggleGet(key)} />
                          R{s.round} P{s.pick} (#{s.overallPick})
                        </label>
                      );
                    })}
                  </div>
                </div>
                {tradeResult && (
                  <div className={`draft-trade-result${tradeResult.includes('accepted') ? ' draft-trade-ok' : ' draft-trade-fail'}`}>
                    {tradeResult}
                  </div>
                )}
                <button
                  className="btn-primary"
                  disabled={tradeBusy || tradeGive.size === 0 || tradeGet.size === 0}
                  onClick={submitDraftTrade}
                >
                  {tradeBusy ? 'Proposing…' : 'Propose Trade'}
                </button>
              </>
            )}
          </div>
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
                    <tr key={p.id} className={`draft-prospect-row${bdRank ? ' draft-on-board' : ''}${selectedId === p.id ? ' draft-selected' : ''}`} onClick={() => setSelectedId(selectedId === p.id ? null : p.id)}>
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
                        {bestAvailableIds.has(p.id) && <span className="draft-tag-ba">BPA</span>}
                        {fallingTag(p) && <span className="draft-tag-fall">Falling</span>}
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

        {/* ── Right Panel: Detail + Picks ── */}
        <div className="draft-right">
          {/* Prospect Detail */}
          {selectedPlayer && (
            <div className="draft-detail">
              <div className="draft-detail-header">
                <span className="draft-detail-pos">{selectedPlayer.position}</span>
                <span className="draft-detail-name">{selectedPlayer.name}</span>
                <span className="draft-detail-ovr">{selectedPlayer.scoutedOverall} OVR</span>
              </div>
              <div className="draft-detail-meta">
                <span>{selectedPlayer.college ?? '—'}</span>
                <span>Age {selectedPlayer.age}</span>
                {(() => {
                  const cp = league.draftClass?.prospects.find(pr => pr.id === selectedPlayer.prospectId);
                  return cp ? <><span>{cp.height}</span><span>{cp.weight} lbs</span></> : null;
                })()}
              </div>
              {selectedInfo?.boardRank && (
                <div className="draft-detail-board">#{selectedInfo.boardRank} on your board</div>
              )}
              {selectedInfo?.report ? (
                <div className="draft-detail-report">
                  <div className="draft-detail-report-row">
                    <span className="draft-detail-grade">{selectedInfo.report.grade}</span>
                    <span className={`draft-detail-conf ${selectedInfo.report.confidence}`}>
                      {selectedInfo.report.confidence === 'low' ? 'Low Conf.' : selectedInfo.report.confidence === 'medium' ? 'Med Conf.' : 'High Conf.'}
                    </span>
                    <span className="draft-detail-proj">Proj Rd {selectedInfo.report.projectedRound.min}–{selectedInfo.report.projectedRound.max}</span>
                  </div>
                  {selectedInfo.report.strengths.length > 0 && (
                    <div className="draft-detail-tags">
                      {selectedInfo.report.strengths.map((s, i) => <span key={i} className="draft-tag draft-tag-str">{s}</span>)}
                    </div>
                  )}
                  {selectedInfo.report.weaknesses.length > 0 && (
                    <div className="draft-detail-tags">
                      {selectedInfo.report.weaknesses.map((w, i) => <span key={i} className="draft-tag draft-tag-wk">{w}</span>)}
                    </div>
                  )}
                  {selectedInfo.report.notes && <p className="draft-detail-notes">{selectedInfo.report.notes}</p>}
                </div>
              ) : (
                <p className="muted" style={{ fontSize: '0.72rem', margin: '0.3rem 0 0' }}>No scouting report available.</p>
              )}
              {(() => {
                const cp = league.draftClass?.prospects.find(pr => pr.id === selectedPlayer.prospectId);
                const c = cp?.combine;
                if (!c) return null;
                return (
                  <div className="draft-detail-combine">
                    <div className="draft-detail-combine-row">
                      <span className="combine-metric"><span className="combine-metric-label">40</span> {c.fortyYard}s</span>
                      <span className="combine-metric"><span className="combine-metric-label">Bench</span> {c.benchPress}</span>
                      <span className="combine-metric"><span className="combine-metric-label">Vert</span> {c.vertJump}"</span>
                    </div>
                    <span className={`combine-stock-tag combine-stock--${c.stockMove}`}>
                      {c.stockMove === 'rising' ? '↑ Rising' : c.stockMove === 'falling' ? '↓ Falling' : '— Neutral'}
                    </span>
                  </div>
                );
              })()}
              {isMyTurn && (() => {
                const proj = selectedInfo?.report?.projectedRound;
                const curRound = currentSlot?.round ?? 1;
                const valueTag = proj
                  ? curRound > proj.max ? 'Great value — falling past projection'
                  : curRound < proj.min ? 'Potential reach — projected later'
                  : null
                  : null;
                return (
                  <>
                    {valueTag && <p className={`draft-detail-value ${curRound > (proj?.max ?? 99) ? 'draft-val-good' : 'draft-val-reach'}`}>{valueTag}</p>}
                    <button className="draft-detail-pick-btn" disabled={busy} onClick={() => onPick(selectedPlayer.id)}>
                      Draft {selectedPlayer.name}
                    </button>
                  </>
                );
              })()}
            </div>
          )}
          {!selectedPlayer && (
            <div className="draft-detail draft-detail-empty">
              <p className="muted">Click a prospect to view details</p>
            </div>
          )}

          {/* Your Picks */}
          {myPicks.length > 0 && (
            <div className="draft-my-picks">
              <div className="draft-log-title">Your Picks</div>
              {myPicks.map(s => {
                const comment = pickCommentary(s);
                return (
                  <div key={s.overallPick} className="draft-log-row draft-log-user">
                    <span className="draft-log-pick">R{s.round}P{s.pick}</span>
                    <span className="draft-log-player">{s.playerPos} {s.playerName}</span>
                    {comment && <span className={`draft-log-comment draft-log-comment--${comment.toLowerCase()}`}>{comment}</span>}
                  </div>
                );
              })}
            </div>
          )}

          {/* Recent Picks */}
          <div className="draft-log">
            <div className="draft-log-title">Recent Picks</div>
            {recentPicks.length === 0 && (
              <p className="muted" style={{ padding: '0.5rem' }}>No picks yet.</p>
            )}
            {recentPicks.map(s => {
              const comment = pickCommentary(s);
              return (
                <div key={s.overallPick} className={`draft-log-row${s.teamId === myTeamId ? ' draft-log-user' : ''}`}>
                  <span className="draft-log-pick">R{s.round}P{s.pick}</span>
                  <span className="draft-log-team">{s.teamName.split(' ').pop()}</span>
                  <span className="draft-log-player">{s.playerPos} {s.playerName}</span>
                  {comment && <span className={`draft-log-comment draft-log-comment--${comment.toLowerCase()}`}>{comment}</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Scouting View ──────────────────────────────────────────────────────────────

function ScoutingView({ draftClass, myTeam, busy, onScout, focusProspectId, onFocusConsumed }: {
  draftClass: NonNullable<League['draftClass']>;
  myTeam: import('./types').Team;
  busy: boolean;
  onScout: (prospectId: string) => void;
  focusProspectId?: string | null;
  onFocusConsumed?: () => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const scoutingData = myTeam.scoutingData ?? {};
  const scoutingPoints = myTeam.scoutingPoints ?? 0;
  const scout = myTeam.scout;
  const draftBoard = myTeam.draftBoard ?? [];
  const scoutedCount = Object.values(scoutingData).filter(s => s.scoutLevel > 0).length;
  const fullyScoutedCount = Object.values(scoutingData).filter(s => s.scoutLevel === 3).length;

  // Auto-focus a prospect when navigated from College tab
  useEffect(() => {
    if (focusProspectId) {
      setExpanded(focusProspectId);
      // Ensure the position group containing this prospect is not collapsed
      const prospect = draftClass.prospects.find(p => p.id === focusProspectId);
      if (prospect) {
        const group = ROSTER_POS_GROUPS.find(g => g.positions.includes(prospect.position));
        if (group) setCollapsed(prev => ({ ...prev, [group.label]: false }));
      }
      onFocusConsumed?.();
    }
  }, [focusProspectId]);

  function toggleGroup(label: string) { setCollapsed(prev => ({ ...prev, [label]: !prev[label] })); }

  const COSTS = [10, 20, 35];
  const LEVEL_SHORT = ['—', 'L1', 'L2', 'Full'];

  function scoutLevel(p: ClientProspect): number { return scoutingData[p.id]?.scoutLevel ?? 0; }
  function report(p: ClientProspect) { return scoutingData[p.id]?.report ?? null; }

  function projRange(p: ClientProspect): string {
    const r = report(p);
    if (!r) return '—';
    const { min, max } = r.projectedRound;
    return min === max ? `Rd ${min}` : `Rd ${min}–${max}`;
  }

  function confidenceLabel(c: ScoutingReport['confidence']): string {
    return c === 'low' ? 'Low' : c === 'medium' ? 'Med' : 'High';
  }

  // Compute progress percentage
  const totalProspects = draftClass.prospects.length;
  const scoutProgress = totalProspects > 0 ? Math.round((scoutedCount / totalProspects) * 100) : 0;

  return (
    <section className="scout-page">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="scout-header">
        <div className="scout-header-top">
          <div className="scout-header-left">
            <h2 className="scout-title">Scouting</h2>
            {scout && (
              <div className="scout-assigned">
                <span className="scout-assigned-name">{scout.name}</span>
                <span className="scout-assigned-ovr">{scout.overall} OVR</span>
              </div>
            )}
          </div>
          <div className="scout-header-stats">
            <div className="scout-stat">
              <span className="scout-stat-val">{totalProspects}</span>
              <span className="scout-stat-lbl">Prospects</span>
            </div>
            <div className="scout-stat">
              <span className="scout-stat-val">{scoutedCount}<span className="scout-stat-sub">/{totalProspects}</span></span>
              <span className="scout-stat-lbl">Scouted</span>
            </div>
            <div className="scout-stat">
              <span className="scout-stat-val scout-stat-full">{fullyScoutedCount}</span>
              <span className="scout-stat-lbl">Full Intel</span>
            </div>
            <div className="scout-stat">
              <span className={`scout-stat-val${scoutingPoints < 10 ? ' neg' : ''}`}>{scoutingPoints}</span>
              <span className="scout-stat-lbl">Scout Pts</span>
            </div>
          </div>
        </div>
        {/* Progress bar */}
        <div className="scout-progress">
          <div className="scout-progress-track">
            <div className="scout-progress-fill" style={{ width: `${scoutProgress}%` }} />
          </div>
          <span className="scout-progress-label">{scoutProgress}% scouted</span>
        </div>
      </div>

      {scoutingPoints === 0 && <EmptyState message="No scouting points remaining. Wait for next season allocation." compact />}

      {/* ── Position groups ────────────────────────────────────── */}
      <div className="roster-groups">
        {ROSTER_POS_GROUPS.map(group => {
          const prospects = draftClass.prospects
            .filter(p => group.positions.includes(p.position))
            .sort((a, b) => {
              const aLvl = scoutLevel(a), bLvl = scoutLevel(b);
              if (aLvl !== bLvl) return bLvl - aLvl;
              return 0;
            });
          if (prospects.length === 0) return null;
          const scoutedInGroup = prospects.filter(p => scoutLevel(p) > 0).length;
          const isCollapsed = !!collapsed[group.label];

          return (
            <div key={group.label} className="roster-group">
              <button className={`roster-group-header${isCollapsed ? ' roster-group-collapsed' : ''}`} onClick={() => toggleGroup(group.label)}>
                <span className="roster-group-toggle">{isCollapsed ? '▸' : '▾'}</span>
                <span className="roster-group-name">{group.label}</span>
                <span className="roster-group-count">{prospects.length}</span>
                <span className="scout-group-progress">
                  <span className="scout-group-bar-track">
                    <span className="scout-group-bar-fill" style={{ width: `${prospects.length > 0 ? (scoutedInGroup / prospects.length) * 100 : 0}%` }} />
                  </span>
                  <span className="scout-group-bar-text">{scoutedInGroup}/{prospects.length}</span>
                </span>
              </button>
              {!isCollapsed && (
                <div className="scouting-group-body">
                  {prospects.map(p => {
                    const lvl = scoutLevel(p);
                    const rpt = report(p);
                    const nextCost = lvl < 3 ? COSTS[lvl] : null;
                    const isOpen = expanded === p.id;
                    const isOnBoard = draftBoard.includes(p.id);

                    return (
                      <div key={p.id} className={`scouting-prospect${isOpen ? ' scouting-prospect-open' : ''}${lvl === 0 ? ' scouting-prospect-unscouted' : ''}`}>
                        {/* Summary row */}
                        <div className="scouting-row" onClick={() => setExpanded(isOpen ? null : p.id)}>
                          <span className="scouting-row-name">
                            {p.name}
                            {isOnBoard && <span className="ui-badge ui-badge--primary">#{draftBoard.indexOf(p.id) + 1}</span>}
                          </span>
                          <span className="roster-pos-cell">{p.position}</span>
                          <span className="scouting-row-college muted">{p.college}</span>
                          <span className="scouting-row-grade num text-mono">{rpt?.grade ?? '—'}</span>
                          <span className="scouting-row-proj num">{projRange(p)}</span>
                          <span>{lvl > 0 ? <span className={`scout-level-badge level-${lvl}`}>{LEVEL_SHORT[lvl]}</span> : <span className="scout-level-badge level-0">—</span>}</span>
                          {nextCost !== null ? (
                            <button
                              className="btn-sm btn-scout-inline"
                              disabled={busy || scoutingPoints < nextCost}
                              onClick={e => { e.stopPropagation(); onScout(p.id); }}
                            >
                              Scout ({nextCost})
                            </button>
                          ) : (
                            <span className="scout-full-tag">Full</span>
                          )}
                          <span className="scouting-row-arrow">{isOpen ? '▾' : '▸'}</span>
                        </div>

                        {/* Expanded detail */}
                        {isOpen && (
                          <div className="scouting-detail">
                            <div className="scouting-detail-grid">
                              {/* Left: bio + combine */}
                              <div className="scouting-detail-bio">
                                <div className="scouting-detail-meta">
                                  <div className="scouting-bio-row"><span className="scouting-bio-label">Height</span><span>{p.height}</span></div>
                                  <div className="scouting-bio-row"><span className="scouting-bio-label">Weight</span><span>{p.weight} lbs</span></div>
                                  <div className="scouting-bio-row"><span className="scouting-bio-label">Age</span><span>{p.age}</span></div>
                                  {rpt && <div className="scouting-bio-row"><span className="scouting-bio-label">Confidence</span><span className={`report-conf ${rpt.confidence}`}>{confidenceLabel(rpt.confidence)}</span></div>}
                                </div>
                                {p.combine && (
                                  <div className="scouting-combine-card">
                                    <div className="scouting-combine-title">Combine Results</div>
                                    <div className="scouting-combine-grid">
                                      <div className="scouting-combine-item">
                                        <span className="scouting-combine-val">{p.combine.fortyYard.toFixed(2)}s</span>
                                        <span className="scouting-combine-lbl">40-Yard</span>
                                      </div>
                                      <div className="scouting-combine-item">
                                        <span className="scouting-combine-val">{p.combine.benchPress}</span>
                                        <span className="scouting-combine-lbl">Bench</span>
                                      </div>
                                      <div className="scouting-combine-item">
                                        <span className="scouting-combine-val">{p.combine.vertJump}"</span>
                                        <span className="scouting-combine-lbl">Vert</span>
                                      </div>
                                    </div>
                                    <div className={`scouting-stock scouting-stock--${p.combine.stockMove}`}>
                                      {p.combine.stockMove === 'rising' ? '↑ Rising' : p.combine.stockMove === 'falling' ? '↓ Falling' : '→ Neutral'}
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* Right: scouting report */}
                              <div className="scouting-detail-report">
                                {rpt ? (
                                  <div className="scout-report">
                                    {rpt.strengths.length > 0 && (
                                      <div className="report-section">
                                        <span className="report-label strength-lbl">Strengths</span>
                                        <div className="report-tags">{rpt.strengths.map((s, i) => <span key={i} className="report-tag strength">{s}</span>)}</div>
                                      </div>
                                    )}
                                    {rpt.weaknesses.length > 0 && (
                                      <div className="report-section">
                                        <span className="report-label weakness-lbl">Concerns</span>
                                        <div className="report-tags">{rpt.weaknesses.map((w, i) => <span key={i} className="report-tag weakness">{w}</span>)}</div>
                                      </div>
                                    )}
                                    {rpt.notes && <p className="report-notes">{rpt.notes}</p>}
                                  </div>
                                ) : (
                                  <div className="scouting-no-report">
                                    <span className="scouting-no-report-icon">?</span>
                                    <span>Scout this prospect to reveal strengths, weaknesses, and projected draft position.</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
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
  const scoutingPoints = myTeam.scoutingPoints ?? 0;
  const scoutedCount = Object.values(scoutingData).filter(s => s.scoutLevel > 0).length;

  const onBoard = draftBoard
    .map(id => draftClass.prospects.find(p => p.id === id))
    .filter((p): p is ClientProspect => !!p);

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [boardView, setBoardView] = useState<'ranked' | 'browse'>('ranked');

  function toggleGroup(label: string) { setCollapsed(prev => ({ ...prev, [label]: !prev[label] })); }

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

  function scoutLevel(p: ClientProspect): number { return scoutingData[p.id]?.scoutLevel ?? 0; }
  function projRange(p: ClientProspect): string {
    const state = scoutingData[p.id];
    if (!state?.report) return '—';
    const { min, max } = state.report.projectedRound;
    return min === max ? `Rd ${min}` : `Rd ${min}–${max}`;
  }
  function gradeStr(p: ClientProspect): string {
    return scoutingData[p.id]?.report?.grade ?? '—';
  }

  const LEVEL_LABELS = ['', 'L1', 'L2', 'Full'];

  // Needs analysis — which position groups have fewest players
  const myTeamRoster = myTeam.roster;
  const positionNeeds = useMemo(() => {
    const needs: { pos: string; count: number; avgOvr: number }[] = [];
    for (const g of ROSTER_POS_GROUPS) {
      const players = myTeamRoster.filter(p => g.positions.includes(p.position));
      const avgOvr = players.length > 0 ? Math.round(players.reduce((s, p) => s + p.scoutedOverall, 0) / players.length) : 0;
      needs.push({ pos: g.label, count: players.length, avgOvr });
    }
    return needs.sort((a, b) => a.avgOvr - b.avgOvr);
  }, [myTeamRoster]);

  return (
    <section className="board-page">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="board-header">
        <div className="board-header-left">
          <h2 className="board-title">Draft Board</h2>
          <span className="board-subtitle">Rank and organize your targets</span>
        </div>
        <div className="board-header-stats">
          <div className="board-stat"><span className="board-stat-val">{draftClass.prospects.length}</span><span className="board-stat-lbl">Prospects</span></div>
          <div className="board-stat"><span className="board-stat-val board-stat-accent">{onBoard.length}</span><span className="board-stat-lbl">Ranked</span></div>
          <div className="board-stat"><span className="board-stat-val">{scoutedCount}</span><span className="board-stat-lbl">Scouted</span></div>
          <div className="board-stat"><span className="board-stat-val">{scoutingPoints}</span><span className="board-stat-lbl">Scout Pts</span></div>
        </div>
      </div>

      {/* View tabs */}
      <div className="board-tabs">
        <button className={`board-tab${boardView === 'ranked' ? ' board-tab-active' : ''}`} onClick={() => setBoardView('ranked')}>
          My Board{onBoard.length > 0 && <span className="ui-count">{onBoard.length}</span>}
        </button>
        <button className={`board-tab${boardView === 'browse' ? ' board-tab-active' : ''}`} onClick={() => setBoardView('browse')}>
          Browse by Position
        </button>
      </div>

      <div className="board-layout">

        {/* ── Main content ─────────────────────────────────────── */}
        <div className="board-main">

          {/* Ranked Board */}
          {boardView === 'ranked' && (
            <div className="board-ranked">
              {onBoard.length > 0 ? (
                <table className="ui-table roster-table board-table">
                  <thead>
                    <tr>
                      <th className="num">#</th><th>Name</th><th>Pos</th><th>College</th>
                      <th className="num">Grade</th><th className="num">Proj</th><th>Scout</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {onBoard.map((p, idx) => {
                      const lvl = scoutLevel(p);
                      return (
                        <tr key={p.id} className="board-ranked-row">
                          <td className="num text-mono board-rank">{idx + 1}</td>
                          <td className="board-player-name">{p.name}</td>
                          <td className="roster-pos-cell">{p.position}</td>
                          <td className="muted">{p.college}</td>
                          <td className="num text-mono">{gradeStr(p)}</td>
                          <td className="num">{projRange(p)}</td>
                          <td>{lvl > 0 ? <span className={`scout-level-badge level-${lvl}`}>{LEVEL_LABELS[lvl]}</span> : <span className="muted">—</span>}</td>
                          <td className="board-actions">
                            <button className="btn-sm" onClick={() => moveUp(idx)} disabled={idx === 0} title="Move up">↑</button>
                            <button className="btn-sm" onClick={() => moveDown(idx)} disabled={idx === onBoard.length - 1} title="Move down">↓</button>
                            <button className="btn-sm btn-danger" onClick={() => removeFromBoard(p.id)} title="Remove">✕</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="board-empty">
                  <div className="board-empty-icon">📋</div>
                  <div className="board-empty-title">No prospects ranked yet</div>
                  <div className="board-empty-msg">Switch to "Browse by Position" to add players to your board.</div>
                </div>
              )}
            </div>
          )}

          {/* Browse by Position */}
          {boardView === 'browse' && (
            <div className="roster-groups">
              {ROSTER_POS_GROUPS.map(group => {
                const prospects = draftClass.prospects
                  .filter(p => group.positions.includes(p.position))
                  .sort((a, b) => {
                    const aLvl = scoutLevel(a), bLvl = scoutLevel(b);
                    if (aLvl !== bLvl) return bLvl - aLvl;
                    return 0;
                  });
                if (prospects.length === 0) return null;
                const scoutedInGroup = prospects.filter(p => scoutLevel(p) > 0).length;
                const isCollapsed = !!collapsed[group.label];

                return (
                  <div key={group.label} className="roster-group">
                    <button className={`roster-group-header${isCollapsed ? ' roster-group-collapsed' : ''}`} onClick={() => toggleGroup(group.label)}>
                      <span className="roster-group-toggle">{isCollapsed ? '▸' : '▾'}</span>
                      <span className="roster-group-name">{group.label}</span>
                      <span className="roster-group-count">{prospects.length}</span>
                      {scoutedInGroup > 0 && <span className="roster-group-ovr">{scoutedInGroup} scouted</span>}
                    </button>
                    {!isCollapsed && (
                      <table className="ui-table roster-table">
                        <thead>
                          <tr>
                            <th>Name</th><th>Pos</th><th>College</th><th>Size</th>
                            <th className="num">Grade</th><th className="num">Proj</th><th>Scout</th><th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {prospects.map(p => {
                            const lvl = scoutLevel(p);
                            const isRanked = draftBoard.includes(p.id);
                            return (
                              <tr key={p.id} className={isRanked ? 'roster-row-starter' : ''}>
                                <td className="roster-name-cell">
                                  <span>{p.name}</span>
                                  {isRanked && <span className="ui-badge ui-badge--primary">#{draftBoard.indexOf(p.id) + 1}</span>}
                                </td>
                                <td className="roster-pos-cell">{p.position}</td>
                                <td className="muted">{p.college}</td>
                                <td className="muted">{p.height} · {p.weight}</td>
                                <td className="num text-mono">{gradeStr(p)}</td>
                                <td className="num">{projRange(p)}</td>
                                <td>{lvl > 0 ? <span className={`scout-level-badge level-${lvl}`}>{LEVEL_LABELS[lvl]}</span> : <span className="muted">—</span>}</td>
                                <td>
                                  {isRanked
                                    ? <button className="btn-sm btn-danger" onClick={() => removeFromBoard(p.id)}>Remove</button>
                                    : <button className="btn-sm btn-positive" onClick={() => addToBoard(p.id)}>+ Board</button>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Sidebar — Team Needs ─────────────────────────────── */}
        <div className="board-sidebar">
          <div className="board-needs">
            <div className="board-needs-title">Team Needs</div>
            <div className="board-needs-list">
              {positionNeeds.map(n => (
                <div key={n.pos} className={`board-need-row${n.avgOvr < 60 ? ' board-need-critical' : n.avgOvr < 70 ? ' board-need-moderate' : ''}`}>
                  <span className="board-need-pos">{n.pos}</span>
                  <div className="board-need-bar-track">
                    <div className="board-need-bar-fill" style={{ width: `${n.avgOvr}%` }} />
                  </div>
                  <span className="board-need-ovr">{n.avgOvr}</span>
                  <span className="board-need-count">{n.count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Top Board Targets quick-view */}
          {onBoard.length > 0 && boardView === 'browse' && (
            <div className="board-targets">
              <div className="board-needs-title">Top Targets</div>
              {onBoard.slice(0, 5).map((p, idx) => (
                <div key={p.id} className="board-target-row">
                  <span className="board-target-rank">#{idx + 1}</span>
                  <span className="board-target-name">{p.name}</span>
                  <span className="roster-pos-cell">{p.position}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
