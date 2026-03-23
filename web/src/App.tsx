import { useState, useEffect } from 'react';
import {
  listLeagues, createLeague, joinLeague, fetchLeague, advanceWeek, saveLeague, loadLeague,
  claimTeam as claimTeamApi, proposeTrade as proposeTradeApi, respondTrade as respondTradeApi,
  markNotificationsRead as markReadApi,
  type LeagueSummary, type CreateLeagueParams,
} from './api';
import { computeStandings, type League, type Standing, type Game, type Player, type PlayEvent, type TradeProposal, type LeagueNotification, type Activity, type PlayoffBracket, type SeasonRecord } from './types';
import './App.css';

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
      setError(String(e));
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
      setError(String(e));
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
    catch (e) { setError(String(e)); }
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
  const [tab, setTab] = useState<'standings' | 'week' | 'roster' | 'trades' | 'activity'>('standings');
  const [rosterTeamId, setRosterTeamId] = useState(myTeamId);

  async function action(fn: (id: string) => Promise<League>) {
    setBusy(true); setError(null);
    try { setLeague(await fn(leagueId)); }
    catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }

  async function save() {
    setBusy(true); setError(null);
    try { await saveLeague(leagueId); }
    catch (e) { setError(String(e)); }
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
        {(['standings', 'week', 'roster', 'trades', 'activity'] as const).map(t => {
          const label = t === 'week' ? weekTabLabel
            : t === 'standings' ? 'Standings' : t === 'roster' ? 'Roster'
            : t === 'trades' ? 'Trades' : 'Activity';
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
      {selectedGame && <GameDetail game={selectedGame} />}
    </div>
  );
}

// ── Game Detail ────────────────────────────────────────────────────────────────

function GameDetail({ game }: { game: Game }) {
  const lines = game.status === 'final' ? formatGameLog(game) : null;
  return (
    <section className="game-detail">
      <div className="game-detail-header">
        <span className="game-matchup">
          {game.awayTeam.name} <span className="vs">@</span> {game.homeTeam.name}
        </span>
        {game.status === 'final' && (
          <span className="game-score">{game.awayScore} – {game.homeScore}</span>
        )}
        <span className={`game-status ${game.status}`}>{game.status}</span>
      </div>
      <div className="pbp-scroll">
        {lines
          ? lines.map((line, i) => <PbpLine key={i} line={line} game={game} />)
          : <p className="pbp-empty">This game has not been played yet.</p>}
      </div>
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
            <span className="activity-time">{new Date(a.createdAt).toLocaleTimeString()}</span>
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
            <span className="notif-time">{new Date(n.createdAt).toLocaleTimeString()}</span>
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
    catch (e) { setError(String(e)); }
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
