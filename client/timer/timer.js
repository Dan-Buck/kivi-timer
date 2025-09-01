import { playSound } from "../helpers/audio.js";
import { getSocketLink } from "../helpers/connections.js";


let socket; // Declare socket globally
const app = document.querySelector(".app");
const fontSize = document.querySelector(".timer").style.fontSize;
const fontWeight = document.querySelector(".timer").style.fontWeight;
let betweenRounds = false;
let roundStarted = false;

// Get dynamic ngrok URL and start sockets and add events
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

    socket.on("play-sound", (data) => {
        playSound(data.path);
    });
}

function addEventListeners() {
    // Bind event listeners directly
    document.querySelector(".timer-overlay").addEventListener("click", () => {
        document.getElementById("auth-modal").style.display = "block";
    });

    document.querySelector(".close").addEventListener("click", () => {
        document.getElementById("auth-modal").style.display = "none";
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

    // Handle password submission
    document.getElementById("submit-password").addEventListener("click", () => {
        const password = document.getElementById("password-input").value;

        fetch("/control", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password }),
        })
            .then(response => {
                if (response.ok) {
                    window.location.href = "/control"; // Redirect to control page
                } else {
                    document.getElementById("error-message").textContent = "Invalid password!";
                }
            });
    });
}

function updateTimer(data) {
    const time = data.remainingTime;
    const timerElement = document.querySelector(".timer");
    if (timerElement) {
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        if (betweenRounds && roundStarted) {
            timerElement.textContent = `Start ${seconds.toString().padStart(2, "0")}`;
            timerElement.style.fontSize = "50vh";
            timerElement.style.color = "gray";
            timerElement.style.fontWeight = 600;

        } else {
            timerElement.textContent = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
            timerElement.style.fontSize = fontSize;
            timerElement.style.color = "black";
            timerElement.style.fontWeight = fontWeight;

        }
    }
}