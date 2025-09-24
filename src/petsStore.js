const fs = require("fs");
const path = require("path");
const file = path.join(__dirname, "..", "data", "pets.json");

function load() {
   if (!fs.existsSync(file)) fs.writeFileSync(file, "[]");
   return JSON.parse(fs.readFileSync(file, "utf8"));
}
function save(all) { fs.writeFileSync(file, JSON.stringify(all, null, 2)); }

function list() { return load(); }
function add(pet) {
   const all = load();
   all.push({ id: Date.now(), ...pet });
   save(all);
}
module.exports = { list, add };
