/**
 * Jest config for regression tests around Mo's voice/text hooks.
 *
 * Scope: hook-level and orchestration-level tests only (see __tests__/).
 * We deliberately do NOT attempt full screen-component rendering here —
 * DailyScreen/ExecutiveScreen/LuxuryScreen pull in RevenueCat, AsyncStorage,
 * and several native UI modules that would need heavy mocking for no extra
 * signal, since all three screens receive `reply`/`chatReply` as plain props
 * from the single shared hook wiring these tests exercise directly.
 */
module.exports = {
  preset: "jest-expo",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  testMatch: ["<rootDir>/__tests__/**/*.test.{ts,tsx}"],
};
