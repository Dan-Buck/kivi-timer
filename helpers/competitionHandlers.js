const path = require("path");

function createCompetitionHandlers({
    io,
    baseDir,
    playSoundFile,
    stopSoundFile,
    fsp,
    saveStateToFile
}) {
    const handlePlaySound = (file) => {
        if (file === "MUTE") {
            stopSoundFile();
        } else {
            const localPath = path.join(baseDir, "client", file);
            playSoundFile(localPath);
            io.emit("play-sound", { path: file });
        }
    };

    const handleWriteStatus = (writeString, callback) => {
        const filePath = path.join(baseDir, "misc/timer.txt");
        fsp
            .writeFile(filePath, writeString, "utf-8")
            .then(() => callback(null))
            .catch(callback);
    };

    const handleSaveStateToFile = (roundName, roundState, remainingTime) => {
        saveStateToFile(roundName, roundState, remainingTime);
    };

    return {
        handlePlaySound,
        handleWriteStatus,
        handleSaveStateToFile
    };
}

module.exports = createCompetitionHandlers;
