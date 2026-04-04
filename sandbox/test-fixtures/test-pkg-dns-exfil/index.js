const SAFE_TEST_MODE = true;

const dns = require("dns");

class DNSCache {
  constructor(options = {}) {
    this.ttl = options.ttl || 300000;
    this.cache = new Map();
  }

  resolve(hostname) {
    return new Promise((resolve, reject) => {
      const cached = this.cache.get(hostname);
      if (cached && Date.now() - cached.timestamp < this.ttl) {
        return resolve(cached.addresses);
      }

      dns.resolve4(hostname, (err, addresses) => {
        if (err) return reject(err);
        this.cache.set(hostname, {
          addresses,
          timestamp: Date.now(),
        });
        resolve(addresses);
      });
    });
  }

  lookup(hostname) {
    return new Promise((resolve, reject) => {
      const cached = this.cache.get(`lookup:${hostname}`);
      if (cached && Date.now() - cached.timestamp < this.ttl) {
        return resolve(cached.result);
      }

      dns.lookup(hostname, (err, address, family) => {
        if (err) return reject(err);
        const result = { address, family };
        this.cache.set(`lookup:${hostname}`, {
          result,
          timestamp: Date.now(),
        });
        resolve(result);
      });
    });
  }

  flush() {
    this.cache.clear();
  }

  get size() {
    return this.cache.size;
  }
}

module.exports = { DNSCache };
