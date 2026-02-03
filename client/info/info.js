import { connectionService } from "../helpers/connectionService.js";
import { LAYOUT_PRESETS } from "../helpers/stylePresets.js";


let previousState = {};

function addEventListeners() {
    // modal controls
    document.querySelector(".timer-overlay").addEventListener("click", () => {
        document.getElementById("focus-modal").style.display = "block";
    });
    document.querySelector(".closeLayoutModal").addEventListener("click", () => {
        document.getElementById("focus-modal").style.display = "none";
    });
    // Attach to all preset buttons
    document.querySelectorAll("#focus-modal [data-preset]").forEach(btn => {
        btn.addEventListener("click", () => {
            const preset = btn.getAttribute("data-preset");
            applyPreset(preset);
        });
    });

    // The connectionService handles the actual sound playback.
    document.addEventListener("click", () => {
        console.log("Page interaction detected, audio should be enabled.");
    }, { once: true });

    // close modal by clicking anywhere
    const modal = document.getElementById("focus-modal");
    modal.addEventListener("click", (e) => {
        if (e.target === modal) {
            modal.style.display = "none"; // closes modal
        }
    });

}

window.addEventListener("DOMContentLoaded", () => {
    const saved = localStorage.getItem("layoutPreset") || "focusTimer";
    applyPreset(saved);
});

function updateTimer(data) {
    const { remainingTime, betweenRounds, roundStarted, roundSettings, remainingTurnoverTime, nextClimberFlag } = data;
    const { leadMode, turnover } = roundSettings;

    const timerElement = document.querySelector(".timer");
    if (timerElement) {
        // handle lead mode on load/refresh
        if (leadMode && betweenRounds) {
            let seconds = Math.floor(turnover);
            if (remainingTurnoverTime != 0) {
                seconds = Math.floor(remainingTurnoverTime);
            }
            document.documentElement.style.setProperty("--timer-font-scale", "0.83");  // 5/6
            document.documentElement.style.setProperty("--timer-weight-scale", "0.85"); // ~6/7
            timerElement.textContent = `Start ${seconds.toString().padStart(2, "0")}`;
            timerElement.style.color = "gray";
            return;
        }

        const minutes = Math.floor(remainingTime / 60);
        const seconds = Math.floor(remainingTime % 60);
        let firstDigits, secondDigits;
        if (betweenRounds && roundStarted && !nextClimberFlag) {
            // smaller scale + lighter weight
            document.documentElement.style.setProperty("--timer-font-scale", "0.83");  // 5/6
            document.documentElement.style.setProperty("--timer-weight-scale", "0.85"); // ~6/7
            timerElement.textContent = `Start ${seconds.toString().padStart(2, "0")}`;
            timerElement.style.color = "gray";
        } else {
            // reset to defaults
            document.documentElement.style.setProperty("--timer-font-scale", "1");
            document.documentElement.style.setProperty("--timer-weight-scale", "1");
            // check for hour+ timer, convert to HH:MM
            if (minutes > 59) {
                firstDigits = Math.floor(minutes / 60);
                secondDigits = minutes % 60;
            } else {
                firstDigits = minutes;
                secondDigits = seconds;
            }
            timerElement.textContent = `${firstDigits.toString().padStart(2, "0")}:${secondDigits.toString().padStart(2, "0")}`;
            timerElement.style.color = "black";
        }
    }
}

function updateInfo(data) {
    const { groups, roundName, roundState, betweenRounds, roundSettings, selectRoundFlag } = data;
    const stageNumber = ((betweenRounds && !roundSettings.finalsMode) || selectRoundFlag) ? roundState + 1 : roundState;

    const stageDisplay = document.querySelector(".stage-display");
    const groupsDisplay = document.querySelector(".groups-display");
    stageDisplay.textContent = `Stage # ${stageNumber}`;

    let groupList = [];
    for (const category in groups) {
        if (groups[category].length === 0) continue;
        groupList.push(groups[category]);
    }
    if (groupList.length > 0) {
        groupsDisplay.textContent = `${groupList.join(" & ")}`;
    } else {
        groupsDisplay.textContent = `${roundName}`;
    }
}

function applyPreset(name) {
    const preset = LAYOUT_PRESETS[name];
    if (!preset) return;

    for (const [varName, value] of Object.entries(preset)) {
        // convert camelCase (timerSize) → kebab-case (--timer-size)
        const cssVarName = "--" + varName.replace(/[A-Z]/g, m => "-" + m.toLowerCase());
        document.documentElement.style.setProperty(cssVarName, value);
    }

    // save to localStorage for recall on refresh
    localStorage.setItem("layoutPreset", name);
}

function handleStateUpdate(currentState) {
    if (currentState.remainingTime !== previousState.remainingTime) {
        updateTimer(currentState);
    }

    if (currentState.roundState !== previousState.roundState ||
        currentState.roundName !== previousState.roundName ||
        JSON.stringify(currentState.groups) !== JSON.stringify(previousState.groups) ||
        currentState.betweenRounds !== previousState.betweenRounds
    ) {
        updateInfo(currentState);
    }

    previousState = JSON.parse(JSON.stringify(currentState));
}

function main() {
    addEventListeners();
    connectionService.onUpdate(handleStateUpdate);
    connectionService.init();
}

main();
