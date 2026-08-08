import type { PrematchRoster } from '@umalytics/shared';
import { extractMatchCodeFromUrl } from '../utils/matchDetection';
import { sendPrematchRoster } from '../utils/messaging';
import { extractPrematchRosterFromRoomDom } from '../utils/domLobbyExtraction';

const ROOM_DOM_SCAN_DEBOUNCE_MS = 750;
let lastRosterSignature: string | undefined;
let roomDomScanTimer: number | undefined;

export default defineContentScript({
  matches: ['https://drafter.uma.guide/*'],
  runAt: 'document_start',
  async main() {
    console.log('[UmaLytics] Extension loaded');

    const matchCode = extractMatchCodeFromUrl(window.location.href);

    if (matchCode !== undefined) {
      console.log(`[UmaLytics] Match detected: ${matchCode}`);
    }

    installRoomDomObserver();
  }
});

function installRoomDomObserver(): void {
  queueRoomDomScan();

  const observer = new MutationObserver(() => {
    queueRoomDomScan();
  });

  observer.observe(document.body ?? document.documentElement, {
    childList: true,
    subtree: true
  });
}

function queueRoomDomScan(): void {
  if (roomDomScanTimer !== undefined) {
    return;
  }

  roomDomScanTimer = window.setTimeout(() => {
    roomDomScanTimer = undefined;
    void publishRoomDomRoster();
  }, ROOM_DOM_SCAN_DEBOUNCE_MS);
}

async function publishRoomDomRoster(): Promise<void> {
  const roster = extractPrematchRosterFromRoomDom(document);

  if (roster === null) {
    return;
  }

  await publishRoster(roster);
}

async function publishRoster(roster: PrematchRoster): Promise<void> {
  if (roster.players.length === 0) {
    return;
  }

  const rosterSignature = getRosterSignature(roster);

  if (rosterSignature === lastRosterSignature) {
    return;
  }

  console.log(`[UmaLytics] Roster detected: ${roster.players.length} players`);
  lastRosterSignature = rosterSignature;
  await sendPrematchRoster(roster);
}

function getRosterSignature(roster: { matchCode?: string; players: Array<{ userId: string; team?: string }> }): string {
  const playerSignature = roster.players
    .map((player) => `${player.userId}:${player.team ?? 'unknown'}`)
    .sort()
    .join('|');

  return `${roster.matchCode ?? 'unknown'}:${playerSignature}`;
}
