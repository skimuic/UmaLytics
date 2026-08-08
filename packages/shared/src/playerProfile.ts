export interface PlayerProfileSummary {
  discordId: string;
  displayName?: string;
  discordUsername?: string;
  title?: string | null;
  supporter?: boolean;
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
  statsPrivate?: boolean;
  fetchedAt: number;
  profileUrl: string;
  error?: string;
}
