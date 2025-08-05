let socket; // Declare socket globally

// Function to handle starting sockets
function startSockets(link) {
    const app = document.querySelector(".app");
    const fontSize = document.querySelector(".timer").style.fontSize;
    const fontWeight = document.querySelector(".timer").style.fontWeight;
    let betweenRounds = false;


    socket = io(link, {
        reconnection: false, // Disable auto-reconnection
    });

    fetch("/round-status")
        .then((res) => res.json())
        .then((data) => {
            updateInfo(data);
            if (data.betweenRounds) {
                betweenRounds = true;
            } else {
                betweenRounds = false;
            }
        });

    // Handle timer update from server
    socket.on("timer-update", function (data) {
        const time = data.remainingTime;
        const timerElement = document.querySelector(".timer");
        if (timerElement) {
            const minutes = Math.floor(time / 60);
            const seconds = Math.floor(time % 60);
            if (betweenRounds) {
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
        if (time === 5) {
            playSound("/static/sounds/5beeps-boop.mp3");
        } else if (time === 60) {
            playSound("/static/sounds/beep.mp3");
        }
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
}

// Bind event listeners directly
document.querySelector(".timer-overlay").addEventListener("click", () => {
    document.getElementById("auth-modal").style.display = "block";
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

// Get dynamic ngrok URL from server
fetch("/connections")
    .then((response) => response.json())
    .then((data) => {
        const { ngrokUrl, port } = data;
        let link;
        const isLocalhost = window.location.hostname === "localhost" ||
            window.location.hostname === "127.0.0.1" ||
            window.location.hostname === "::1";

        if (!ngrokUrl || isLocalhost) {
            link = `http://localhost:${port}`;
        } else {
            link = ngrokUrl.replace("https://", "wss://"); // Ensure WebSocket uses wss://
        }
        console.log(`timer starting sockets at: ${link}`)
        startSockets(link); // Start the WebSocket connection
    });

let audioContext;

function updateInfo(data) {
    const groups = data.groups;
    const roundState = data.roundState;
    const roundName = data.roundName;

    const stageDisplay = document.querySelector(".stage-display");
    const groupsDisplay = document.querySelector(".groups-display")
    stageDisplay.textContent = `Stage # ${roundState}`;

    let groupList = [];
    for (const category in groups) {
        if (groups[category].length === 0) continue;
        groupList.push(groups[category]);
    }

    groupsDisplay.textContent = `${groupList.join(" & ")}`
}

function playSound(path) {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    if (audioContext.state === "suspended") {
        audioContext.resume().then(() => {
            console.log("AudioContext resumed!");
            playAudioBuffer(path);
        });
    } else {
        playAudioBuffer(path);
    }
}

function playAudioBuffer(path) {
    fetch(path)
        .then(response => response.arrayBuffer())
        .then(data => audioContext.decodeAudioData(data))
        .then(buffer => {
            const source = audioContext.createBufferSource();
            source.buffer = buffer;
            source.connect(audioContext.destination);
            source.start(0);
        })
        .catch(err => console.warn("Error playing sound:", err));
}
