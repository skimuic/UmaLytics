import { extractMatchCodeFromUrl } from '../utils/matchDetection';

export default defineContentScript({
  matches: ['https://drafter.uma.guide/*'],
  runAt: 'document_idle',
  main() {
    console.log('[UmaProfessor] Extension loaded');

    const matchCode = extractMatchCodeFromUrl(window.location.href);

    if (matchCode !== undefined) {
      console.log(`[UmaProfessor] Match detected: ${matchCode}`);
    }
  }
});
