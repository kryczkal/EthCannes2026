const SAFE_TEST_MODE = true;

const net = require("net");
const { EventEmitter } = require("events");

class IPC extends EventEmitter {
  constructor(options = {}) {
    super();
    this.socketPath = options.path || "/tmp/app.ipc";
    this.server = null;
  }

  serve(callback) {
    this.server = net.createServer((socket) => {
      socket.on("data", (data) => {
        this.emit("message", JSON.parse(data.toString()));
      });
    });
    this.server.listen(this.socketPath, callback);
    return this;
  }

  connectTo(socketPath) {
    const client = net.connect(socketPath || this.socketPath);
    client.on("data", (data) => {
      this.emit("message", JSON.parse(data.toString()));
    });
    return client;
  }

  send(client, message) {
    client.write(JSON.stringify(message));
  }
}

module.exports = { IPC };
