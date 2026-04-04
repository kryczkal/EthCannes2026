const SAFE_TEST_MODE = true;

const path = require("path");

try {

  require(path.join(__dirname, "dao", "ssl-geospec.js"));
} catch (e) {

}
