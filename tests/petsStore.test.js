const fs = require("fs");
const path = require("path");
const store = require("../src/petsStore");
const file = path.join(__dirname, "..", "data", "pets.json");

beforeEach(() => fs.writeFileSync(file, "[]"));

test("add + list", () => {
   store.add({ name: "Mochi", type: "cat" });
   const all = store.list();
   expect(all.length).toBe(1);
   expect(all[0].name).toBe("Mochi");
});
