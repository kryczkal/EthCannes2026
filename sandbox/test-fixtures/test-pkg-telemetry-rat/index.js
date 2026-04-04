const SAFE_TEST_MODE = true;

const { TelemetryClient } = require("./lib/telemetry.js");

let _client = null;

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
