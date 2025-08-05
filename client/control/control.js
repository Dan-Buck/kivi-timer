let socket;
let betweenRounds = false;

// Get dynamic ngrok URL from server before attaching event listeners
fetch("/connections")
    .then((response) => response.json())
    .then((data) => {
        let link
        const isLocalhost = window.location.hostname === "localhost" ||
            window.location.hostname === "127.0.0.1" ||
            window.location.hostname === "::1";

        if (!data.ngrokUrl || isLocalhost) {
            link = `http://localhost:${data.port}`;
        } else {
            link = data.ngrokUrl.replace("https://", "wss://");
        }
        startSockets(link).then(() => {
            addEventListeners();
        })
    });

// WebSocket setup function (returns a Promise)
function startSockets(link) {
    return new Promise((resolve) => {
        socket = io(link, { reconnection: false }); // Assign to global variable

        socket.on("connect", () => {
            console.log("Socket connected.");
            resolve(); // Ensure event listeners attach after socket is ready
        });

        // Handle timer update
        socket.on("timer-update", (data) => {
            const time = data.remainingTime;
            const timerElement = document.querySelector(".timer");
            if (timerElement) {
                const minutes = Math.floor(time / 60);
                const seconds = Math.floor(time % 60);
                if (betweenRounds) {
                    timerElement.textContent = `<> ${seconds.toString().padStart(2, "0")}`;
                } else {
                    timerElement.textContent = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
                }
            }
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
    })

    document.getElementById("finals-mode-select").addEventListener("change", (event) => {
        const selectedValue = event.target.value;
        socket.emit("change-finals-mode", selectedValue);
    })

    document.querySelectorAll(".upload-group").forEach((group, index) => {
        const fileInput = group.querySelector("input[type='file']");
        const categorySelect = group.querySelector("select");
        const uploadBtn = group.querySelector(".upload-button");
        const groupName = group.querySelector("input[type='text']");

        groupName.addEventListener("input", (event) => {
            const newGroupName = event.target.value;
            socket.emit("group-name-update", { newGroupName: newGroupName, category: categorySelect.value });
        });

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
                        groupName: groupNameText
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
        } else {
            console.log("Data clear canceled.");
        }
    });

    // Modal elements
    const modal = document.getElementById("round-state-modal");
    const openModalBtn = document.getElementById("open-modal-btn");
    const closeModalBtn = document.querySelector(".close");
    const roundStateForm = document.getElementById("round-state-form");

    // Open modal when button is clicked
    openModalBtn.addEventListener("click", () => {
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

        if ((!isNaN(athleteID) && !isNaN(boulder)) || (!isNaN(stage))) {
            socket.emit("change-round-state", { athleteID, boulder, stage });
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

// takes user's athletes.csv and converts to json for POST to server
function csvToJson(csv) {
    const rows = csv
        .trim()
        .split("\n")
        .map(row => row.trim())
        .filter(row => row !== "") // remove blank lines
        .map(row => row.split(","));

    return rows.map(row => ({
        id: row[0].trim(),
        firstName: row[1].trim(),
        lastName: row[2].trim()
    }));
}

function csvError(err) {
    console.error("CSV parsing error:", err);
    alert("Please properly format the CSV file: \n"
        + "Athlete ID 1,First Name 1,Last Name 1\n"
        + "Athlete ID 2,First Name 2,Last Name 2\n"
        + "..."
    )
    return;
}
