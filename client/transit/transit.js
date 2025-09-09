import { getSocketLink } from "../helpers/connections.js";

let socket;
// placeholder settings vars, currently unused
let roundSettings = {
    timerMode: 300,
    finalsMode: false,
    turnover: 15,
    boulders: 5,
    zones: 0,
}
let betweenRounds = false;
let roundStarted = false;


// Get dynamic ngrok URL and start sockets
getSocketLink().then(link => {
    console.log(`starting sockets at: ${link}`)
    startSockets(link);
});

// Function to start WebSocket connection
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
            if (data.betweenRounds || !data.roundStarted) {
                roundEnd();
            } else {
                roundBegin();
            }
            updateTimer(data);
            updateOndeck(data);
        });

    // Handle timer update
    socket.on("timer-update", (data) => {
        updateTimer(data)
    });

    socket.on("round-start", (data) => {
        roundStarted = data.roundStarted;
    });

    // Handle ondeck update
    socket.on("ondeck-update", (data) => {
        updateOndeck(data);
    });

    // Handle round status messages
    socket.on("round-begin", () => {
        roundBegin();
    });

    socket.on("round-end", () => {
        roundEnd();
    });

    // Handle settings update
    socket.on("settings-update", (data) => {
        updateBoulders(data);
    });
}

// update ondeck display
function updateOndeck(data) {
    const ondeck = data.ondeck;
    const groups = data.groups;
    const roundState = data.roundState;
    const roundName = data.roundName;

    const container = document.querySelector(".ondeck-container");
    for (const category in ondeck) {
        let categoryLabel = document.querySelector(`.ondeck-label-${category}`);
        let categoryContainer = document.querySelector(`.ondeck-${category}`);

        if (!categoryLabel) {
            categoryLabel = document.createElement("h2")
            categoryLabel.classList.add(`ondeck-label-${category}`)
            container.appendChild(categoryLabel);
        }
        if (!categoryContainer) {
            categoryContainer = document.createElement("div");
            categoryContainer.classList.add(`ondeck-${category}`, "ondeck-boulders");
            container.appendChild(categoryContainer);
        }
        // create all the category labels but hide emptys
        if (groups[category].length === 0) {
            categoryLabel.style.display = "none";
            if (categoryContainer) { categoryContainer.innerHTML = "" };
            continue
        };
        categoryLabel.style.display = "block";
        categoryLabel.textContent = `${groups[category]} - Stage # ${roundState}`;

        categoryContainer.innerHTML = ""; // Clear existing content

        ondeck[category].forEach(({ boulder, athlete }) => {
            const entry = document.createElement("div");
            entry.classList.add("ondeck-entry");
            entry.innerHTML = `<u>Boulder ${boulder}</u><br>${athlete ? `${athlete.id}<br>${athlete.lastName}` : "-"}`;
            categoryContainer.appendChild(entry);
        });
    }
}

function updateTimer(data) {
    const time = data.remainingTime;
    const timerElement = document.querySelector(".timer");
    if (timerElement) {
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        if (betweenRounds && roundStarted) {
            timerElement.textContent = `Start ${seconds.toString().padStart(2, "0")}`;
        } else {
            timerElement.textContent = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
        }
    }
}

function roundEnd() {
    betweenRounds = true;
    showMessage("Go to Climbing Zone:");
    const message = document.querySelector(".message-container");
    if (!message) return;
    message.style.background = "green";
}

function roundBegin() {
    betweenRounds = false;
    showMessage("Go to Transit Zone:");
    const message = document.querySelector(".message-container");
    if (!message) return;
    message.style.background = "yellow";
    message.style.color = "black";
}

// Function to show status messages
function showMessage(text) {
    const message = document.getElementById("message-content");
    if (!message) return;
    message.textContent = text;
    message.style.display = "block";

}

// Function to update the number of displayed boulders
function updateBoulders(count) {
    fetch("/round-settings")
        .then((res) => res.json())
        .then((settings) => {
            roundSettings.boulders = settings.boulders;
        });
}


