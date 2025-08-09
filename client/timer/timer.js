let socket; // Declare socket globally
const app = document.querySelector(".app");
const fontSize = document.querySelector(".timer").style.fontSize;
const fontWeight = document.querySelector(".timer").style.fontWeight;
let betweenRounds = false;


// Function to handle starting sockets
function startSockets(link) {
    socket = io(link, {
        reconnection: false, // Disable auto-reconnection
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

    socket.on("round-end", () => {
        betweenRounds = true;
    });

    socket.on("round-begin", () => {
        betweenRounds = false;
    });
}

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

// Get dynamic ngrok URL from server
fetch("/connections")
    .then((res) => res.json())
    .then(({ lanIPs, port, ngrokUrl }) => {
        const host = window.location.hostname;

        let link;
        if (["localhost", "127.0.0.1", "::1"].includes(host)) {
            link = `http://localhost:${port}`;
        } else if (lanIPs.includes(host)) {
            link = `http://${host}:${port}`;
        } else {
            link = ngrokUrl.replace("https://", "wss://");
        }

        console.log(`timer starting sockets at: ${link}`)
        startSockets(link); // Start the WebSocket connection
    });

let audioContext;

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

function updateTimer(data) {
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
}