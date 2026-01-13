import { csvToJson, csvError } from "../helpers/utils.js";
import { connectionService } from "../helpers/connectionService.js";

let previousState = {};

function addEventListeners() {
    document.getElementById("start-timer").addEventListener("click", () => {
        connectionService.startTimer();
    });

    document.getElementById("pause-timer").addEventListener("click", () => {
        connectionService.pauseTimer();
    });

    document.getElementById("zero-timer").addEventListener("click", () => {
        connectionService.zeroTimer();
    });

    document.getElementById("next-climber").addEventListener("click", () => {
        connectionService.nextClimber();
    });

    document.getElementById("begin-climbing").addEventListener("click", () => {
        connectionService.beginClimbing();
    });

    // Handle round name form submission
    document.getElementById("round-name-form").addEventListener("submit", (event) => {
        event.preventDefault();
        const roundName = document.getElementById("round-name").value;
        connectionService.updateRoundName(roundName);
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
            customTimeInput.value = "";
            customTimeInput.style.display = "none";
            connectionService.changeTimerMode(parseInt(selectedValue, 10));
        }
    });

    document.getElementById("custom-time").addEventListener("input", (event) => {
        const customValue = parseInt(event.target.value, 10);
        if (!isNaN(customValue) && customValue > 0) {
            connectionService.changeTimerMode(customValue);
        }
    });

    document.getElementById("turnover-select").addEventListener("change", (event) => {
        const selectedValue = event.target.value;
        const customTimeInput = document.getElementById("custom-turnover");

        if (selectedValue === "custom") {
            customTimeInput.style.display = "inline-block";
            customTimeInput.value = ""; // Clear previous input
            customTimeInput.focus();
        } else {
            customTimeInput.value = "";
            customTimeInput.style.display = "none";
            connectionService.changeTurnoverTime(parseInt(selectedValue, 10));
        }
    });

    document.getElementById("custom-turnover").addEventListener("input", (event) => {
        const customValue = parseInt(event.target.value, 10);
        if (!isNaN(customValue) && customValue > 0) {
            connectionService.changeTurnoverTime(customValue);
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
            connectionService.changeBoulderNumber(parseInt(selectedValue, 10));
        }
    });

    document.getElementById("custom-boulders").addEventListener("input", (event) => {
        const customValue = parseInt(event.target.value, 10);
        if (!isNaN(customValue) && customValue > 0) {
            connectionService.changeBoulderNumber(customValue);
        }
    });

    document.getElementById("zone-select").addEventListener("change", (event) => {
        const selectedValue = event.target.value;
        connectionService.changeZoneNumber(parseInt(selectedValue, 10));
    });

    document.getElementById("finals-mode-select").addEventListener("change", (event) => {
        const selectedValue = event.target.value;
        // show "Next Climber button"
        if (selectedValue == "false") {
            document.getElementById("next-climber").style.display = "none";
            document.querySelector(".finals-climbers").style.display = "none";
        } else {
            document.getElementById("next-climber").style.display = "block";
            document.querySelector(".finals-climbers").style.display = "flex";
        }
        connectionService.changeFinalsMode(selectedValue);
    });

    document.getElementById("finals-climbers-select").addEventListener("change", (event) => {
        const selectedValue = event.target.value;
        connectionService.changeFinalsClimbers(selectedValue);
    });

    document.getElementById("lead-mode-select").addEventListener("change", (event) => {
        const selectedValue = event.target.value;
        const finalsModeSelect = document.getElementById('finals-mode-select');
        const beginClimbingBtn = document.getElementById('begin-climbing');

        // show "Begin Climbing" button, switch to Finals Mode (for now)
        if (selectedValue == "false") {
            beginClimbingBtn.style.display = "none";
        } else {
            beginClimbingBtn.style.display = "block";
            finalsModeSelect.value = "true";
            finalsModeSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
        connectionService.changeLeadMode(selectedValue);
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
            connectionService.updateGroupName({ newGroupName: newGroupName, groupDesig });
        });

        categorySelect.addEventListener("change", (event => {
            const selectedValue = event.target.value;
            connectionService.changeGroupCategory({ groupName: groupName.value, selectedCategory: selectedValue });
        }));

        uploadBtn.addEventListener("click", () => {
            if (fileInput.files.length === 0) {
                alert("Please select a CSV file.");
                return;
            }
            if (!groupName.value.trim() || groupName.value === "") {
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

    document.getElementById("toggle-controls").addEventListener("click", (event) => {
        const settings = document.querySelector(".controls-container");
        if (settings.style.display == "flex") {
            settings.style.display = "none";
            console.log("toggled controls");
        } else {
            settings.style.display = "flex";
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
            connectionService.changeRoundState({ athleteID, boulder, stage, time });
            modal.style.display = "none"; // Close modal after submission
        } else {
            alert("Please enter valid numbers.");
        }
    });

    document.getElementById("reset-round").addEventListener("click", () => {
        // Ask for user confirmation
        const isConfirmed = window.confirm("Are you sure you want to reset the round?");

        if (isConfirmed) {
            connectionService.resetRound();
        } else {
            console.log("Reset round canceled.");
        }
    });

}

function updateInfo(data) {
    const { roundName, roundSettings, groups, roundState, betweenRounds } = data;

    const stageDisplay = document.querySelector(".stage-display");
    stageDisplay.textContent = `#${(betweenRounds && !roundSettings.finalsMode) ? roundState + 1 : roundState}`;

    const roundNameDisplay = document.getElementById("round-name")
    roundNameDisplay.value = roundName;

    const timerMode = document.getElementById("timer-select");
    const turnover = document.getElementById("turnover-select");
    const boulderNumbers = document.getElementById("boulder-select");
    const zoneNumbers = document.getElementById("zone-select");
    const finalsMode = document.getElementById("finals-mode-select");
    const finalsClimbers = document.getElementById("finals-climbers-select");
    const leadMode = document.getElementById("lead-mode-select");
    boulderNumbers.value = roundSettings.boulders;
    zoneNumbers.value = roundSettings.zones;
    finalsMode.value = roundSettings.finalsMode;
    finalsClimbers.value = roundSettings.finalsClimbers;
    leadMode.value = roundSettings.leadMode;

    const timerOption = timerMode.querySelector(`option[value="${roundSettings.timerMode}"]`);
    if (timerOption) {
        timerMode.value = roundSettings.timerMode;
        const customTimeInput = document.getElementById("custom-time");
        customTimeInput.style.display = "none";
    }
    else {
        timerMode.value = "custom";
        const customTimeInput = document.getElementById("custom-time");
        customTimeInput.style.display = "inline-block";
        customTimeInput.value = roundSettings.timerMode;
    };

    const turnoverOption = turnover.querySelector(`option[value="${roundSettings.turnover}"]`);
    const customTurnover = document.getElementById("custom-turnover");
    if (turnoverOption) {
        turnover.value = roundSettings.turnover;
        customTurnover.style.display = "none";
    }
    else {
        turnover.value = "custom";
        customTurnover.style.display = "inline-block";
        customTurnover.value = roundSettings.turnover;
    };

    // whether to show "Next Climber button"
    if (finalsMode.value == "false") {
        document.getElementById("next-climber").style.display = "none";
        document.querySelector(".finals-climbers").style.display = "none";
    } else {
        document.getElementById("next-climber").style.display = "block";
        document.querySelector(".finals-climbers").style.display = "flex";
    }

    // show ? "Begin climbing"
    if (leadMode.value == "false") {
        document.getElementById("begin-climbing").style.display = "none";
    } else {
        document.getElementById("begin-climbing").style.display = "block";
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
                break;
            }
        }
    });

}

