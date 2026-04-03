const path = require("path");

const PACKAGES_DIR = path.resolve(__dirname, "..", "test-packages");

/**
 * Run a test package in an isolated module environment.
 * Tests should use vi.spyOn, vi.useFakeTimers(), vi.stubEnv(), and MSW for mocking.
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

  let exports;
  try {
    exports = require(entryPath);
  } catch (e) {
    exports = { __error: e };
  }

  return { exports };
}

module.exports = { runPackage };
