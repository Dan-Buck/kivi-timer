const express = require("express");
const session = require("express-session");
const socketIo = require("socket.io");
const http = require("http");
const path = require("path");
const fs = require("fs");
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
const { on } = require("events");
const { emit } = require("process");


//get settings/configs
const port = settings.port;
const controlKey = settings.controlKey;
const ngrokAuth = settings.ngrok.authtoken;
const ngrokHost = settings.ngrok.hostname;
const tunnelAuth = settings.ngrok.tunnelAuth;
let roundSettings = settings.roundSettings;
let ngrokUrl = ""; // Store the generated ngrok URL

// timer management vars
let remainingTime, timerInterval, turnoverInterval, betweenRounds, roundStarted;
let remainingTurnoverTime = 0;
let roundState = 0;
let roundName = "";

// athlete list
let athletes = {
    "male": [],
    "female": [],
    "combined": [],
}

// group name tracker
let groups = {
    "male": "",
    "female": "",
    "combined": "",
}

// ondeck tracker
let ondeck = {
    "male": [],
    "female": [],
    "combined": [],
}

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
    if (password === controlKey || !controlKey) {
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

// Middleware to protect control page
app.use("/control", sessionAuth("controller"), express.static(path.join(__dirname, "./client/control")));

// Home goes to timer
const timerPath = path.join(__dirname, "./client/timer");
app.use("/", express.static(timerPath));

// Serve the client directory as static
app.use(express.static(path.join(__dirname, "client")));

// API route to fetch the ngrok URL and localhost port
app.get("/connections", (req, res) => {
    res.json({ ngrokUrl, port });
});

// handles athlete data intake/deletion
app.post("/athletes", (req, res) => {
    if (roundStarted) {
        return res.status(400).json({ error: "Round started: first 'Reset Entire Round'" });
    }

    if (req.body.delete === "yes") {
        // Clear the athletes data
        athletes = {
            "male": [],
            "female": [],
            "combined": []
        };
        groups = {
            "male": "",
            "female": "",
            "combined": "",
        }
        console.log("athlete data cleared");
        return res.status(200).json({ message: "Athlete data cleared" });
    }

    const { athletes: receivedAthletes, category: receivedCategory, groupName: receivedGroupName } = req.body; // Expecting { athletes: [...] }

    if (!Array.isArray(receivedAthletes) || !receivedAthletes.every(a => a.id && a.firstName && a.lastName)) {
        return res.status(400).json({ error: "Invalid athlete data format" });
    }

    if (!athletes.hasOwnProperty(receivedCategory)) {
        return res.status(400).json({ error: "Invalid category" });
    }

    athletes[receivedCategory] = receivedAthletes; // Overwrite existing data
    groups[receivedCategory] = receivedGroupName; // store group name by category
    res.status(200).json({ message: "Athlete data stored successfully" });
    console.log("athlete list received: " + receivedGroupName);
});

app.get("/athletes", (req, res) => {
    res.json(athletes);
});

app.get("/round-settings", (req, res) => {
    res.json(roundSettings);
})

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: "Something went wrong!" });
});

// Sockets
io.on("connection", (socket) => {
    console.log("New socket connection established");

    socket.on("start-timer", () => {
        // 5s countdown on first start
        if (!roundStarted) {
            console.log(`timer started`);
            roundStarted = true;
            betweenRounds = true;
            remainingTurnoverTime = 6;
            return runTurnoverTimer();
        }

        if (timerInterval || turnoverInterval) {
            return console.log("timer already running");
        }
        if (betweenRounds) {
            console.log("resuming turnover timer");
            runTurnoverTimer();
        } else {
            console.log("resuming timer");
            runTimer();
        }
    });

    socket.on("pause-timer", () => {
        console.log("timer paused");
        clearAllIntervals();
    });

    socket.on("zero-timer", () => {
        console.log("timer zero-ed");
        clearAllIntervals();
        remainingTime = roundSettings.timerMode;
        timerUpdateEmit(remainingTime);
    });

    socket.on("next-climber", () => {
        console.log("next climber: timer paused, round advanced");
        reset();
    });

    socket.on("round-name-update", (newRoundName) => {
        roundName = newRoundName;
        console.log(`round name update: ${roundName}`);
    });

    socket.on("group-name-update", (data) => {
        groups[data.category] = data.newGroupName;
    });

    socket.on("reset-round", () => {
        console.log("round reset");
        roundState = 0;
        reset();
        // populate transit area boulder list
        for (const category in athletes) {
            if (athletes[category].length > 0) {
                roundState = -1;
                advanceRoundState();
                return;
            }
        }
    });

    socket.on("change-timer-mode", (mode) => {
        console.log(`timer mode changed to ${mode}`);
        roundSettings.timerMode = mode;
    });

    socket.on("change-boulder-number", (boulders) => {
        console.log(`boulders in round changed to ${boulders}`);
        roundSettings.boulders = boulders;
        io.emit("settings-update");
    });

    socket.on("change-zone-number", (zones) => {
        console.log(`zones in round changed to ${zones}`);
        roundSettings.zones = zones;
    });

    socket.on("change-finals-mode", (mode) => {
        console.log(`finals mode changed to : ${mode}`);
        roundSettings.finalsMode = (mode === "true") ? true : false;
    })

    socket.on("change-round-state", (data) => {
        console.log(`round state change: athlete# [${data.athleteID}] boulder# [${data.boulder}] stage# [${data.stage}]`);
        reset();
        roundState = 0;
        selectRoundState(data);
    });

});

