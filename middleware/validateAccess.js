function validateAccess(accessKey) {
  return async (req, res, next) => {
    // Check if the app is in development mode
    if (process.env.NODE_ENV === "development") {
      // Bypass the access key check in development mode
      return next();
    }

    const providedKey = req.body.accessKey;

    if (!providedKey) {
      await delay(500);
      return res.status(401).send("Unauthorized: Access key not provided");
    }

    if (providedKey !== accessKey) {
      await delay(500);
      return res.status(401).send("Unauthorized: Invalid access key");
    }

    // If access key is valid, proceed to the next middleware or route handler
    next();
  };
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = validateAccess;
