import { playSound } from "../helpers/audio.js";
import { connectionService } from "../helpers/connectionService.js";

const timerElement = document.querySelector(".timer");
const fontSize = timerElement.style.fontSize || getComputedStyle(timerElement).fontSize;
const fontWeight = timerElement.style.fontWeight || getComputedStyle(timerElement).fontWeight;

function addEventListeners() {
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
        console.log("Page interaction detected, audio should be enabled.");
    }, { once: true });

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
}

function updateTimer(data) {
    const { remainingTime, betweenRounds, roundStarted, roundSettings, remainingTurnoverTime, nextClimberFlag } = data;
    const { leadMode, turnover } = roundSettings;

    if (timerElement) {
        // handle lead mode on load/refresh
        if (leadMode && betweenRounds) {
            let seconds = Math.floor(turnover);
            if (remainingTurnoverTime != 0) {
                seconds = Math.floor(remainingTurnoverTime);
            }
            timerElement.textContent = `Start: ${seconds.toString().padStart(2, "0")}`;
            timerElement.style.fontSize = "50vh";
            timerElement.style.color = "gray";
            timerElement.style.fontWeight = 600;
            return;
        }

        const minutes = Math.floor(remainingTime / 60);
        const seconds = Math.floor(remainingTime % 60);
        let firstDigits, secondDigits;
        if (betweenRounds && roundStarted && !nextClimberFlag) {
            timerElement.textContent = `Start ${seconds.toString().padStart(2, "0")}`;
            timerElement.style.fontSize = "50vh";
            timerElement.style.color = "gray";
            timerElement.style.fontWeight = 600;

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
            timerElement.style.fontSize = fontSize;
            timerElement.style.color = "black";
            timerElement.style.fontWeight = fontWeight;

        }
    }
}

function main() {
    addEventListeners();

    //subscribe
    connectionService.onUpdate(updateTimer);

    // sets up connection, state fetching, events
    connectionService.init();
}

main();