import { defineConfig } from 'wxt';

export default defineConfig({
  manifestVersion: 3,
  manifest: {
    name: 'UmaProfessor',
    description: 'Prematch scouting companion for Uma Drafter.'
  },
  modules: ['@wxt-dev/module-react']
});