function reset() {
    remainingTime = roundSettings.timerMode;
    betweenRounds = false;
    roundStarted = false;
    clearAllIntervals();
    timerUpdateEmit();
    io.emit("settings-update", { roundSettings });
    io.emit("round-end");
}

function clearAllIntervals() {
    clearInterval(timerInterval);
    clearInterval(turnoverInterval);
    timerInterval = null;
    turnoverInterval = null;
}

function runTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        if (remainingTime > 0) {
            remainingTime--;
            timerUpdateEmit(remainingTime);
        } else {
            if (roundSettings.timerMode === 120) {
                remainingTime = roundSettings.timerMode;
                return runTimer();
            }
            clearInterval(timerInterval);
            betweenRounds = true;
            io.emit("round-end");
            timerUpdateEmit(roundSettings.turnover);
            runTurnoverTimer();
        }
    }, 1000);
}

function runTurnoverTimer() {
    if (turnoverInterval) clearInterval(turnoverInterval);
    if (remainingTurnoverTime === 0) remainingTurnoverTime = roundSettings.turnover;

    turnoverInterval = setInterval(() => {
        if (remainingTurnoverTime > 0) {
            remainingTurnoverTime--;
            timerUpdateEmit(remainingTurnoverTime);
        } else {
            clearInterval(turnoverInterval)
            betweenRounds = false;
            io.emit("round-begin", { groupName: groups, roundState: roundState });
            console.log("round " + roundState + " begin: " + groups.male + "|" + groups.female + "|" + groups.combined);
            timerUpdateEmit(roundSettings.timerMode);
            advanceRoundState();
            remainingTime = roundSettings.timerMode;
            runTimer();
        }
    }, 1000);
}

// moves climbers through boulders by 1 step
function advanceRoundState() {
    roundState++;
    saveStateToFile(roundName, roundState, remainingTime);
    ondeck = {
        "male": [],
        "female": [],
        "combined": [],
    }
    for (const category in athletes) {
        if (athletes[category].length === 0) continue;

        // if finalsMode then only 1 climber on the wall at a time
        if (roundSettings.finalsMode) {
            const nextUp = (roundState % athletes[category].length); // index 0 is first climber...
            const boulder = Math.ceil((roundState + 1) / athletes[category].length);
            ondeck[category].push({ boulder: (boulder === 0) ? 1 : boulder, athlete: athletes[category][nextUp] });
        } else {
            for (let boulder = 1; boulder <= roundSettings.boulders; boulder++) {
                const nextUp = roundState - 2 * (boulder - 1);
                ondeck[category].push({ boulder, athlete: (nextUp >= 0 && nextUp < athletes[category].length) ? athletes[category][nextUp] : null });
            }
        }
    }
    io.emit("ondeck-update", { roundName: roundName, ondeck: ondeck, roundState: roundState, groups: groups });
}

// advances roundstate to place a climber on a specific boulder
function selectRoundState(data) {
    let steps = 0;
    if (data.stage) {
        console.log(`advancing ${data.stage} steps`);
        steps = data.stage - 1;
    } else {
        const athleteID = String(data.athleteID);
        const boulder = data.boulder;
        let placeInOrder = -1
        let foundCategory;
        for (const category in athletes) {
            placeInOrder = athletes[category].findIndex(athlete => athlete.id === athleteID);
            if (placeInOrder !== -1) {
                foundCategory = category
                break;
            }
        }
        if (placeInOrder === -1 || !foundCategory) {
            console.log('could not place athlete, ID not found in list');
            return;
        }

        const multiplier = roundSettings.finalsMode ? athletes[foundCategory].length : 2;
        steps = placeInOrder + multiplier * (boulder - 1);
    }

    for (let step = 0; step < steps; step++) {
        advanceRoundState();
    }
}

let writeErrorFlag;
// emits timer update plus writes to txt
function timerUpdateEmit(time) {
    if (!time) {
        io.emit("timer-update", { remainingTime });
        return
    }

    io.emit("timer-update", { remainingTime: time });

    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    const formattedTime = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    const filePath = path.join(__dirname, "misc/timer.txt");

    fsp.writeFile(filePath, formattedTime, "utf-8").catch(err => {
        if (!writeErrorFlag) {
            console.error("Timer file write failed:", err.message);
            writeErrorFlag = true;
        }
    });
}

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
    clearInterval(timerInterval);
    clearInterval(turnoverInterval);
    try {
        await ngrok.disconnect(); // safely ignore if not running
    } catch (err) {
        console.warn("Ngrok disconnect failed (likely not running):", err.message);
    }
    process.exit(0);
});

