import { getSocketLink } from "./connections.js";
import { playSound } from "./audio.js";

// Private vars for service
let socket;
let state = {
    remainingTime: 0,
    roundState: 0,
    betweenRounds: false,
    roundStarted: false,
    roundName: "",
    ondeck: {},
    groups: {},
    roundSettings: {},
}
let hasInitialized = false;

// Callbacks that our views (timer.js, info.js) can register
const onUpdateCallbacks = [];

async function initialize() {
    if (hasInitialized) return; //run once
    hasInitialized = true;

    const link = await getSocketLink();
    socket = io(link, {
        reconnection: true,         // enable auto reconnect
        reconnectionAttempts: Infinity, // retry forever
        reconnectionDelay: 1000,    // start at 1s
        reconnectionDelayMax: 5000, // cap at 5s
    });

    // Set up all the socket event listeners
    socket.on("connect", async () => {
        console.log("Socket connected via connection service.");
        // Fetch initial state ONLY after connecting
        try {
            const response = await fetch("/round-status");
            const initialState = await response.json();
            updateState(initialState);
        } catch (error) {
            console.error("Failed to fetch initial round status:", error);
        }
    });

    // Set up all socket event listeners
    socket.on("timer-update", function (data) {
        updateState(data);
    });

    socket.on("round-start", (data) => {
        updateState({ roundStarted: data.roundStarted });
    });

    socket.on("round-end", () => {
        updateState({ betweenRounds: true });
    });

    socket.on("round-begin", () => {
        updateState({ betweenRounds: false });
    });

    socket.on("play-sound", (data) => {
        playSound(data.path);
    });

    socket.on("ondeck-update", (data) => {
        updateState(data);
    });

    socket.on("settings-update", (data) => {
        updateState(data);
    })
}


// Update state and notify subscribers
function updateState(newData) {
    Object.assign(state, newData);

    for (const callback of onUpdateCallbacks) {
        callback({ ...state });
    }
}

// Public API for other modules
export const connectionService = {
    init: initialize,

    // allow other files to register functions on updates  
    onUpdate: (callback) => {
        if (hasInitialized) {
            callback({ ...state });
        }

        onUpdateCallbacks.push(callback);
    },

    // used less rather than onUpdate
    getState: () => {
        return { ...state };
    },

    // Emitter methods for control panel
    startTimer: () => socket.emit("start-timer"),
    pauseTimer: () => socket.emit("pause-timer"),
    zeroTimer: () => socket.emit("zero-timer"),
    nextClimber: () => socket.emit("next-climber"),
    updateRoundName: (name) => socket.emit("round-name-update", name),
    changeTimerMode: (mode) => socket.emit("change-timer-mode", mode),
    changeBoulderNumber: (boulders) => socket.emit("change-boulder-number", boulders),
    changeZoneNumber: (zones) => socket.emit("change-zone-number", zones),
    changeFinalsMode: (mode) => socket.emit("change-finals-mode", mode),
    changeFinalsClimbers: (climbers) => socket.emit("change-finals-climbers", climbers),
    updateGroupName: (data) => socket.emit("group-name-update", data),
    changeGroupCategory: (data) => socket.emit("group-category-change", data),
    resetRound: () => socket.emit("reset-round"),
    changeRoundState: (data) => socket.emit("change-round-state", data),
};