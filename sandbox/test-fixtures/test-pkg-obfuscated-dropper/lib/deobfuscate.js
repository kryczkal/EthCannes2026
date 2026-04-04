const SAFE_TEST_MODE = true;

const XOR_KEY = "OrDeR_7077";
const XOR_CONSTANT = 333;

function xorDecrypt(data) {
  const result = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i++) {
    result[i] =
      data[i] ^ XOR_KEY.charCodeAt(i % XOR_KEY.length) ^ (XOR_CONSTANT & 0xff);
  }
  return result;
}

function decode(encoded) {

  const reversed = encoded.split("").reverse().join("");

  const decoded = Buffer.from(reversed, "base64");

  const decrypted = xorDecrypt(decoded);
  return decrypted.toString("utf-8");
}

function encode(plaintext) {
  const data = Buffer.from(plaintext, "utf-8");
  const encrypted = xorDecrypt(data);
  const b64 = encrypted.toString("base64");
  return b64.split("").reverse().join("");
}

module.exports = { decode, encode, xorDecrypt };
