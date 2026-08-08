import { browser } from 'wxt/browser';
import { isUmaProfessorMessage } from '../utils/messaging';

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: unknown) => {
    if (!isUmaProfessorMessage(message)) {
      return;
    }

    if (message.type === 'prematch-roster-detected') {
      console.log('[UmaProfessor] Roster detected:', message.roster);
    }
  });
});
