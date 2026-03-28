/**
 * College football data model — lightweight conference standings,
 * team records, and stat leaders for the scouting/draft presentation layer.
 *
 * This is cosmetic data — no college games are simulated.
 * Generated each offseason alongside the draft class.
 */

export interface CollegeTeam {
  name:       string;
  conference: string;
  wins:       number;
  losses:     number;
}

export interface CollegeStatLeader {
  name:       string;   // prospect name
  prospectId: string;
  college:    string;
  stat:       string;   // e.g. "3,842 yds, 32 TD"
  category:   'passing' | 'rushing' | 'receiving' | 'sacks' | 'interceptions';
}

export interface CollegeData {
  year:       number;
  conferences: {
    name:  string;
    teams: CollegeTeam[];
  }[];
  statLeaders: CollegeStatLeader[];
}

// ── College team library ─────────────────────────────────────────────────────

export const COLLEGE_CONFERENCES: { name: string; teams: string[] }[] = [
  {
    name: 'SEC',
    teams: ['Alabama', 'Georgia', 'LSU', 'Tennessee', 'Florida', 'Texas A&M', 'Auburn', 'Ole Miss', 'Arkansas', 'South Carolina'],
  },
  {
    name: 'Big Ten',
    teams: ['Ohio State', 'Michigan', 'Penn State', 'Wisconsin', 'Iowa', 'Michigan State', 'Minnesota', 'Nebraska', 'Illinois', 'Purdue'],
  },
  {
    name: 'ACC',
    teams: ['Clemson', 'Florida State', 'Miami', 'North Carolina', 'NC State', 'Louisville', 'Pittsburgh', 'Virginia Tech', 'Duke', 'Wake Forest'],
  },
  {
    name: 'Big 12',
    teams: ['Texas', 'Oklahoma', 'TCU', 'Kansas State', 'Oklahoma State', 'Baylor', 'Iowa State', 'West Virginia', 'Cincinnati', 'UCF'],
  },
  {
    name: 'Pac-12',
    teams: ['USC', 'Oregon', 'Washington', 'Utah', 'UCLA', 'Arizona State', 'Colorado', 'Stanford', 'Cal', 'Oregon State'],
  },
];

/** Flat list of all college names for prospect assignment. */
export const ALL_COLLEGE_NAMES: string[] = COLLEGE_CONFERENCES.flatMap(c => c.teams);
