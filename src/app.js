const express = require("express");
const path = require("path");
const session = require("express-session");
const bodyParser = require("body-parser");
const { requireAuth } = require("./middleware");
const { verifyLogin } = require("./auth");
const pets = require("./petsStore");
const adopters = require("./adoptersStore");

const app = express();
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "..", "views"));
app.use(express.static(path.join(__dirname, "..", "public")));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({ secret: process.env.SESSION_SECRET || "dev", resave: false, saveUninitialized: false }));

app.get("/health", (_req, res) => res.send("OK"));
app.get("/", (_req, res) => res.redirect("/login"));

app.get("/login", (req, res) => res.render("login", { error: null }));
app.post("/login", (req, res) => {
   const { username, password } = req.body;
   if (verifyLogin(username, password)) {
      req.session.user = { username };
      return res.redirect("/dashboard");
   }
   res.status(401).render("login", { error: "Invalid credentials" });
});
app.post("/logout", (req, res) => { req.session.destroy(() => res.redirect("/login")); });

app.get("/dashboard", requireAuth, (req, res) => {
   const all = pets.list();
   const now = new Date();
   const dayMs = 24 * 60 * 60 * 1000;
   const days = [];
   const labels = [];
   for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * dayMs);
      d.setHours(0, 0, 0, 0);
      days.push(d.getTime());
      labels.push(d.toLocaleDateString(undefined, { weekday: 'short' }));
   }
   const counts = days.map((startTs) => {
      const endTs = startTs + dayMs - 1;
      return all.filter(p => Number(p.id) >= startTs && Number(p.id) <= endTs).length;
   });

   res.render("dashboard", {
      user: req.session.user.username,
      stats: {
         totalPets: all.length,
         weekLabels: labels,
         weekAdoptions: counts
      }
   });
});

app.get("/pets", requireAuth, (_req, res) => {
   res.render("pets", { pets: pets.list(), error: null });
});
app.get("/pets/new", requireAuth, (_req, res) => {
   res.render("pet_new", { error: null });
});
app.post("/pets/new", requireAuth, (req, res) => {
   const { name, type, breed, age, gender, weight, photo, about, health, specialNeeds } = req.body;
   if (!name || !type) return res.status(400).render("pet_new", { error: "Name and type are required." });
   const addPayload = {
      name,
      type,
      breed,
      age,
      gender,
      weight,
      photo,
      about,
      health: health ? health.split(',').map(s => s.trim()).filter(Boolean) : [],
      specialNeeds: specialNeeds ? specialNeeds.split(',').map(s => s.trim()).filter(Boolean) : []
   };
   pets.add(addPayload);
   res.redirect("/pets");
});
app.get("/pets/:id", requireAuth, (req, res) => {
   const pet = pets.getById(req.params.id);
   if (!pet) return res.status(404).render("pets", { pets: pets.list(), error: "Pet not found." });
   res.render("pet", { pet });
});
app.delete("/pets/:id", requireAuth, (req, res) => {
   const deleted = pets.deleteById(req.params.id);
   if (!deleted) return res.status(404).json({ error: "Pet not found." });
   res.json({ success: true, message: "Pet deleted successfully." });
});

// Adopters
app.get("/adopters", requireAuth, (_req, res) => {
   res.render("adopters", { adopters: adopters.list(), error: null });
});
app.get("/adopters/new", requireAuth, (_req, res) => {
   res.render("adopter_new", { error: null });
});
app.post("/adopters/new", requireAuth, (req, res) => {
   const { firstName, lastName, email, phone, address, city, state, zip, about, preferences } = req.body;
   if (!firstName || !lastName || !email) return res.status(400).render("adopter_new", { error: "First name, last name, and email are required." });
   adopters.add({
      firstName,
      lastName,
      email,
      phone,
      address,
      city,
      state,
      zip,
      about,
      preferences: preferences ? preferences.split(',').map(s => s.trim()).filter(Boolean) : []
   });
   res.redirect("/adopters");
});
app.get("/adopters/:id", requireAuth, (req, res) => {
   const adopter = adopters.getById(req.params.id);
   if (!adopter) return res.status(404).render("adopters", { adopters: adopters.list(), error: "Adopter not found." });
   res.render("adopter", { adopter });
});
app.delete("/adopters/:id", requireAuth, (req, res) => {
   const deleted = adopters.deleteById(req.params.id);
   if (!deleted) return res.status(404).json({ error: "Adopter not found." });
   res.json({ success: true, message: "Adopter deleted successfully." });
});

module.exports = app;
