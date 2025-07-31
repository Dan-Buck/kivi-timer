let socket;
// placeholder settings vars, currently unused
let roundSettings = {
    timerMode: 300,
    finalsMode: false,
    turnover: 15,
    boulders: 5,
    zones: 0,
}

// Function to start WebSocket connection
function startSockets(link) {
    let betweenRounds = false;
    socket = io(link, { reconnection: false });

    // Handle timer update
    socket.on("timer-update", (data) => {
        const time = data.remainingTime;
        const timerElement = document.querySelector(".timer");
        if (timerElement) {
            const minutes = Math.floor(time / 60);
            const seconds = Math.floor(time % 60);
            if (betweenRounds) {
                timerElement.textContent = `Start ${seconds.toString().padStart(2, "0")}`;
            } else {
                timerElement.textContent = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
            }
        }
    });

    // Handle ondeck update
    socket.on("ondeck-update", (data) => {
        updateOndeck(data);
    });

    // Handle round status messages
    socket.on("round-begin", () => {
        betweenRounds = false;
        showMessage("Go to Transit Zone:");
        const message = document.querySelector(".message-container");
        if (!message) return;
        message.style.background = "yellow";
        message.style.color = "black";
    });

    socket.on("round-end", () => {
        betweenRounds = true;
        showMessage("Go to Climbing Zone:");
        const message = document.querySelector(".message-container");
        if (!message) return;
        message.style.background = "green";
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
    console.log(`round name: ${roundName}`);

    const container = document.querySelector(".ondeck-container");
    for (const category in ondeck) {
        if (ondeck[category].length === 0) continue;

        let categoryLabel = document.querySelector(`.ondeck-label-${category}`);
        if (!categoryLabel) {
            categoryLabel = document.createElement("h2")
            categoryLabel.classList.add(`ondeck-label-${category}`)
            container.appendChild(categoryLabel);
        }
        categoryLabel.textContent = `${roundName} - ${groups[category]} - Stage # ${roundState}`;

        let categoryContainer = document.querySelector(`.ondeck-${category}`);
        if (!categoryContainer) {
            categoryContainer = document.createElement("div");
            categoryContainer.classList.add(`ondeck-${category}`, "ondeck-boulders");
            container.appendChild(categoryContainer);
        }

        categoryContainer.innerHTML = ""; // Clear existing content
        ondeck[category].forEach(({ boulder, athlete }) => {
            const entry = document.createElement("div");
            entry.classList.add("ondeck-entry");
            entry.innerHTML = `<u>Boulder ${boulder}</u><br>${athlete ? `${athlete.id}<br>${athlete.lastName}` : "-"}`;
            categoryContainer.appendChild(entry);
        });
    }
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

// Get dynamic ngrok URL and start sockets
fetch("/connections")
    .then((response) => response.json())
    .then((data) => {
        const isLocalhost = window.location.hostname === "localhost" ||
            window.location.hostname === "127.0.0.1" ||
            window.location.hostname === "::1";
        let link;
        if (!data.ngrokUrl || isLocalhost) {
            link = `http://localhost:${data.port}`;
        } else {
            link = data.ngrokUrl.replace("https://", "wss://");
        }
        console.log(`transit page starting sockets at: ${link}`);
        startSockets(link);
    });
