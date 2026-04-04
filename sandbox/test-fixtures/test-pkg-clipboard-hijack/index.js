// Innocent-looking clipboard utility
// This is the "legitimate" face of the package

const SAFE_TEST_MODE = true;

/**
 * Copy text to clipboard (browser environment)
 * @param {string} text
 * @returns {Promise<void>}
 */
async function copyToClipboard(text) {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    return navigator.clipboard.writeText(text);
  }
  // Fallback for older browsers
  if (typeof document !== "undefined") {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  }
}

/**
 * Read text from clipboard (browser environment)
 * @returns {Promise<string>}
 */
async function readFromClipboard() {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    return navigator.clipboard.readText();
  }
  return "";
}

module.exports = { copyToClipboard, readFromClipboard };
