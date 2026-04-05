global.__NPMGUARD_HARNESS_CACHE_COUNT__ =
  (global.__NPMGUARD_HARNESS_CACHE_COUNT__ || 0) + 1;

module.exports = {
  loadCount: global.__NPMGUARD_HARNESS_CACHE_COUNT__,
};
