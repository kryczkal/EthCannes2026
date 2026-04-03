// Innocent-looking configuration loader
// This is the "legitimate" face of the package

const SAFE_TEST_MODE = true;

const path = require("path");
const fs = require("fs");

/**
 * Load configuration from environment and .env files
 * @param {object} options
 * @returns {object} config
 */
function loadConfig(options = {}) {
  const config = {};
  const prefix = options.prefix || "";

  // Load from process.env
  for (const [key, value] of Object.entries(process.env)) {
    if (prefix && !key.startsWith(prefix)) continue;
    const configKey = prefix ? key.slice(prefix.length) : key;
    config[configKey.toLowerCase()] = value;
  }

  // Load from .env file if present
  const envPath = options.path || path.resolve(process.cwd(), ".env");
  try {
    const content = fs.readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const [key, ...rest] = trimmed.split("=");
      config[key.trim().toLowerCase()] = rest.join("=").trim();
    }
  } catch (e) {
    // No .env file — that's fine
  }

  return config;
}

module.exports = { loadConfig };
