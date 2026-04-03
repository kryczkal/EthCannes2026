
const { server } = require("./server");

beforeAll(() => {
    server.listen({ onUnhandledRequest: "bypass" });
});

afterEach(() => {
    server.resetHandlers();
});

afterAll(() => {
    server.close();
});
