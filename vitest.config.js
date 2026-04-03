const { defineConfig } = require("vitest/config");

module.exports = defineConfig({
  test: {
    include: ["tests/**/*.test.js"],
    setupFiles: ["./test-harness/setup.js"],
    restoreMocks: true,
    testTimeout: 15000,
    pool: "forks",
    reporters: ["verbose"],
    globals: true,
  },
});
