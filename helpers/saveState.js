const fs = require("fs");
const path = require("path");

function saveStateToFile(roundName, roundState, remainingTime) {
    const data = {
        roundName: roundName,
        remainingTime: remainingTime,
        roundState: roundState,
    };
    const filePath = path.join(__dirname, "..", "misc", "state-backup.json");
    try {
        fs.writeFileSync(filePath, JSON.stringify(data));
    } catch (error) {
        console.error("Failed to save state: ", err.message);
    }
}

function loadStateFromFile() { }

module.exports = {
    saveStateToFile,
    loadStateFromFile,
};