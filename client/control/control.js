import { getSocketLink } from "../helpers/connections.js";
import { csvToJson, csvError } from "../helpers/utils.js";

let socket;
let betweenRounds = false;
let roundStarted = false;

// Get dynamic ngrok URL from server before attaching event listeners
getSocketLink().then(link => {
    console.log(`starting sockets at: ${link}`)
    startSockets(link).then(addEventListeners);
});

// WebSocket setup function (returns a Promise)
function startSockets(link) {
    return new Promise((resolve) => {
        socket = io(link, {
            reconnection: true,         // enable auto reconnect
            reconnectionAttempts: Infinity, // retry forever
            reconnectionDelay: 1000,    // start at 1s
            reconnectionDelayMax: 5000, // cap at 5s
        });

        //check for existing server info and update page
        fetch("/round-status")
            .then((res) => res.json())
            .then((data) => {
                updateTimer(data);
                updateInfo(data);
                if (data.betweenRounds) {
                    betweenRounds = true;
                } else {
                    betweenRounds = false;
                }
            });

        socket.on("connect", () => {
            console.log("Socket connected.");
            resolve(); // Ensure event listeners attach after socket is ready
        });

        // Handle timer update
        socket.on("timer-update", (data) => {
            updateTimer(data);
        });

        socket.on("round-start", (data) => {
            roundStarted = data.roundStarted;
        });

        socket.on("round-begin", () => {
            betweenRounds = false;
        });

        socket.on("round-end", () => {
            betweenRounds = true;
        });

        socket.on("ondeck-update", (data) => {
            const roundState = data.roundState;
            const stageDisplay = document.querySelector(".stage-display");
            stageDisplay.textContent = `#${roundState}`;
        });
    });
}

function addEventListeners() {
    document.getElementById("start-timer").addEventListener("click", () => {
        socket.emit("start-timer");
    });

    document.getElementById("pause-timer").addEventListener("click", () => {
        socket.emit("pause-timer");
    });

    document.getElementById("zero-timer").addEventListener("click", () => {
        socket.emit("zero-timer");
    });

    document.getElementById("next-climber").addEventListener("click", () => {
        socket.emit("next-climber");
    });

    // Handle round name form submission
    document.getElementById("round-name-form").addEventListener("submit", (event) => {
        event.preventDefault();
        const roundName = document.getElementById("round-name").value;
        socket.emit("round-name-update", roundName);
        alert(`Round name update: ${roundName}`);
    });

    document.getElementById("timer-select").addEventListener("change", (event) => {
        const selectedValue = event.target.value;
        const customTimeInput = document.getElementById("custom-time");

        if (selectedValue === "custom") {
            customTimeInput.style.display = "inline-block";
            customTimeInput.value = ""; // Clear previous input
            customTimeInput.focus();
        } else {
            customTimeInput.style.display = "none";
            socket.emit("change-timer-mode", parseInt(selectedValue, 10));
        }
    });

    document.getElementById("custom-time").addEventListener("input", (event) => {
        const customValue = parseInt(event.target.value, 10);
        if (!isNaN(customValue) && customValue > 0) {
            socket.emit("change-timer-mode", customValue);
        }
    });

    document.getElementById("boulder-select").addEventListener("change", (event) => {
        const selectedValue = event.target.value;
        const customBoulderInput = document.getElementById("custom-boulders");

        if (selectedValue === "custom") {
            customBoulderInput.style.display = "inline-block";
            customBoulderInput.value = ""; // Clear previous input
            customBoulderInput.focus();
        } else {
            customBoulderInput.style.display = "none";
            socket.emit("change-boulder-number", parseInt(selectedValue, 10));
        }
    });

    document.getElementById("custom-boulders").addEventListener("input", (event) => {
        const customValue = parseInt(event.target.value, 10);
        if (!isNaN(customValue) && customValue > 0) {
            socket.emit("change-boulder-number", customValue);
        }
    });

    document.getElementById("zone-select").addEventListener("change", (event) => {
        const selectedValue = event.target.value;
        socket.emit("change-zone-number", parseInt(selectedValue, 10));
    });

    document.getElementById("finals-mode-select").addEventListener("change", (event) => {
        const selectedValue = event.target.value;
        // show "Next Climber button"
        if (selectedValue == "false") {
            document.getElementById("next-climber").style.display = "none";
        } else {
            document.getElementById("next-climber").style.display = "block";
        }
        socket.emit("change-finals-mode", selectedValue);
    });

    document.getElementById("add-groups").addEventListener("click", (event) => {
        event.target.style.display = "none";
        document.querySelector(".uploads-container").style.display = "flex";
        document.getElementById("upload-delete").style.display = "block";
    });

    document.querySelectorAll(".upload-group").forEach((group, index) => {
        const fileInput = group.querySelector("input[type='file']");
        const categorySelect = group.querySelector("select");
        const uploadBtn = group.querySelector(".upload-button");
        const groupName = group.querySelector("input[type='text']");
        const groupDesig = group.id;

        groupName.addEventListener("input", (event) => {
            const newGroupName = event.target.value;
            socket.emit("group-name-update", { newGroupName: newGroupName, groupDesig });
        });

        categorySelect.addEventListener("change", (event => {
            const selectedValue = event.target.value;
            socket.emit("group-category-change", { groupName: groupName.value, selectedCategory: selectedValue });
        }))

        uploadBtn.addEventListener("click", () => {
            if (fileInput.files.length === 0) {
                alert("Please select a CSV file.");
                return;
            }
            if (!groupName.value.trim || groupName.value === "") {
                alert("Please enter a group name");
                return;
            }

            const file = fileInput.files[0];
            const reader = new FileReader();

            reader.onload = function (event) {
                const csvData = event.target.result;
                let parsedData
                try {
                    parsedData = csvToJson(csvData);
                } catch (err) {
                    csvError(err)
                }
                const selectedCategory = categorySelect.value;
                const groupNameText = groupName.value;

                fetch("/athletes", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        category: selectedCategory,
                        athletes: parsedData,
                        groupName: groupNameText,
                        groupNumber: groupDesig
                    })
                })
                    .then(response => {
                        if (!response.ok) {
                            alert(`Upload not successful, please try again.`);
                        } else {
                            alert("Upload successful!");
                        }
                    })
                    .catch(error => {
                        console.error("Error sending athlete data:", error);
                        alert("Upload not successful, please try again.");
                    });
            };

            reader.readAsText(file);
        });
    });

    document.getElementById("upload-delete").addEventListener("click", () => {
        const isConfirmed = window.confirm("Are you sure you want to clear athlete data?");
        if (isConfirmed) {
            fetch("/athletes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    delete: "yes",
                })
            })
                .then(response => response.json())
                .then(data => {
                    alert("Athlete data cleared!");
                    document.querySelectorAll("input[type='file']").forEach((input) => {
                        input.value = "";
                    })
                    document.querySelectorAll("input[class='group-names']").forEach((input) => {
                        input.value = "";
                    })
                })
                .catch(error => {
                    console.error("Error deleting athlete data:", error);
                    alert("Delete not successful, please try again.");
                });
            document.querySelector(".uploads-container").style.display = "none";
            document.getElementById("add-groups").style.display = "block";
            document.getElementById("upload-delete").style.display = "none";
        } else {
            console.log("Data clear canceled.");
        }
    });

    // Modal elements
    const modal = document.getElementById("round-state-modal");
    const openModalBtn = document.getElementById("open-modal-btn");
    const closeModalBtn = document.querySelector(".close");
    const roundStateForm = document.getElementById("round-state-form");

    // Open modal when button is clicked, wipe existing values
    openModalBtn.addEventListener("click", () => {
        modal.querySelectorAll("input").forEach((input, index) => {
            input.value = null;
        });
        modal.style.display = "flex";
    });

    // Close modal when "X" is clicked
    closeModalBtn.addEventListener("click", () => {
        modal.style.display = "none";
    });

    // Close modal if user clicks outside modal
    window.addEventListener("click", (event) => {
        if (event.target === modal) {
            modal.style.display = "none";
        }
    });

    // Handle round state set form submission
    roundStateForm.addEventListener("submit", (event) => {
        event.preventDefault();

        const athleteID = parseInt(document.getElementById("athlete-id").value, 10);
        const boulder = parseInt(document.getElementById("boulder-number").value, 10);
        const stage = parseInt(document.getElementById("stage-number").value, 10);
        const time = parseInt(document.getElementById("timer-set").value, 10)

        if ((!isNaN(athleteID) && !isNaN(boulder)) || (!isNaN(stage))) {
            socket.emit("change-round-state", { athleteID, boulder, stage, time });
            modal.style.display = "none"; // Close modal after submission
        } else {
            alert("Please enter valid numbers.");
        }
    });

    document.getElementById("reset-round").addEventListener("click", () => {
        // Ask for user confirmation
        const isConfirmed = window.confirm("Are you sure you want to reset the round?");

        if (isConfirmed) {

            socket.emit("reset-round");
        } else {
            console.log("Reset round canceled.");
        }
    });

}

