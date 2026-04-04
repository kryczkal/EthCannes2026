function format(source) {
  return source
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim()
    .concat('\n');
}

module.exports = {
  format
};
