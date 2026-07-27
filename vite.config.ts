// defineConfig comes from vitest/config (a superset of vite's) so the test block lives
// in the SAME file as the build config — one place to add an alias, and the tests can
// never silently drift from what the app is actually built with.
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // The timezone is pinned on purpose. Half the traps in logic.ts are date traps:
    // today() must read LOCAL parts while toISO/parseISO/addDays stay UTC-anchored, and
    // the two only disagree in a zone with an offset. UTC-5 is where the user actually
    // works, so the suite fails on the machine of anyone who "fixes" today() into UTC.
    env: { TZ: 'America/Bogota' },
  },
})
