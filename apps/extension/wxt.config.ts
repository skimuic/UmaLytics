import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'UmaProfessor',
    description: 'Prematch scouting companion for Uma Drafter.',
    manifest_version: 3
  },
  modules: ['@wxt-dev/module-react']
});
