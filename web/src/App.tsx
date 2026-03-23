import { useState, useEffect, useRef } from 'react';
import { deriveBoxScore } from './boxScore';
import { aggregateSeasonStats } from './seasonStats';
import {
  listLeagues, createLeague, joinLeague, fetchLeague, advanceWeek, saveLeague, loadLeague,
  claimTeam as claimTeamApi, proposeTrade as proposeTradeApi, respondTrade as respondTradeApi,
  markNotificationsRead as markReadApi,
  type LeagueSummary, type CreateLeagueParams,
} from './api';
import { computeStandings, type League, type Standing, type Game, type Player, type PlayEvent, type TradeProposal, type LeagueNotification, type Activity, type PlayoffBracket, type SeasonRecord } from './types';
import './App.css';

// ── Shared helpers ─────────────────────────────────────────────────────────────

/** Strip "Error: " prefix that JS adds to String(e) */
function friendlyError(e: unknown): string {
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

type Screen = 'landing' | 'create' | 'join' | 'browse' | 'team-select' | 'league';

function getGmId(): string {
  let id = localStorage.getItem('gmId');
  if (!id) { id = crypto.randomUUID(); localStorage.setItem('gmId', id); }
  return id;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('landing');
  const [leagueId, setLeagueId] = useState<string | null>(null);
  const [league, setLeague] = useState<League | null>(null);
  const [myTeamId, setMyTeamId] = useState<string | null>(null);
  const [gmId] = useState(getGmId);

  function enterLeague(id: string, data: League) {
    const myTeam = data.teams.find(t => t.ownerId === gmId);
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
    const updated = await claimTeamApi(leagueId!, teamId, gmId);
    setLeague(updated);
    setMyTeamId(teamId);
    setScreen('league');
  }

  function leaveLeague() {
    setLeague(null); setLeagueId(null); setMyTeamId(null); setScreen('landing');
  }

  if (screen === 'landing') return <Landing onNav={setScreen} />;
  if (screen === 'create')  return <CreateForm onBack={() => setScreen('landing')} onEnter={enterLeague} />;
  if (screen === 'join')    return <JoinForm onBack={() => setScreen('landing')} onEnter={enterLeague} />;
  if (screen === 'browse')  return <BrowseLeagues onBack={() => setScreen('landing')} onEnter={enterLeague} />;

  if (!league || !leagueId) return null;

  if (screen === 'team-select') {
    return (
      <TeamSelect
        league={league}
        gmId={gmId}
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
      gmId={gmId}
      onLeave={leaveLeague}
    />
  );
}

// ── Landing ────────────────────────────────────────────────────────────────────

function Landing({ onNav }: { onNav: (s: Screen) => void }) {
  return (
    <div className="landing">
      <div className="landing-card">
        <h1>Gridiron</h1>
        <p className="landing-sub">Football simulation league manager</p>
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
  onEnter: (id: string, league: League) => void;
}) {
  const [displayName, setDisplayName] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!displayName.trim()) { setError('League name is required.'); return; }
    if (visibility === 'private' && !password) { setError('Password is required for private leagues.'); return; }
    setBusy(true); setError(null);
    try {
      const params: CreateLeagueParams = {
        displayName: displayName.trim(),
        visibility,
        ...(visibility === 'private' && { password }),
      };
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
            <label>
              Password
              <input
                type="password" value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="League password"
              />
            </label>
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
  onEnter: (id: string, league: League) => void;
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
        setError('This is a private league. Enter the password.');
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
              Password
              <input
                type="password" value={password} autoFocus
                onChange={e => setPassword(e.target.value)}
                placeholder="League password"
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
  onEnter: (id: string, league: League) => void;
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
              <tr><th>Name</th><th>Year</th><th>Week</th><th></th></tr>
            </thead>
            <tbody>
              {leagues.map(l => (
                <tr key={l.id}>
                  <td>{l.displayName}</td>
                  <td>{l.year}</td>
                  <td>{l.currentWeek}</td>
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

function TeamSelect({ league, gmId, onClaim, onBack }: {
  league: League;
  gmId: string;
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
            {league.teams.map(t => {
              const claimed = !!t.ownerId && t.ownerId !== gmId;
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

function LeagueApp({ leagueId, league, setLeague, myTeamId, gmId, onLeave }: {
  leagueId: string;
  league: League;
  setLeague: (l: League) => void;
  myTeamId: string;
  gmId: string;
  onLeave: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'standings' | 'week' | 'roster' | 'trades' | 'activity' | 'leaders'>('standings');
  const [rosterTeamId, setRosterTeamId] = useState(myTeamId);

  async function action(fn: (id: string) => Promise<League>) {
    setBusy(true); setError(null);
    try { setLeague(await fn(leagueId)); }
    catch (e) { setError(friendlyError(e)); }
    finally { setBusy(false); }
  }

  async function save() {
    setBusy(true); setError(null);
    try { await saveLeague(leagueId); }
    catch (e) { setError(friendlyError(e)); }
    finally { setBusy(false); }
  }

  async function handleProposeTrade(playerId: string, toTeamId: string) {
    setLeague(await proposeTradeApi(leagueId, myTeamId, toTeamId, playerId, gmId));
  }

  async function handleRespondTrade(proposalId: string, accept: boolean) {
    setLeague(await respondTradeApi(leagueId, proposalId, gmId, accept));
  }

  async function handleMarkRead() {
    setLeague(await markReadApi(leagueId, gmId));
  }

  const myNotifications = league.notifications.filter(n => n.teamId === myTeamId);
  const unreadCount = myNotifications.filter(n => !n.read).length;
  const [showNotifs, setShowNotifs] = useState(false);

  const standings = computeStandings(league);
  const weekGames = league.currentSeason.games.filter(g => g.week === league.currentWeek);
  const maxWeek   = Math.max(...league.currentSeason.games.map(g => g.week));
  const rosterTeam = league.teams.find(t => t.id === rosterTeamId) ?? league.teams[0]!;

  const isRegularSeason = league.phase === 'regular_season';
  const weekTabLabel = isRegularSeason ? 'Week View' : 'Playoffs';

  function advanceBtnLabel(): string {
    if (league.phase === 'offseason') return 'Season Complete';
    if (league.phase === 'postseason') {
      const round = league.playoff?.currentRound;
      if (round === 'semifinal')    return 'Sim Semifinals';
      if (round === 'championship') return 'Sim Championship';
      return 'Season Complete';
    }
    return league.currentWeek > maxWeek ? 'Start Playoffs' : 'Advance Week';
  }

  function phaseLabel(): string {
    if (league.phase === 'postseason') return 'Playoffs';
    if (league.phase === 'offseason')  return 'Offseason';
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
          <button onClick={save} disabled={busy}>Save</button>
          <button onClick={() => action(loadLeague)} disabled={busy}>Load</button>
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

      <nav>
        {(['standings', 'week', 'leaders', 'roster', 'trades', 'activity'] as const).map(t => {
          const label = t === 'week' ? weekTabLabel
            : t === 'standings' ? 'Standings' : t === 'leaders' ? 'Leaders'
            : t === 'roster' ? 'Roster' : t === 'trades' ? 'Trades' : 'Activity';
          const pending = t === 'trades' ? league.tradeProposals.filter(p => p.toTeamId === myTeamId && p.status === 'pending').length : 0;
          return (
            <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
              {label}{pending > 0 && <span className="badge">{pending}</span>}
            </button>
          );
        })}
      </nav>

      {tab === 'standings' && <StandingsView standings={standings} userTeamId={myTeamId} />}
      {tab === 'week' && isRegularSeason && (
        <WeekView
          games={weekGames}
          week={league.currentWeek}
          busy={busy}
          advanceBtnLabel={advanceBtnLabel()}
          onAdvance={() => action(advanceWeek)}
        />
      )}
      {tab === 'week' && !isRegularSeason && (
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
          scoutingBudget={league.scoutingBudget}
          developmentBudget={league.developmentBudget}
          onTrade={handleProposeTrade}
        />
      )}
      {tab === 'trades' && (
        <TradesView
          league={league}
          myTeamId={myTeamId}
          onRespond={handleRespondTrade}
        />
      )}
      {tab === 'activity' && <ActivityFeed activities={league.activities} />}
      {tab === 'leaders' && (
        <LeadersView games={league.currentSeason.games} teams={league.teams} />
      )}
    </div>
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

// ── Standings ──────────────────────────────────────────────────────────────────

function StandingsView({ standings, userTeamId }: { standings: Standing[]; userTeamId: string }) {
  return (
    <section>
      <h2>Standings</h2>
      <table>
        <thead>
          <tr><th>Team</th><th>W</th><th>L</th><th>T</th><th>PF</th><th>PA</th><th>Diff</th></tr>
        </thead>
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
  const done = advanceBtnLabel === 'Season Complete';

  const semis = playoff?.matchups.filter(m => m.round === 'semifinal') ?? [];
  const champ = playoff?.matchups.find(m => m.round === 'championship');

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

      {semis.length > 0 && (
        <>
          <h3>Semifinals</h3>
          {semis.map(m => (
            <div key={m.id} className="playoff-matchup">
              <span className={m.winnerId === m.topSeedId ? 'winner' : ''}>{teamName(m.topSeedId)}</span>
              <span className="vs"> vs </span>
              <span className={m.winnerId === m.bottomSeedId ? 'winner' : ''}>{teamName(m.bottomSeedId)}</span>
              {m.game
                ? <span className="playoff-score"> — {m.game.homeScore}–{m.game.awayScore}</span>
                : <span className="muted"> (pending)</span>}
            </div>
          ))}
        </>
      )}

      {champ && (
        <>
          <h3>Championship</h3>
          <div className="playoff-matchup">
            <span className={champ.winnerId === champ.topSeedId ? 'winner' : ''}>{teamName(champ.topSeedId)}</span>
            <span className="vs"> vs </span>
            <span className={champ.winnerId === champ.bottomSeedId ? 'winner' : ''}>{teamName(champ.bottomSeedId)}</span>
            {champ.game
              ? <span className="playoff-score"> — {champ.game.homeScore}–{champ.game.awayScore}</span>
              : <span className="muted"> (pending)</span>}
          </div>
        </>
      )}

      {seasonHistory.length > 0 && (
        <>
          <h3>Past Champions</h3>
          {[...seasonHistory].reverse().map(r => (
            <div key={r.year} className="history-item">{r.year}: {r.championName}</div>
          ))}
        </>
      )}
    </section>
  );
}

// ── Week View ──────────────────────────────────────────────────────────────────

function WeekView({ games, week, busy, advanceBtnLabel, onAdvance }: {
  games: Game[]; week: number; busy: boolean; advanceBtnLabel: string; onAdvance: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedGame = games.find(g => g.id === selectedId) ?? null;
  const done = advanceBtnLabel === 'Season Complete';

  return (
    <div className="week-layout">
      <section className="week-section">
        <div className="week-header">
          <h2>Week {week}</h2>
          <button onClick={onAdvance} disabled={busy || done} className="advance-btn">
            {busy ? 'Simulating…' : advanceBtnLabel}
          </button>
        </div>
        <table>
          <thead><tr><th>Away</th><th></th><th>Home</th><th>Status</th></tr></thead>
          <tbody>
            {games.map(g => (
              <tr
                key={g.id}
                className={`game-row${selectedId === g.id ? ' selected' : ''}`}
                onClick={() => setSelectedId(prev => prev === g.id ? null : g.id)}
              >
                <td className="team-cell">{g.awayTeam.abbreviation}</td>
                <td className="score-cell">
                  {g.status === 'final' ? `${g.awayScore} – ${g.homeScore}` : 'vs'}
                </td>
                <td className="team-cell">{g.homeTeam.abbreviation}</td>
                <td className={`status-cell ${g.status}`}>{g.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {selectedGame && <GameDetail key={selectedGame.id} game={selectedGame} />}
    </div>
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

function TradesView({ league, myTeamId, onRespond }: {
  league: League;
  myTeamId: string;
  onRespond: (proposalId: string, accept: boolean) => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const incoming = league.tradeProposals.filter(p => p.toTeamId === myTeamId && p.status === 'pending');
  const outgoing = league.tradeProposals.filter(p => p.fromTeamId === myTeamId);

  function teamName(teamId: string) {
    return league.teams.find(t => t.id === teamId)?.name ?? teamId;
  }

  function playerName(playerId: string) {
    for (const t of league.teams) {
      const found = t.roster.find(p => p.id === playerId);
      if (found) return found.name;
    }
    return playerId;
  }

  async function respond(proposalId: string, accept: boolean) {
    setBusy(proposalId); setError(null);
    try { await onRespond(proposalId, accept); }
    catch (e) { setError(friendlyError(e)); }
    finally { setBusy(null); }
  }

  return (
    <section>
      <h2>Trades</h2>
      {error && <div className="form-error">{error}</div>}

      <h3>Incoming</h3>
      {incoming.length === 0
        ? <p className="muted">No incoming proposals.</p>
        : incoming.map((p: TradeProposal) => (
          <div key={p.id} className="trade-proposal">
            <span><strong>{teamName(p.fromTeamId)}</strong> offers <strong>{playerName(p.playerId)}</strong></span>
            <button className="btn-sm" disabled={busy === p.id} onClick={() => respond(p.id, true)}>Accept</button>
            <button className="btn-sm" disabled={busy === p.id} onClick={() => respond(p.id, false)}>Reject</button>
          </div>
        ))
      }

      <h3>Outgoing</h3>
      {outgoing.length === 0
        ? <p className="muted">No outgoing proposals.</p>
        : outgoing.map((p: TradeProposal) => (
          <div key={p.id} className="trade-proposal">
            <span><strong>{playerName(p.playerId)}</strong> → <strong>{teamName(p.toTeamId)}</strong></span>
            <span className={`trade-status ${p.status}`}>{p.status}</span>
          </div>
        ))
      }
    </section>
  );
}

// ── Roster ─────────────────────────────────────────────────────────────────────

function RosterView({ teams, selectedId, userTeamId, onSelect, team, scoutingBudget, developmentBudget, onTrade }: {
  teams: League['teams']; selectedId: string; userTeamId: string;
  onSelect: (id: string) => void; team: League['teams'][0];
  scoutingBudget: number; developmentBudget: number;
  onTrade: (playerId: string, toTeamId: string) => Promise<void>;
}) {
  const [tradingPlayerId, setTradingPlayerId] = useState<string | null>(null);
  const [toTeamId, setToTeamId] = useState('');
  const [tradeBusy, setTradeBusy] = useState(false);
  const [tradeError, setTradeError] = useState<string | null>(null);

  const isMyTeam = selectedId === userTeamId;
  const otherTeams = teams.filter(t => t.id !== selectedId);

  async function confirmTrade() {
    if (!tradingPlayerId || !toTeamId) return;
    setTradeBusy(true); setTradeError(null);
    try {
      await onTrade(tradingPlayerId, toTeamId);
      setTradingPlayerId(null); setToTeamId('');
    } catch (e) {
      setTradeError(String(e));
    } finally {
      setTradeBusy(false);
    }
  }

  function cancelTrade() {
    setTradingPlayerId(null); setToTeamId(''); setTradeError(null);
  }

  return (
    <section>
      <div className="roster-header">
        <h2>Roster</h2>
        <select value={selectedId} onChange={e => { onSelect(e.target.value); cancelTrade(); }}>
          {teams.map(t => (
            <option key={t.id} value={t.id}>{t.name}{t.id === userTeamId ? ' (You)' : ''}</option>
          ))}
        </select>
        {selectedId === userTeamId && (
          <span className="budgets">Scout: ${scoutingBudget}M · Dev: ${developmentBudget}M</span>
        )}
      </div>
      {tradingPlayerId && (
        <div className="trade-panel">
          <span>Trade <strong>{team.roster.find(p => p.id === tradingPlayerId)?.name}</strong> to:</span>
          <select value={toTeamId} onChange={e => setToTeamId(e.target.value)}>
            <option value="">Select team…</option>
            {otherTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button className="btn-sm" disabled={tradeBusy || !toTeamId} onClick={confirmTrade}>
            {tradeBusy ? 'Sending…' : 'Confirm'}
          </button>
          <button className="btn-sm" onClick={cancelTrade}>Cancel</button>
          {tradeError && <span className="form-error">{tradeError}</span>}
        </div>
      )}
      <table>
        <thead>
          <tr>
            <th>Name</th><th>Pos</th><th>Age</th><th>OVR</th><th>Skill</th><th>Ath</th><th>IQ</th><th>Salary</th><th>Yrs</th><th>Inj</th>
            {isMyTeam && <th></th>}
          </tr>
        </thead>
        <tbody>
          {team.roster.map(p => (
            <PlayerRow
              key={p.id}
              player={p}
              onTrade={isMyTeam ? () => setTradingPlayerId(p.id) : undefined}
              isTrading={tradingPlayerId === p.id}
            />
          ))}
        </tbody>
      </table>
    </section>
  );
}

function PlayerRow({ player: p, onTrade, isTrading }: {
  player: Player; onTrade?: () => void; isTrading?: boolean;
}) {
  const injured = p.injuryWeeksRemaining > 0;
  return (
    <tr className={[injured ? 'injured' : '', isTrading ? 'trading' : ''].filter(Boolean).join(' ')}>
      <td>{p.name}{p.trait && <span className="trait" title={p.trait}> [{traitShort(p.trait)}]</span>}</td>
      <td>{p.position}</td><td>{p.age}</td><td>{p.scoutedOverall}</td>
      <td>{p.scoutedRatings.skill}</td><td>{p.scoutedRatings.athleticism}</td><td>{p.scoutedRatings.iq}</td>
      <td>${p.salary}M</td><td>{p.yearsRemaining}yr</td>
      <td>{injured ? `IR:${p.injuryWeeksRemaining}wk` : '—'}</td>
      {onTrade !== undefined && <td><button className="btn-sm" onClick={onTrade}>Trade</button></td>}
    </tr>
  );
}

function traitShort(trait: string): string {
  const map: Record<string, string> = { high_work_ethic: 'WE', injury_prone: 'IP', durable: 'DUR', greedy: 'GRD', loyal: 'LOY' };
  return map[trait] ?? trait;
}
