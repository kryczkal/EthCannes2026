const { defineConfig } = require("vitest/config");

module.exports = defineConfig({
  test: {
    include: ["exploits/**/*.test.{js,ts}"],
    setupFiles: ["./harness/setup.js"],
    restoreMocks: true,
    testTimeout: 15000,
    pool: "forks",
    reporters: ["verbose"],
    globals: true,
  },
});
