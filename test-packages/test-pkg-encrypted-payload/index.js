// Legitimate-looking stream utility
// This is the "clean" face of the package — the attack is in index.min.js

const SAFE_TEST_MODE = true;

const { Transform } = require("stream");

/**
 * Creates a flatmap transform stream
 * @param {Function} fn - mapping function
 * @returns {Transform}
 */
function flatmap(fn) {
  return new Transform({
    objectMode: true,
    transform(chunk, encoding, callback) {
      try {
        const results = fn(chunk);
        if (Array.isArray(results)) {
          results.forEach((item) => this.push(item));
        } else {
          this.push(results);
        }
        callback();
      } catch (err) {
        callback(err);
      }
    },
  });
}

/**
 * Creates a filter transform stream
 * @param {Function} predicate
 * @returns {Transform}
 */
function filter(predicate) {
  return new Transform({
    objectMode: true,
    transform(chunk, encoding, callback) {
      if (predicate(chunk)) this.push(chunk);
      callback();
    },
  });
}

module.exports = { flatmap, filter };
