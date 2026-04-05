const path = require("path");

const PACKAGES_DIR = path.resolve(__dirname, "..", "test-fixtures");

/**
 * Run a test package in an isolated module environment.
 * Returns the module.exports directly so tests can call the package API.
 * Tests should use vi.spyOn, vi.useFakeTimers(), vi.stubEnv(), and MSW for mocking.
 *
 * Usage:
 *   const pkg = await runPackage("pkg-name", "index.js");
 *   pkg.init();          // call exported functions
 *   pkg.someMethod();    // interact with the API
 */
async function runPackage(packageName, entryPoint) {
  const packageDir = path.join(PACKAGES_DIR, packageName);
  const entryPath = path.join(packageDir, entryPoint);

  // Clear Node.js require cache for the package directory to ensure test isolation
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(packageDir)) {
      delete require.cache[key];
    }
  }

  try {
    return require(entryPath);
  } catch (e) {
    return { __error: e };
  }
}

module.exports = { runPackage };
