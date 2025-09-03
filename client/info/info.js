import { playSound } from "../helpers/audio.js";
import { getSocketLink } from "../helpers/connections.js";
import { LAYOUT_PRESETS } from "../helpers/stylePresets.js";


let socket; // Declare socket globally
let betweenRounds = false;
let roundStarted = false;
let audioContext;

// Get dynamic ngrok URL and start sockets and add event listeners
getSocketLink().then(link => {
    console.log(`starting sockets at: ${link}`)
    startSockets(link);
    addEventListeners();
});

// Function to handle starting sockets
function startSockets(link) {
    socket = io(link, {
        reconnection: true,         // enable auto reconnect
        reconnectionAttempts: Infinity, // retry forever
        reconnectionDelay: 1000,    // start at 1s
        reconnectionDelayMax: 5000, // cap at 5s
    });

    fetch("/round-status")
        .then((res) => res.json())
        .then((data) => {
            if (data.betweenRounds) {
                betweenRounds = true;
            } else {
                betweenRounds = false;
            }
            updateTimer(data);
            updateInfo(data);
        });

    // Handle timer update from server
    socket.on("timer-update", function (data) {
        updateTimer(data);
    });

    socket.on("round-start", (data) => {
        roundStarted = data.roundStarted;
    });


    socket.on("round-end", () => {
        betweenRounds = true;
    });

    socket.on("round-begin", () => {
        betweenRounds = false;
    });

    socket.on("ondeck-update", (data) => {
        updateInfo(data);
    });

    socket.on("play-sound", (data) => {
        playSound(data.path);
    });
}

function addEventListeners() {

    // modal controls
    document.querySelector(".timer-overlay").addEventListener("click", () => {
        document.getElementById("focus-modal").style.display = "block";
    });
    document.querySelector(".closeLayoutModal").addEventListener("click", () => {
        document.getElementById("focus-modal").style.display = "none";
    });
    // Attach to all preset buttons
    document.querySelectorAll("#focus-modal [data-preset]").forEach(btn => {
        btn.addEventListener("click", () => {
            const preset = btn.getAttribute("data-preset");
            applyPreset(preset);
        });
    });

    document.getElementById("enableSound").addEventListener("click", () => {
        playSound("/static/sounds/beep.mp3");
    });

    document.addEventListener("click", () => {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        if (audioContext.state === "suspended") {
            audioContext.resume().then(() => {
                console.log("AudioContext resumed on user click!");
            });
        }
    }, { once: true }); // Run only once

    // close modal by clicking anywhere
    const modal = document.getElementById("focus-modal");
    modal.addEventListener("click", (e) => {
        if (e.target === modal) {
            modal.style.display = "none"; // closes modal
        }
    });

}

window.addEventListener("DOMContentLoaded", () => {
    const saved = localStorage.getItem("layoutPreset") || "focusTimer";
    applyPreset(saved);
});

function updateTimer(data) {
    const time = data.remainingTime;
    const timerElement = document.querySelector(".timer");
    if (timerElement) {
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        if (betweenRounds && roundStarted) {
            // smaller scale + lighter weight
            document.documentElement.style.setProperty("--timer-font-scale", "0.83");  // 5/6
            document.documentElement.style.setProperty("--timer-weight-scale", "0.85"); // ~6/7
            timerElement.textContent = `Start ${seconds.toString().padStart(2, "0")}`;
            timerElement.style.color = "gray";
        } else {
            // reset to defaults
            document.documentElement.style.setProperty("--timer-font-scale", "1");
            document.documentElement.style.setProperty("--timer-weight-scale", "1");
            timerElement.textContent = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
            timerElement.style.color = "black";

        }
    }
}

function updateInfo(data) {
    const groups = data.groups;
    const roundState = data.roundState;
    const roundName = data.roundName;

    const stageDisplay = document.querySelector(".stage-display");
    const groupsDisplay = document.querySelector(".groups-display");
    stageDisplay.textContent = `Stage # ${roundState}`;

    let groupList = [];
    for (const category in groups) {
        if (groups[category].length === 0) continue;
        groupList.push(groups[category]);
    }
    if (groupList.length > 0) {
        groupsDisplay.textContent = `${groupList.join(" & ")}`;
    } else {
        groupsDisplay.textContent = `${roundName}`;
    }
}

function applyPreset(name) {
    const preset = LAYOUT_PRESETS[name];
    if (!preset) return;

    for (const [varName, value] of Object.entries(preset)) {
        // convert camelCase (timerSize) → kebab-case (--timer-size)
        const cssVarName = "--" + varName.replace(/[A-Z]/g, m => "-" + m.toLowerCase());
        document.documentElement.style.setProperty(cssVarName, value);
    }

    // save to localStorage for recall on refresh
    localStorage.setItem("layoutPreset", name);
}

