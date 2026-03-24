export type NewsType =
  | 'game_result'
  | 'playoff_result'
  | 'championship'
  | 'award'
  | 'signing'
  | 'trade'
  | 'retirement'
  | 'draft_pick'
  | 'big_performance'
  | 'upset'
  | 'weekly_recap'
  | 'milestone'
  | 'stat_race'
  | 'streak'
  | 'hall_of_fame'
  | 'coach_change'
  | 'ring_of_honor'
  | 'retired_jersey';

export interface NewsMention {
  id:         string;
  name:       string;
  entityType: 'player' | 'team';
}

export interface NewsItem {
  id:        string;
  type:      NewsType;
  headline:  string;
  body:      string;
  week:      number;   // 0 for offseason events
  year:      number;
  createdAt: number;   // Date.now()
  teamIds:   string[];
  playerIds: string[];
  mentions?: NewsMention[];
}
