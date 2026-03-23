export type NewsType =
  | 'game_result'
  | 'playoff_result'
  | 'championship'
  | 'award'
  | 'signing'
  | 'trade'
  | 'retirement';

export interface NewsItem {
  id:         string;
  type:       NewsType;
  headline:   string;
  body:       string;
  week:       number;   // 0 for offseason events
  year:       number;
  createdAt:  number;   // Date.now()
  teamIds:    string[];
  playerIds:  string[];
}
