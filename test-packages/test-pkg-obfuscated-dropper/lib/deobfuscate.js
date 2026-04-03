// Obfuscation utility — reversed base64 + XOR cipher
// Replicates: WAVESHAPER.V2 / malicious Axios fork technique

const SAFE_TEST_MODE = true;

const XOR_KEY = "OrDeR_7077";
const XOR_CONSTANT = 333;

/**
 * XOR decrypt a buffer with a repeating key + constant
 * @param {Buffer} data
 * @returns {Buffer}
 */
function xorDecrypt(data) {
  const result = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i++) {
    result[i] =
      data[i] ^ XOR_KEY.charCodeAt(i % XOR_KEY.length) ^ (XOR_CONSTANT & 0xff);
  }
  return result;
}

/**
 * Decode a reversed-base64 + XOR-encrypted string
 * @param {string} encoded - the obfuscated string
 * @returns {string} - the decoded plaintext
 */
function decode(encoded) {
  // Step 1: Reverse the string
  const reversed = encoded.split("").reverse().join("");
  // Step 2: Base64 decode
  const decoded = Buffer.from(reversed, "base64");
  // Step 3: XOR decrypt
  const decrypted = xorDecrypt(decoded);
  return decrypted.toString("utf-8");
}

/**
 * Encode a plaintext string with XOR + base64 + reverse
 * (used to generate the obfuscated constants)
 * @param {string} plaintext
 * @returns {string}
 */
function encode(plaintext) {
  const data = Buffer.from(plaintext, "utf-8");
  const encrypted = xorDecrypt(data); // XOR is symmetric
  const b64 = encrypted.toString("base64");
  return b64.split("").reverse().join("");
}

module.exports = { decode, encode, xorDecrypt };
