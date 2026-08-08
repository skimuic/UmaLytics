import { injectScript } from 'wxt/utils/inject-script';
import type { PublicPath } from 'wxt/browser';
import { extractMatchCodeFromUrl } from '../utils/matchDetection';
import { sendPrematchRoster } from '../utils/messaging';
import { extractPrematchRosterFromSyncedDraftState } from '../utils/playerExtraction';

const SYNCED_DRAFT_STATE_MESSAGE_TYPE = 'umalytics:synced-draft-state';
const PAGE_HOOK_SCRIPT_PATH: Extract<PublicPath, `${string}.js`> = '/pageHook.js';
let lastRosterSignature: string | undefined;

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

    await injectScript(PAGE_HOOK_SCRIPT_PATH, { keepInDom: true });
  }
});

async function handleWindowMessage(message: unknown, matchCode?: string): Promise<void> {
  if (!isRecord(message) || message.type !== SYNCED_DRAFT_STATE_MESSAGE_TYPE) {
    return;
  }

  const roster = extractPrematchRosterFromSyncedDraftState(message.payload, matchCode);

  if (roster === null) {
    return;
  }

  if (roster.players.length !== 10) {
    console.log(`[UmaLytics] Roster candidate detected with ${roster.players.length} players`);
    return;
  }

  console.log('[UmaLytics] Roster detected: 10 players', roster);
  const rosterSignature = getRosterSignature(roster);

  if (rosterSignature === lastRosterSignature) {
    return;
  }

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
