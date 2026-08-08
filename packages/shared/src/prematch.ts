import type { MatchCode } from './match';

export interface PrematchPlayer {
  userId: string;
  discordId: string;
  displayName: string;
  partyId: string | null;
  partyRatingBonus: number;
}

export interface PrematchRoster {
  matchCode?: MatchCode;
  players: PrematchPlayer[];
}
