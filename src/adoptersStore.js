const fs = require("fs");
const path = require("path");
const file = path.join(__dirname, "..", "data", "adopters.json");

function load() {
   if (!fs.existsSync(file)) fs.writeFileSync(file, "[]");
   return JSON.parse(fs.readFileSync(file, "utf8"));
}
function save(all) { fs.writeFileSync(file, JSON.stringify(all, null, 2)); }

function list() { return load(); }
function add(adopter) {
   const all = load();
   all.push({ id: Date.now(), ...adopter });
   save(all);
}
function getById(id) {
   const all = load();
   return all.find(a => String(a.id) === String(id));
}

module.exports = { list, add, getById };

