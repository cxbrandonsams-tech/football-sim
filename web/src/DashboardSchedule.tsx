import { type Game } from './types';

interface ScheduleTile {
  week: number;
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
}

export function DashboardSchedule({ games, myTeamId, currentWeek }: Props) {
  const maxWeek = games.length > 0 ? Math.max(...games.map(g => g.week)) : 0;
  if (maxWeek === 0) return null;

  const tiles: ScheduleTile[] = [];

  for (let w = 1; w <= maxWeek; w++) {
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
      tiles.push({ week: w, oppAbbr, homeAway: isHome ? 'H' : 'A', status, myScore, oppScore });
    } else {
      tiles.push({ week: w, oppAbbr, homeAway: isHome ? 'H' : 'A', status: 'upcoming' });
    }
  }

  const wins   = tiles.filter(t => t.status === 'win').length;
  const losses = tiles.filter(t => t.status === 'loss').length;
  const ties   = tiles.filter(t => t.status === 'tie').length;
  const played = wins + losses + ties;

  return (
    <div className="sched-wrap">
      <div className="sched-header">
        <span className="sched-title">Schedule</span>
        {played > 0 && (
          <span className="sched-record">
            {wins}–{losses}{ties > 0 ? `–${ties}` : ''}
          </span>
        )}
      </div>
      <div className="sched-track">
        {tiles.map(tile => {
          const isCurrent = tile.week === currentWeek;
          const cls = [
            'sched-tile',
            `sched-${tile.status}`,
            isCurrent ? 'sched-current' : '',
          ].filter(Boolean).join(' ');

          return (
            <div key={tile.week} className={cls}>
              <div className="sched-wk">WK {tile.week}</div>

              {tile.status === 'bye' ? (
                <div className="sched-opp sched-opp-bye">BYE</div>
              ) : (
                <div className="sched-opp">
                  {tile.homeAway === 'A' && <span className="sched-at">@</span>}
                  {tile.oppAbbr}
                </div>
              )}

              {tile.status !== 'upcoming' && tile.status !== 'bye' && (
                <div className="sched-result">
                  <span className="sched-rl">
                    {tile.status === 'win' ? 'W' : tile.status === 'loss' ? 'L' : 'T'}
                  </span>
                  <span className="sched-score">{tile.myScore}–{tile.oppScore}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
