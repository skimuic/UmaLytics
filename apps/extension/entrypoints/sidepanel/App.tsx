import { useEffect, useMemo, useState } from 'react';
import { browser } from 'wxt/browser';
import type { PrematchPlayer, PrematchRoster, PrematchTeam, TeamId } from '@umalytics/shared';
import {
  getLatestPrematchRoster,
  LATEST_PREMATCH_ROSTER_STORAGE_KEY
} from '../../utils/rosterStorage';

const TEAM_IDS = ['team1', 'team2'] as const satisfies readonly TeamId[];

export default function App() {
  const [roster, setRoster] = useState<PrematchRoster | undefined>();

  useEffect(() => {
    void getLatestPrematchRoster().then(setRoster);

    const handleStorageChange = (
      changes: Record<string, Browser.storage.StorageChange>,
      areaName: string
    ) => {
      if (areaName !== 'local') {
        return;
      }

      const rosterChange = changes[LATEST_PREMATCH_ROSTER_STORAGE_KEY];

      if (rosterChange === undefined) {
        return;
      }

      setRoster(isPrematchRoster(rosterChange.newValue) ? rosterChange.newValue : undefined);
    };

    browser.storage.onChanged.addListener(handleStorageChange);

    return () => {
      browser.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  const teamGroups = useMemo(() => getTeamGroups(roster), [roster]);

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <h1>UmaLytics</h1>
          <p>{roster?.matchCode === undefined ? 'Lobby scouting' : `Match ${roster.matchCode}`}</p>
        </div>
        <span className={roster === undefined ? 'status-pill idle' : 'status-pill live'}>
          {roster === undefined ? 'Waiting' : `${roster.players.length}/10`}
        </span>
      </header>

      {roster === undefined ? (
        <section className="empty-state">
          <h2>No lobby detected</h2>
          <p>Open an Uma Drafter lobby or spectate page to populate player scouting.</p>
        </section>
      ) : (
        <section className="team-list" aria-label="Detected lobby teams">
          {teamGroups.map((team) => (
            <TeamSection key={team.id} team={team} />
          ))}
        </section>
      )}
    </main>
  );
}

function TeamSection({ team }: { team: PrematchTeam }) {
  return (
    <section className="team-section">
      <header className="team-header">
        <div>
          <h2>{team.name ?? team.id}</h2>
          <p>{team.players.length} players</p>
        </div>
      </header>

      <ol className="player-list">
        {team.players.map((player) => (
          <PlayerRow key={`${player.discordId}:${player.userId}`} player={player} />
        ))}
      </ol>
    </section>
  );
}

function PlayerRow({ player }: { player: PrematchPlayer }) {
  const rating = player.displayRatingSnapshot ?? player.ratingSnapshot;
  const tags = getPlayerTags(player);

  return (
    <li className="player-row">
      <div className="player-main">
        <span className="player-name">{player.displayName}</span>
        <span className="player-id">{player.discordId}</span>
      </div>
      <div className="player-meta">
        <span>{rating === undefined ? 'Rating unknown' : `${rating} rating`}</span>
        {tags.map((tag) => (
          <span key={tag} className="player-tag">
            {tag}
          </span>
        ))}
      </div>
    </li>
  );
}

function getTeamGroups(roster: PrematchRoster | undefined): PrematchTeam[] {
  if (roster === undefined) {
    return [];
  }

  if (roster.teams !== undefined) {
    return TEAM_IDS.map((teamId) => roster.teams?.[teamId]).filter(
      (team): team is PrematchTeam => team !== undefined
    );
  }

  return [
    {
      id: 'team1',
      players: roster.players
    }
  ];
}

function getPlayerTags(player: PrematchPlayer): string[] {
  const tags: string[] = [];

  if (player.isCaptain === true || player.role === 'captain') {
    tags.push('Captain');
  }

  if (player.partyId !== null) {
    tags.push('Party');
  }

  return tags;
}

function isPrematchRoster(value: unknown): value is PrematchRoster {
  return (
    typeof value === 'object' &&
    value !== null &&
    'players' in value &&
    Array.isArray(value.players)
  );
}
