const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../database/db");
const requireAuth = require("../middleware/requireAuth");

const router = express.Router();

// POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // 1. Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({
        message: "Name, email and password are required."
      });
    }

    // 2. Validate email format
    const normalizedEmail = email.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({
        message: "Please enter a valid email address."
      });
    }

    // 3. Validate password length
    if (typeof password !== "string" || password.length < 8) {
      return res.status(400).json({
        message: "Password must contain at least 8 characters."
      });
    }

    // 4. Check if email already exists
    const existingUser = db
      .prepare("SELECT id FROM users WHERE email = ?")
      .get(normalizedEmail);

    if (existingUser) {
      return res.status(409).json({
        message: "An account with this email already exists."
      });
    }

    // 5. Hash the password
    const passwordHash = await bcrypt.hash(password, 12);

    // 6. Save user in SQLite
    const result = db
      .prepare(`
        INSERT INTO users (name, email, password_hash)
        VALUES (?, ?, ?)
      `)
      .run(name.trim(), normalizedEmail, passwordHash);

    // 7. Return success without exposing the password hash
    return res.status(201).json({
      message: "Registration successful.",
      user: {
        id: result.lastInsertRowid,
        name: name.trim(),
        email: normalizedEmail
      }
    });
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({
        message: "An account with this email already exists."
      });
    }

    console.error("Registration error:", error.message);

    return res.status(500).json({
      message: "Something went wrong during registration."
    });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Check required fields
    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required."
      });
    }

    // 2. Find the user in SQLite
    const normalizedEmail = email.trim().toLowerCase();

    const user = db
      .prepare("SELECT * FROM users WHERE email = ?")
      .get(normalizedEmail);

    // 3. Check password without revealing which field was incorrect
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({
        message: "Invalid email or password."
      });
    }

    // 4. Regenerate session to prevent session fixation, then save
    req.session.regenerate((error) => {
      if (error) {
        console.error("Session error:", error.message);
        return res.status(500).json({
          message: "Could not create a login session."
        });
      }

      req.session.userId = user.id;

      req.session.save((saveError) => {
        if (saveError) {
          console.error("Session save error:", saveError.message);
          return res.status(500).json({
            message: "Could not save the login session."
          });
        }

        return res.status(200).json({
          message: "Login successful.",
          user: {
            id: user.id,
            name: user.name,
            email: user.email
          }
        });
      });
    });
  } catch (error) {
    console.error("Login error:", error.message);
    return res.status(500).json({
      message: "Something went wrong during login."
    });
  }
});

// GET /api/auth/me
router.get("/me", requireAuth, (req, res) => {
  try {
    const user = db
      .prepare(
        "SELECT id, name, email, created_at FROM users WHERE id = ?"
      )
      .get(req.session.userId);

    if (!user) {
      return res.status(401).json({
        message: "User account not found. Please log in again."
      });
    }

    return res.status(200).json({
      message: "Authenticated user retrieved successfully.",
      user
    });
  } catch (error) {
    console.error("Get current user error:", error.message);

    return res.status(500).json({
      message: "Something went wrong."
    });
  }
});

// POST /api/auth/logout
router.post("/logout", requireAuth, (req, res, next) => {
  req.session.destroy((error) => {
    if (error) {
      console.error("Logout error:", error.message);

      return res.status(500).json({
        message: "Could not log out. Please try again."
      });
    }

    res.clearCookie("connect.sid", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/"
    });

    return res.status(200).json({
      message: "Logout successful."
    });
  });
});

module.exports = router;