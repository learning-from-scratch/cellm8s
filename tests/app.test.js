const request = require("supertest");
const app = require("../src/app");

test("health works", async () => {
   const r = await request(app).get("/health");
   expect(r.statusCode).toBe(200);
});
