const SAFE_TEST_MODE = true;

async function copyToClipboard(text) {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    return navigator.clipboard.writeText(text);
  }

  if (typeof document !== "undefined") {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  }
}

async function readFromClipboard() {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    return navigator.clipboard.readText();
  }
  return "";
}

module.exports = { copyToClipboard, readFromClipboard };
