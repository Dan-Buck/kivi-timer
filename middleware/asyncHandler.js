// utils/asyncHandler.js
module.exports = function asyncHandler(fn) {
    return function (req, res, next) {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};


// debugging requests
// app.use((req, res, next) => {
//     console.log(`Incoming request: ${req.method} ${req.originalUrl}`);
//     next(); // Continue to the next middleware or route handler
// });

