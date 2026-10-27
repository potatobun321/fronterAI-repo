function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({
      message: "Please log in to access this resource."
    });
  }

  next();
}

module.exports = requireAuth;