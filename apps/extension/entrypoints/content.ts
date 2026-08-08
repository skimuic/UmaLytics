import { injectScript } from 'wxt/utils/inject-script';
import type { ScriptPublicPath } from 'wxt/utils/inject-script';
import type { PrematchRoster } from '@umalytics/shared';
import { extractMatchCodeFromUrl } from '../utils/matchDetection';
import { sendPrematchRoster } from '../utils/messaging';
import { extractPrematchRosterFromRoomDom } from '../utils/domLobbyExtraction';
import { extractPrematchRosterFromSyncedDraftState } from '../utils/playerExtraction';

const SYNCED_DRAFT_STATE_MESSAGE_TYPE = 'umalytics:synced-draft-state';
const PAGE_HOOK_SCRIPT_PATH = '/pageHook.js' as ScriptPublicPath;
const ROOM_DOM_SCAN_DEBOUNCE_MS = 750;
type RosterSource = 'dom' | 'synced';

let lastRosterSignature: string | undefined;
let lastRosterMatchCode: string | undefined;
let lastRosterSource: RosterSource | undefined;
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

    window.addEventListener('message', (event: MessageEvent<unknown>) => {
      void handleWindowMessage(event.data, matchCode);
    });

    installRoomDomObserver();
    await injectScript(PAGE_HOOK_SCRIPT_PATH, { keepInDom: true });
  }
});

async function handleWindowMessage(message: unknown, matchCode?: string): Promise<void> {
  if (!isRecord(message) || message.type !== SYNCED_DRAFT_STATE_MESSAGE_TYPE) {
    return;
  }

  const roster = extractPrematchRosterFromSyncedDraftState(message.payload, matchCode);

  if (roster === null || roster.players.length !== 10) {
    return;
  }

  await publishRoster(roster, 'synced');
}

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

  await publishRoster(roster, 'dom');
}

async function publishRoster(roster: PrematchRoster, source: RosterSource): Promise<void> {
  if (roster.players.length === 0) {
    return;
  }

  if (
    source === 'dom' &&
    lastRosterSource === 'synced' &&
    lastRosterMatchCode === roster.matchCode
  ) {
    return;
  }

  const rosterSignature = getRosterSignature(roster);

  if (rosterSignature === lastRosterSignature) {
    return;
  }

  console.log(`[UmaLytics] Roster detected: ${roster.players.length} players`);
  lastRosterSignature = rosterSignature;
  lastRosterMatchCode = roster.matchCode;
  lastRosterSource = source;
  await sendPrematchRoster(roster);
}

function getRosterSignature(roster: { matchCode?: string; players: Array<{ userId: string; team?: string }> }): string {
  const playerSignature = roster.players
    .map((player) => `${player.userId}:${player.team ?? 'unknown'}`)
    .sort()
    .join('|');

  return `${roster.matchCode ?? 'unknown'}:${playerSignature}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
