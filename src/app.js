const express = require("express");
const path = require("path");
const session = require("express-session");
const bodyParser = require("body-parser");
const { requireAuth } = require("./middleware");
const { verifyLogin } = require("./auth");
const pets = require("./petsStore");

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
   res.render("dashboard", {
      user: req.session.user.username,
      stats: { totalPets: pets.list().length }
   });
});

app.get("/pets", requireAuth, (_req, res) => {
   res.render("pets", { pets: pets.list(), error: null });
});
app.post("/pets", requireAuth, (req, res) => {
   const { name, type } = req.body;
   if (!name || !type) return res.status(400).render("pets", { pets: pets.list(), error: "Name and type are required." });
   pets.add({ name, type });
   res.redirect("/pets");
});

module.exports = app;
