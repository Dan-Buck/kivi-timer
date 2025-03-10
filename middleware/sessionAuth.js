function sessionAuth(userType) {
  return (req, res, next) => {
    // Check if the app is in development mode
    if (process.env.NODE_ENV === "development") {
      // Bypass the authentication check in development mode
      return next();
    }

    // Check if user is authenticated in session
    if (!req.session.authenticated || req.session.userType !== userType) {
      return res
        .status(401)
        .send("Unauthorized: Please login to access this page.");
    }
    next();
  };
}

module.exports = sessionAuth;
