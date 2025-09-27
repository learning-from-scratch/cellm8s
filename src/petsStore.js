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
function getById(id) {
   const all = load();
   return all.find(p => String(p.id) === String(id));
}
function deleteById(id) {
   const all = load();
   const filtered = all.filter(p => String(p.id) !== String(id));
   save(filtered);
   return all.length !== filtered.length; // Return true if item was found and deleted
}
module.exports = { list, add, getById, deleteById };
