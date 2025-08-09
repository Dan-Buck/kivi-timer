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
const getLocalIPs = require("./helpers/connections");
const { on } = require("events");
const { emit } = require("process");
const { time } = require("console");


//get settings/configs
const port = settings.port;
const controlKey = settings.controlKey;
const ngrokAuth = settings.ngrok.authtoken;
const ngrokHost = settings.ngrok.hostname;
const tunnelAuth = settings.ngrok.tunnelAuth;
let roundSettings = settings.roundSettings;
let ngrokUrl = ""; // Store the generated ngrok URL

// timer management vars
let timerInterval, turnoverInterval, betweenRounds, roundStarted;
let remainingTime = 0;
let remainingTurnoverTime = 0;
let roundState = 0;
let roundName = "";
let startInStageTime = 0;

// athlete list
let athletes = {
    1: [],
    2: [],
    3: [],
}

// group name tracker
let groups = {
    1: "",
    2: "",
    3: "",
}

// ondeck tracker
let ondeck = {
    1: [],
    2: [],
    3: [],
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
    res.json({
        roundName: roundName,
        roundState: roundState,
        betweenRounds: betweenRounds,
        ondeck: ondeck,
        groups: groups,
        roundSettings: roundSettings,
        remainingTime: remainingTime,
        roundStarted: roundStarted
    });
});
// handles athlete data intake/deletion
app.post("/athletes", (req, res) => {
    if (req.body.delete === "yes") {
        // Clear the athletes/groups/undeck data
        clearData();
        console.log("athlete data cleared");
        return res.status(200).json({ message: "Athlete data cleared" });
    }

    if (roundStarted) {
        return res.status(400).json({ error: "Round started: first 'Reset Entire Round'" });
    }

    const { athletes: receivedAthletes, category: receivedCategory, groupName: receivedGroupName, groupNumber: groupDesig } = req.body; // Expecting { athletes: [...] }

    // Expecting "group-1"
    groupNumber = parseInt(groupDesig.split("-")[1], 10);

    if (!Array.isArray(receivedAthletes) || !receivedAthletes.every(a => a.id && a.firstName && a.lastName)) {
        console.log(`bad upload array: ${groupNumber}`);
        return res.status(400).json({ error: "Invalid athlete data format" });
    }

    if (!athletes.hasOwnProperty(groupNumber)) {
        console.log(`bad upload index: ${groupNumber}`);
        return res.status(400).json({ error: "Invalid category" });
    }

    athletes[groupNumber] = receivedAthletes; // Overwrite existing data
    groups[groupNumber] = receivedGroupName; // store group name
    console.log(`groups: ${groups[groupNumber]}`);
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
    const ip = socket.handshake.headers["x-forwarded-for"] || socket.handshake.address;
    console.log(`New socket from IP: ${ip} (ID: ${socket.id})`);

    socket.on("start-timer", () => {
        // 5s countdown on first start
        if (!roundStarted) {
            console.log(`timer started`);
            roundStarted = true;
            io.emit("round-start", { roundStarted });
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
        // spoof roundstate + 1 for screens
        io.emit("ondeck-update", { roundName: roundName, ondeck: ondeck, roundState: (roundState + 1), groups: groups });
    });

    socket.on("round-name-update", (newRoundName) => {
        roundName = newRoundName;
        console.log(`round name update: ${roundName}`);
    });

    socket.on("group-name-update", (data) => {
        groupNumber = parseInt(data.groupDesig.split("-")[1], 10);
        groups[groupNumber] = data.newGroupName;
    });

    socket.on("group-category-change", (data) => {
        if (!data.groupName) { return };
        selectedCategory = data.selectedCategory;
        groupName = data.groupName;
        // TODO: figure out how to handle this with client-side protections against group wiping (or do away with categories)
        /*for (const category in groups) {
            if (groups[category] == groupName) {
                groups[category] = "";
                groups[selectedCategory] = groupName;
                ondeck[selectedCategory] = ondeck[category];
                ondeck[category] = "";
                athletes[selectedCategory] = athletes[category];
                athletes[category] = "";
                console.log(`category change: ${groupName} from ${category} to ${selectedCategory}`);
            }
        }
        io.emit("ondeck-update", { roundName: roundName, ondeck: ondeck, roundState: roundState, groups: groups });
        */
    });

    socket.on("reset-round", () => {
        console.log("round reset");
        roundState = 0;
        reset();
        // populate transit area boulder list
        for (const category in athletes) {
            if (groups[category].length > 0) {
                roundState = -1;
                advanceRoundState();
                return;
            }
        }
        io.emit("ondeck-update", {
            roundName: roundName,
            ondeck: ondeck,
            roundState: (roundState + 1),
            groups: groups,
            remainingTime: remainingTime,
            roundStarted: roundStarted
        });
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
        console.log(`
            round state change: athlete# [${data.athleteID}] boulder# [${data.boulder}] stage# [${data.stage}] time: [${data.time}]
            `);
        reset();
        roundState = 0;
        if (data.time) {
            remainingTime = data.time;
            startInStageTime = data.time;
            roundStarted = false;
            io.emit("round-start", { roundStarted });
            betweenRounds = false;
            io.emit("round-begin", { groupName: groups, roundState: roundState });
            timerUpdateEmit(remainingTime);
        }
        selectRoundState(data);
    });

});

function reset() {
    remainingTime = roundSettings.timerMode;
    betweenRounds = false;
    roundStarted = false;
    io.emit("round-start", { roundStarted });
    clearAllIntervals();
    timerUpdateEmit();
    io.emit("settings-update", { roundSettings });
    io.emit("round-end");
}

function clearData() {
    athletes = {
        1: [],
        2: [],
        3: []
    };
    groups = {
        1: "",
        2: "",
        3: "",
    };
    ondeck = {
        1: [],
        2: [],
        3: [],
    }
    io.emit("ondeck-update", { roundName: roundName, ondeck: ondeck, roundState: roundState, groups: groups });
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
            // emit ondeck-update here just to fake roundstate advance for clarity. TBD fix logic?
            io.emit("ondeck-update", { roundName: roundName, ondeck: ondeck, roundState: (roundState + 1), groups: groups });

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
            console.log("stage " + (roundState + 1) + " begin: " + groups[1] + "|" + groups[2] + "|" + groups[3]);
            if (startInStageTime != 0) {
                remainingTime = startInStageTime;
                timerUpdateEmit(remainingTime);
                startInStageTime = 0;
            } else {
                timerUpdateEmit(roundSettings.timerMode);
                remainingTime = roundSettings.timerMode;
                advanceRoundState();
            }
            runTimer();
        }
    }, 1000);
}

// moves climbers through boulders by 1 step
function advanceRoundState() {
    roundState++;
    saveStateToFile(roundName, roundState, remainingTime);
    ondeck = {
        1: [],
        2: [],
        3: [],
    }
    if (roundState >= 0) {
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
    }
    io.emit("ondeck-update", { roundName: roundName, ondeck: ondeck, roundState: roundState, groups: groups });
}

// advances roundstate to place a climber on a specific boulder
function selectRoundState(data) {
    let steps = 0;
    if (data.stage) {
        if (data.stage < 0) {
            console.log(`setting round stage to ${data.stage}`);
            roundState = data.stage - 2;
            advanceRoundState();
            return;
        }
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

    // check for timer set to begin directly in stage
    if (data.time) {
        steps++;
    };

    for (let step = 0; step < steps; step++) {
        advanceRoundState();
    }
    // emit ondeck-update here just to fake roundstate advance for clarity. TBD fix logic?
    if (!data.time) {
        io.emit("ondeck-update", { roundName: roundName, ondeck: ondeck, roundState: (roundState + 1), groups: groups });
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

