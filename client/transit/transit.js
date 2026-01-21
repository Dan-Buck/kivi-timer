import { connectionService } from "../helpers/connectionService.js";

// for diffing state changes with new connection service management 
let previousState = {};

// update ondeck display
function updateOndeck(data) {

    const { ondeck, groups, roundState, roundName, roundSettings } = data;
    const leadMode = roundSettings.leadMode;

    let climbType = "Boulder";
    if (leadMode) climbType = "Route";
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
            entry.innerHTML = `<u>${climbType} ${boulder}</u><br>${athlete ? `${athlete.id}<br>${athlete.lastName}` : "-"}`;
            categoryContainer.appendChild(entry);
        });
    }
}

function updateTimer(data) {
    const { remainingTime, betweenRounds, roundStarted, roundSettings, remainingTurnoverTime } = data;
    const { leadMode, turnover } = roundSettings;
    const timerElement = document.querySelector(".timer");

    if (timerElement) {
        // handle lead mode on load/refresh
        if (leadMode && betweenRounds) {
            let seconds = Math.floor(turnover);
            if (remainingTurnoverTime != 0) {
                seconds = Math.floor(remainingTurnoverTime);
            }
            timerElement.textContent = `Start ${seconds.toString().padStart(2, "0")}`;
            return;
        }
        const minutes = Math.floor(remainingTime / 60);
        const seconds = Math.floor(remainingTime % 60);
        let firstDigits, secondDigits;
        if (betweenRounds && roundStarted) {
            timerElement.textContent = `Start ${seconds.toString().padStart(2, "0")}`;
        } else {
            // check for hour+ timer, convert to HH:MM
            if (minutes > 59) {
                firstDigits = Math.floor(minutes / 60);
                secondDigits = minutes % 60;
            } else {
                firstDigits = minutes;
                secondDigits = seconds;
            }
            timerElement.textContent = `${firstDigits.toString().padStart(2, "0")}:${secondDigits.toString().padStart(2, "0")}`;
        }
    }
}

function updateMessageDisplay(data) {
    const { betweenRounds, roundStarted, roundSettings } = data;
    const leadMode = roundSettings.leadMode;
    const messageContainer = document.querySelector(".message-container");
    //lead mode switches green/yellow messages 

    if (leadMode) {
        if (betweenRounds) {
            showMessage("Go to Transit Zone:");
            if (!messageContainer) return;
            messageContainer.style.background = "yellow";
            messageContainer.style.color = "black";
        } else {
            showMessage("Go to Climbing Zone:");
            if (!messageContainer) return;
            messageContainer.style.background = "green";
        }
        return;
    }

    if (betweenRounds || !roundStarted) {
        showMessage("Go to Climbing Zone:");
        if (!messageContainer) return;
        messageContainer.style.background = "green";
    } else {
        showMessage("Go to Transit Zone:");
        if (!messageContainer) return;
        messageContainer.style.background = "yellow";
        messageContainer.style.color = "black";
    }
}

// Function to show status messages
function showMessage(text) {
    const message = document.getElementById("message-content");
    if (!message) return;
    message.textContent = text;
    message.style.display = "block";
}

function handleStateUpdate(currentState) {
    // check for timer change 
    if (currentState.remainingTime !== previousState.remainingTime) {
        updateTimer(currentState);
    }

    // check for round settings, state, or ondeck changes
    if (currentState.roundState !== previousState.roundState ||
        JSON.stringify(currentState.groups) !== JSON.stringify(previousState.groups) ||
        JSON.stringify(currentState.ondeck) !== JSON.stringify(previousState.ondeck) ||
        currentState.roundName !== previousState.roundName
    ) {
        updateOndeck(currentState);
    }

    // check for round turnover
    if (currentState.betweenRounds !== previousState.betweenRounds) {
        updateMessageDisplay(currentState);
    }

    previousState = JSON.parse(JSON.stringify(currentState));
}

function main() {
    //subscribe
    connectionService.onUpdate(handleStateUpdate);

    // sets up connection, state fetching, events
    connectionService.init();
}

main();


