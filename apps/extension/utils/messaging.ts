import { browser } from 'wxt/browser';
import type { PrematchRoster } from '@uma-professor/shared';

export type UmaProfessorMessage = {
  type: 'prematch-roster-detected';
  roster: PrematchRoster;
};

export function isUmaProfessorMessage(value: unknown): value is UmaProfessorMessage {
  if (!isRecord(value) || value.type !== 'prematch-roster-detected') {
    return false;
  }

  return isRecord(value.roster) && Array.isArray(value.roster.players);
}

export async function sendPrematchRoster(roster: PrematchRoster): Promise<void> {
  await browser.runtime.sendMessage({
    type: 'prematch-roster-detected',
    roster
  } satisfies UmaProfessorMessage);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
