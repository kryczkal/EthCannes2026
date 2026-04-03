// Innocent-looking string parser utility
// This is the "legitimate" face of the package

const SAFE_TEST_MODE = true;

/**
 * Parse a user-agent string into components
 * @param {string} uaString
 * @returns {object}
 */
function parse(uaString) {
  if (typeof uaString !== "string") return {};

  const result = {
    browser: null,
    version: null,
    os: null,
  };

  if (uaString.includes("Chrome")) {
    result.browser = "Chrome";
    const match = uaString.match(/Chrome\/([\d.]+)/);
    if (match) result.version = match[1];
  } else if (uaString.includes("Firefox")) {
    result.browser = "Firefox";
    const match = uaString.match(/Firefox\/([\d.]+)/);
    if (match) result.version = match[1];
  }

  if (uaString.includes("Windows")) result.os = "Windows";
  else if (uaString.includes("Mac")) result.os = "macOS";
  else if (uaString.includes("Linux")) result.os = "Linux";

  return result;
}

module.exports = { parse };
