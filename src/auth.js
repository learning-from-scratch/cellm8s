function verifyLogin(username, password) {
   return username === (process.env.APP_USER || "admin") &&
      password === (process.env.APP_PASS || "admin123");
}
module.exports = { verifyLogin };
