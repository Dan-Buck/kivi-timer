// logger.js
const fs = require("fs");
const path = require("path");

const logPath = path.join(__dirname, "../misc/server.log");
const logStream = fs.createWriteStream(logPath, { flags: "a" });

logStream.on("error", (err) => {
    console.error("Log stream error:", err.message);
    fallbackToConsoleLogging();
});

function fallbackToConsoleLogging() {
    console.log = (...args) => {
        const msg = `[${new Date().toISOString()}] ${args.join(" ")}\n`;
        process.stdout.write(msg);
    };
}

console.log = (...args) => {
    const msg = `[${new Date().toISOString()}] ${args.join(" ")}\n`;
    process.stdout.write(msg);
    logStream.write(msg);
};

// Optional: also override console.error
console.error = (...args) => {
    const msg = `[${new Date().toISOString()}] ERROR: ${args.join(" ")}\n`;
    process.stderr.write(msg);
    logStream.write(msg);
};
