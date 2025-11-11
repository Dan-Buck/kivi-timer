const express = require("express");
const session = require("express-session");
const socketIo = require("socket.io");
const http = require("http");
const path = require("path");
const fsp = require("fs/promises");  // fsp = fs.promises
const dotenv = require("dotenv");
dotenv.config();
const sessionAuth = require("./middleware/sessionAuth");
require("./helpers/logger") // server logging
const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const ngrok = require("ngrok");
const settings = require("./helpers/config");
const { saveStateToFile, loadStateFromFile } = require("./helpers/saveState");
const getLocalIPs = require("./helpers/connections");
const { playSoundFile } = require("./helpers/serverSound");
const { CompetitionManager } = require("./server/CompetitionManager");

//get settings/configs
const port = settings.port;
const controlKey = settings.controlKey;
const ngrokAuth = settings.ngrok.authtoken;
const ngrokHost = settings.ngrok.hostname;
const tunnelAuth = settings.ngrok.tunnelAuth;
let ngrokUrl = ""; // Store the generated ngrok URL

// Setup session middleware
app.use(
    session({
        secret: "secret_key_here",
        resave: false,
        saveUninitialized: true,
    })
);

app.use(express.json());

// Middleware function to validate access key and create session
app.post("/control", (req, res) => {
    const { password } = req.body;
    // if controlKey not set, anyone can access control 
    if (password === controlKey || (!controlKey && password === "password")) {
        req.session.authenticated = true;
        req.session.userType = "controller";
        res.status(200).json({ message: "Access granted" });
    } else {
        res.status(401).json({ message: "Unauthorized" });
    }
});

// Override for socket.io
app.use("/socket.io", express.static(path.join(__dirname, "node_modules", "socket.io", "client-dist")));

// transit area screen handler
app.use("/transit", express.static(path.join(__dirname, "./client/transit")));

// gen info handler
app.use("/info", express.static(path.join(__dirname, "./client/info")));

// Middleware to protect control page
app.use("/control", sessionAuth("controller"), express.static(path.join(__dirname, "./client/control")));

// Home goes to timer
const timerPath = path.join(__dirname, "./client/timer");
app.use("/", express.static(timerPath));

// Serve the client directory as static
app.use(express.static(path.join(__dirname, "client")));

// API route to fetch the ngrok URL and localhost port
app.get("/connections", (req, res) => {
    res.json({
        ngrokUrl,
        port,
        lanIPs: getLocalIPs()
    });
});

// API for round status requests from new connections
app.get("/round-status", (req, res) => {
    res.json(competition.getFullState());
});

// handles athlete data intake/deletion
app.post("/athletes", (req, res) => {
    const result = competition.handleAthleteUpload(req.body);
    if (result.error) {
        return res.status(400).json({ error: result.error });
    }
    res.status(200).json({ message: result.message });

});

app.get("/athletes", (req, res) => {
    res.json(competition.getAthletes());
});

app.get("/round-settings", (req, res) => {
    res.json(competition.getRoundSettings());
})

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: "Something went wrong!" });
});

// Sockets
io.on("connection", (socket) => {
    const ip = socket.handshake.headers["x-forwarded-for"] || socket.handshake.address;
    console.log(`New socket from IP: ${ip} (ID: ${socket.id})`);

    socket.on("start-timer", () => competition.startTimer());
    socket.on("pause-timer", () => competition.pauseTimer());
    socket.on("zero-timer", () => competition.zeroTimer());
    socket.on("next-climber", () => competition.nextClimber());
    socket.on("round-name-update", (newRoundName) => competition.updateRoundName(newRoundName));
    socket.on("group-name-update", (data) => competition.updateGroupName(data));
    socket.on("group-category-change", (data) => competition.updateGroupCategory(data));
    socket.on("reset-round", () => competition.resetRound());
    socket.on("change-round-state", (data) => competition.changeRoundState(data));

    // Settings updates
    socket.on("change-timer-mode", (mode) => competition.updateSettings({ timerMode: mode }));
    socket.on("change-boulder-number", (boulders) => competition.updateSettings({ boulders: boulders }));
    socket.on("change-zone-number", (zones) => competition.updateSettings({ zones: zones }));
    socket.on("change-finals-mode", (mode) => competition.updateSettings({ finalsMode: (mode === "true") }));
    socket.on("change-finals-climbers", (climbers) => competition.updateSettings({ finalsClimbers: climbers }));
});

const handlePlaySound = (file) => {
    // The `playSound` function from your original code
    const localPath = path.join(__dirname, "client", file);
    playSoundFile(localPath);
    io.emit("play-sound", { path: file });
};

const handleWriteStatus = (writeString, callback) => {
    const filePath = path.join(__dirname, "misc/timer.txt");
    fsp.writeFile(filePath, writeString, "utf-8").then(() => callback(null)).catch(callback);
};

const handleSaveStateToFile = (roundName, roundState, remainingTime) => {
    saveStateToFile(roundName, roundState, remainingTime);
}

const competition = new CompetitionManager(
    io,
    {
        roundSettings: settings.roundSettings, // from config.js
        soundMap: settings.soundMap            // from config.js
    },
    {
        onPlaySound: handlePlaySound,
        onWriteStatus: handleWriteStatus,
        onSaveStateToFile: handleSaveStateToFile
    }
);

// Server start with error handling 
try {
    server.listen(port, async () => {
        console.log(`Server is running on http://localhost:${port}`);
        try {
            const url = await ngrok.connect({
                addr: port,
                authtoken: ngrokAuth,
                basic_auth: tunnelAuth,
                region: 'eu',
                hostname: ngrokHost
            });
            console.log(`ngrok tunnel established at ${url}`);
            ngrokUrl = url;
        } catch (err) {
            console.error("NONFATAL - failed to connect to ngrok: ", err.message);
        }

    });
} catch (error) {
    console.error("Failed to start server: ", err.message);
}

process.on("SIGINT", async () => {
    console.log("Shutting down...");
    competition.shutDown();
    try {
        await ngrok.disconnect(); // safely ignore if not running
    } catch (err) {
        console.warn("Ngrok disconnect failed (likely not running):", err.message);
    }
    process.exit(0);
});

