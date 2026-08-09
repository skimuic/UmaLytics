export interface PlayerTopUmaSummary {
  umaId: string;
  name: string;
  matches: number;
  wins: number;
  losses: number;
  winRate: number | null;
  points: number;
  pointsPerGame: number | null;
  podiums: number;
  mvpMatches: number;
  performanceScore?: number;
}

export type PlayerStatsScope = 'currentSeason' | 'allTime';

export interface PlayerProfileStatsSummary {
  wins?: number | null;
  losses?: number | null;
  winRate?: number | null;
  matches?: number | null;
  points?: number | null;
  pointsPerGame?: number | null;
  podiums?: number | null;
  mvpMatches?: number | null;
  topUmas?: PlayerTopUmaSummary[];
  bestUmas?: PlayerTopUmaSummary[];
  bestUmaScoreVersion?: number;
}

export interface PlayerProfileSummary {
  discordId: string;
  displayName?: string;
  discordUsername?: string;
  title?: string | null;
  rank?: number | null;
  rating?: number | null;
  ratingDeviation?: number | null;
  conservativeRating?: number | null;
  wins?: number | null;
  losses?: number | null;
  winRate?: number | null;
  matches?: number | null;
  points?: number | null;
  pointsPerGame?: number | null;
  podiums?: number | null;
  mvpMatches?: number | null;
  topUmas?: PlayerTopUmaSummary[];
  bestUmas?: PlayerTopUmaSummary[];
  bestUmaScoreVersion?: number;
  statsScope?: PlayerStatsScope;
  currentSeasonStats?: PlayerProfileStatsSummary;
  allTimeStats?: PlayerProfileStatsSummary;
  activeSeasonId?: string;
  statsPrivate?: boolean;
  fetchedAt: number;
  profileUrl: string;
  error?: string;
}
