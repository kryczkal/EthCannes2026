const { setupServer } = require("msw/node");

const server = setupServer();

module.exports = { server };