function updateTimer(data) {
    const { remainingTime, roundStarted, betweenRounds } = data;
    const timerElement = document.querySelector(".timer");
    if (timerElement) {
        const minutes = Math.floor(remainingTime / 60);
        const seconds = Math.floor(remainingTime % 60);
        if (betweenRounds && roundStarted) {
            timerElement.textContent = `~ ${seconds.toString().padStart(2, "0")}`;
        } else {
            timerElement.textContent = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
        }
    }
}

function handleStateUpdate(currentState) {
    // check for timer change 
    if (currentState.remainingTime !== previousState.remainingTime) {
        updateTimer(currentState);
    }

    // Create a copy of currentState and previousState without the 'remainingTime' key
    const { remainingTime, ...currentStateWithoutTime } = currentState;
    const { remainingTime: prevRemainingTime, ...previousStateWithoutTime } = previousState;
    // check for round settings, state changes
    if (JSON.stringify(currentStateWithoutTime) !== JSON.stringify(previousStateWithoutTime)) {
        updateInfo(currentState);
    }

    previousState = JSON.parse(JSON.stringify(currentState));
}

function main() {
    addEventListeners();
    //subscribe
    connectionService.onUpdate(handleStateUpdate);

    // sets up connection, state fetching, events
    connectionService.init();

}

main();


