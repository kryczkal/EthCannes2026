const SAFE_TEST_MODE = true;

const { Transform } = require("stream");

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
