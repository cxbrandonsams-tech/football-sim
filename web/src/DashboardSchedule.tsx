import { type Game } from './types';
import { TeamLogo } from './TeamLogo';

const SEASON_WEEKS = 18; // NFL: 17 games + 1 bye per team across 18 weeks

interface ScheduleTile {
  week: number;
  gameId?: string;
  oppAbbr: string;
  homeAway: 'H' | 'A' | null; // null = bye
  status: 'win' | 'loss' | 'tie' | 'upcoming' | 'bye';
  myScore?: number;
  oppScore?: number;
}

interface Props {
  games: Game[];
  myTeamId: string;
  currentWeek: number;
  onViewGame?: (gameId: string) => void;
}

export function DashboardSchedule({ games, myTeamId, currentWeek, onViewGame }: Props) {
  if (games.length === 0) return null;

  const tiles: ScheduleTile[] = [];

  for (let w = 1; w <= SEASON_WEEKS; w++) {
    const game = games.find(
      g => g.week === w && (g.homeTeam.id === myTeamId || g.awayTeam.id === myTeamId)
    );

    if (!game) {
      tiles.push({ week: w, oppAbbr: 'BYE', homeAway: null, status: 'bye' });
      continue;
    }

    const isHome   = game.homeTeam.id === myTeamId;
    const myScore  = isHome ? game.homeScore : game.awayScore;
    const oppScore = isHome ? game.awayScore : game.homeScore;
    const oppAbbr  = isHome ? game.awayTeam.abbreviation : game.homeTeam.abbreviation;

    if (game.status === 'final') {
      const status = myScore > oppScore ? 'win' : myScore < oppScore ? 'loss' : 'tie';
      tiles.push({ week: w, gameId: game.id, oppAbbr, homeAway: isHome ? 'H' : 'A', status, myScore, oppScore });
    } else {
      tiles.push({ week: w, gameId: game.id, oppAbbr, homeAway: isHome ? 'H' : 'A', status: 'upcoming' });
    }
  }

  const wins   = tiles.filter(t => t.status === 'win').length;
  const losses = tiles.filter(t => t.status === 'loss').length;
  const ties   = tiles.filter(t => t.status === 'tie').length;
  const played = wins + losses + ties;
  const remaining = SEASON_WEEKS - played - tiles.filter(t => t.status === 'bye' && t.week < currentWeek).length;

  // Streak
  let streak = '';
  const results = tiles.filter(t => t.status === 'win' || t.status === 'loss' || t.status === 'tie');
  if (results.length > 0) {
    const last = results[results.length - 1]!.status;
    let count = 0;
    for (let i = results.length - 1; i >= 0; i--) {
      if (results[i]!.status === last) count++;
      else break;
    }
    streak = `${last === 'win' ? 'W' : last === 'loss' ? 'L' : 'T'}${count}`;
  }

  return (
    <div className="sched-wrap">
      <div className="sched-header">
        <span className="sched-label">Schedule</span>
        {played > 0 && (
          <span className="sched-record">{wins}–{losses}{ties > 0 ? `–${ties}` : ''}</span>
        )}
        {streak && streak.length > 1 && (
          <span className={`sched-streak ${streak.startsWith('W') ? 'pos' : streak.startsWith('L') ? 'neg' : ''}`}>{streak}</span>
        )}
        <span className="sched-meta">{played > 0 ? `${remaining} left` : `Wk ${currentWeek} of ${SEASON_WEEKS}`}</span>
      </div>
      <div className="sched-track">
        {tiles.map(tile => {
          const isCurrent = tile.week === currentWeek;
          const isPast = tile.status === 'win' || tile.status === 'loss' || tile.status === 'tie' || (tile.status === 'bye' && tile.week < currentWeek);
          const cls = [
            'sched-tile',
            `sched-${tile.status}`,
            isCurrent ? 'sched-current' : '',
            isPast && !isCurrent ? 'sched-past' : '',
            tile.gameId && onViewGame ? 'sched-clickable' : '',
          ].filter(Boolean).join(' ');

          const handleClick = tile.gameId && onViewGame
            ? () => onViewGame(tile.gameId!)
            : undefined;

          return (
            <div key={tile.week} className={cls} onClick={handleClick} role={handleClick ? 'button' : undefined} tabIndex={handleClick ? 0 : undefined}>
              <div className="sched-wk">{tile.week}</div>

              {tile.status === 'bye' ? (
                <div className="sched-opp sched-opp-bye">BYE</div>
              ) : (
                <div className="sched-opp">
                  {tile.homeAway === 'A' && <span className="sched-at">@</span>}
                  <TeamLogo abbr={tile.oppAbbr} size={16} />
                  {tile.oppAbbr}
                </div>
              )}

              {(tile.status === 'win' || tile.status === 'loss' || tile.status === 'tie') && (
                <div className="sched-result">
                  <span className="sched-rl">
                    {tile.status === 'win' ? 'W' : tile.status === 'loss' ? 'L' : 'T'}
                  </span>
                  <span className="sched-score">{tile.myScore}–{tile.oppScore}</span>
                </div>
              )}

              {tile.status === 'upcoming' && (
                <div className="sched-upcoming-dot" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