function updateInfo(data) {
    const roundState = data.roundState;
    const roundName = data.roundName;
    const groups = data.groups;
    const roundSettings = data.roundSettings;

    const stageDisplay = document.querySelector(".stage-display");
    stageDisplay.textContent = `#${roundState}`;

    const roundNameDisplay = document.getElementById("round-name")
    roundNameDisplay.value = roundName;

    const timerMode = document.getElementById("timer-select");
    const boulderNumbers = document.getElementById("boulder-select");
    const zoneNumbers = document.getElementById("zone-select");
    const finalsMode = document.getElementById("finals-mode-select");
    timerMode.value = roundSettings.timerMode;
    boulderNumbers.value = roundSettings.boulders;
    zoneNumbers.value = roundSettings.zones;
    finalsMode.value = roundSettings.finalsMode;

    // whether to show "Next Climber button"
    if (finalsMode.value == "false") {
        document.getElementById("next-climber").style.display = "none";
    } else {
        document.getElementById("next-climber").style.display = "block";
    }

    // populate group names, show uploads container, delete button
    document.querySelectorAll(".upload-group").forEach((group, index) => {
        const groupName = group.querySelector("input[type='text']");

        for (const key in groups) {
            if (groups[key]) {
                groupName.value = groups[key];
                groups[key] = "";
                document.querySelector(".uploads-container").style.display = "flex";
                document.getElementById("add-groups").style.display = "none";
                document.getElementById("upload-delete").style.display = "block";
            }
        }
    });

}

function updateTimer(data) {
    const time = data.remainingTime;
    const timerElement = document.querySelector(".timer");
    if (timerElement) {
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        if (betweenRounds && roundStarted) {
            timerElement.textContent = `~ ${seconds.toString().padStart(2, "0")}`;
        } else {
            timerElement.textContent = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
        }
    }
}

