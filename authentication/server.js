require("dotenv").config();

const express = require("express");
const cors = require("cors");
const db = require("./database/db");
const authRoutes = require("./routes/auth");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const path = require("path");

const app = express();

// Allow the frontend origin to send cookies (credentials)
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true
  })
);

app.use(express.json());
app.use(
  session({
    store: new SQLiteStore({
      db: "sessions.db",
      dir: path.join(__dirname, "database")
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 24
    }
  })
);
app.use("/api/auth", authRoutes);

app.get("/", (req, res) => {
  res.json({
    message: "Frontier Authentication Backend is running!"
  });
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Authentication server running on port ${PORT}`);
  console.log("SQLite database connected successfully.");
});