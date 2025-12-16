class CompetitionManager {
    constructor(io, config, callbacks) {
        this.io = io;
        this.roundSettings = { ...config.roundSettings };
        this.soundMap = config.soundMap;
        this.callbacks = callbacks;

        // timer management vars
        this.timerInterval = null;
        this.turnoverInterval = null;
        this.betweenRounds = false;
        this.roundStarted = false;
        this.remainingTime = 0;
        this.remainingTurnoverTime = 0;
        this.roundState = 0;
        this.roundName = "";
        this.startInStageTime = 0;
        this.nextClimberFlag = false; // for finalsMode
        this.writeErrorFlag = false;

        // athlete list
        this.athletes = {
            1: [],
            2: [],
            3: [],
        }

        // group name tracker
        this.groups = {
            1: "",
            2: "",
            3: "",
        }

        // ondeck tracker
        this.ondeck = {
            1: [],
            2: [],
            3: [],
        }

        // queue with default settings
        this._reset();
    }

    // -- private methods --
    _reset() {
        this.remainingTime = this.roundSettings.timerMode;
        this.betweenRounds = false;
        this.roundStarted = false;
        this.nextClimberFlag = false;
        this.io.emit("round-start", { roundStarted: this.roundStarted });
        this._clearAllIntervals();
        this._timerUpdateEmit(this.remainingTime);
        this.io.emit("settings-update", { roundSettings: this.roundSettings });
        this.io.emit("round-end");
    }

    _clearData() {
        this.athletes = { 1: [], 2: [], 3: [] };
        this.groups = { 1: "", 2: "", 3: "" };
        this.ondeck = { 1: [], 2: [], 3: [] };
        this.io.emit("ondeck-update", { roundName: this.roundName, ondeck: this.ondeck, roundState: this.roundState, groups: this.groups });
    }

    _clearAllIntervals() {
        clearInterval(this.timerInterval);
        clearInterval(this.turnoverInterval);
        this.timerInterval = null;
        this.turnoverInterval = null;
    }

    _runTimer() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        this.timerInterval = setInterval(() => {
            if (this.remainingTime > 0) {
                this.remainingTime--;
                this._timerUpdateEmit(this.remainingTime);
            } else {
                // 2 min observation setting has no turnover time per request
                if (this.roundSettings.timerMode === 120) {
                    this.remainingTime = this.roundSettings.timerMode;
                    return // interval continues 
                }
                clearInterval(this.timerInterval);
                this.betweenRounds = true;
                this.io.emit("round-end");

                // no entering turnover for finals mode, just advance round and pause
                if (!this.roundSettings.finalsMode) {
                    this._timerUpdateEmit(this.roundSettings.turnover);
                    this._runTurnoverTimer();
                    // emit ondeck-update here for clients to do their own roundState +1 spoofing
                    this.io.emit("ondeck-update", { betweenRounds: this.betweenRounds, roundName: this.roundName, ondeck: this.ondeck, roundState: (this.roundState), groups: this.groups });
                } else {
                    this._clearAllIntervals();
                    this.betweenRounds = false;
                    this.io.emit("round-begin", { groupName: this.groups, roundState: this.roundState });
                    console.log("stage " + (this.roundState + 1) + " begin: " + this.groups[1] + "|" + this.groups[2] + "|" + this.groups[3]);
                    this.remainingTime = this.roundSettings.timerMode;
                    this._timerUpdateEmit(this.remainingTime);
                    this._advanceRoundState();
                    this.io.emit("ondeck-update", { roundName: this.roundName, ondeck: this.ondeck, roundState: this.roundState, groups: this.groups });
                }
            }
        }, 1000);
    }

    _runTurnoverTimer() {
        if (this.turnoverInterval) clearInterval(this.turnoverInterval);
        if (this.remainingTurnoverTime === 0) this.remainingTurnoverTime = this.roundSettings.turnover;

        this.turnoverInterval = setInterval(() => {
            if (this.remainingTurnoverTime > 0) {
                this.remainingTurnoverTime--;
                this._timerUpdateEmit(this.remainingTurnoverTime);
            } else {
                clearInterval(this.turnoverInterval)
                this.betweenRounds = false;
                this.io.emit("round-begin", { groupName: this.groups, roundState: this.roundState });
                console.log("stage " + (this.roundState + 1) + " begin: " + this.groups[1] + "|" + this.groups[2] + "|" + this.groups[3]);
                if (this.startInStageTime != 0) {
                    this.remainingTime = this.startInStageTime;
                    this._timerUpdateEmit(this.remainingTime);
                    this.startInStageTime = 0;
                } else {
                    this.remainingTime = this.roundSettings.timerMode;
                    this._timerUpdateEmit(this.remainingTime);
                    this._advanceRoundState();
                    this.io.emit("ondeck-update", { roundName: this.roundName, ondeck: this.ondeck, roundState: this.roundState, groups: this.groups });
                }
                this._runTimer();
            }
        }, 1000);
    }

    _advanceRoundState() {
        this.roundState++;
        this.callbacks.onSaveStateToFile(this.roundName, this.roundState, this.remainingTime);

        // reset ondeck buckets for each category
        this.ondeck = {};
        for (const cat in this.athletes) {
            this.ondeck[cat] = [];
        }

        if (this.roundState < 0) return;

        const totalBoulders = this.roundSettings.boulders;

        if (this.roundSettings.finalsMode) {
            // 1) largest field size across categories
            let maxFinalists = 0;
            for (const cat in this.athletes) {
                maxFinalists = Math.max(maxFinalists, this.athletes[cat].length);
            }
            if (maxFinalists === 0) return;

            // 2) spacing so peak overlap ≈ climbersOnWall
            const climbersOnWall = Math.min(
                Math.max(1, this.roundSettings.finalsClimbers || 1),
                totalBoulders
            );
            const offset = Math.max(1, Math.ceil(maxFinalists / climbersOnWall));

            // 3) per category, compute who is on each active boulder this round
            for (const cat in this.athletes) {
                const finalists = this.athletes[cat];
                const n = finalists.length;

                for (let boulder = 1; boulder <= totalBoulders; boulder++) {
                    const start = (boulder - 1) * offset;                // when this boulder starts
                    const endExclusive = start + maxFinalists;           // when it finishes

                    if (this.roundState >= start && this.roundState < endExclusive) {
                        const globalIndex = this.roundState - start;            // 0..maxFinalists-1
                        const athlete = (globalIndex < n) ? finalists[globalIndex] : null;
                        this.ondeck[cat].push({ boulder, athlete });
                    }
                }
            }

        } else {
            // Non-finals logic 
            for (const cat in this.athletes) {
                for (let boulder = 1; boulder <= totalBoulders; boulder++) {
                    const nextUp = this.roundState - 2 * (boulder - 1);
                    const arr = this.athletes[cat];
                    this.ondeck[cat].push({
                        boulder,
                        athlete: (nextUp >= 0 && nextUp < arr.length) ? arr[nextUp] : null
                    });
                }
            }
        }
    }

    _selectRoundState(data) {
        let steps = 0;
        if (data.stage) {
            if (data.stage < 0) {
                console.log(`setting round stage to ${data.stage}`);
                this.roundState = data.stage - 2;
                this._advanceRoundState();
                this.io.emit("ondeck-update", { roundName: this.roundName, ondeck: this.ondeck, roundState: this.roundState, groups: this.groups });
                return;
            }
            console.log(`advancing ${data.stage} steps`);
            steps = data.stage - 1;
        } else {
            const athleteID = String(data.athleteID);
            const boulder = data.boulder;
            let placeInOrder = -1
            let foundCategory;
            for (const category in this.athletes) {
                placeInOrder = this.athletes[category].findIndex(athlete => athlete.id === athleteID);
                if (placeInOrder !== -1) {
                    foundCategory = category
                    break;
                }
            }
            if (placeInOrder === -1 || !foundCategory) {
                console.log('could not place athlete, ID not found in list');
                return;
            }

            const multiplier = this.roundSettings.finalsMode ? this.athletes[foundCategory].length : 2;
            steps = placeInOrder + multiplier * (boulder - 1);
        }

        // check for timer set to begin directly in stage
        if (data.time) {
            steps++;
        };

        for (let step = 0; step < steps; step++) {
            this._advanceRoundState();
        }
        // emit ondeck-update here just to fake roundstate advance for clarity. TBD fix logic?
        if (!data.time) {
            this.io.emit("ondeck-update", { roundName: this.roundName, ondeck: this.ondeck, roundState: (this.roundState + 1), groups: this.groups });
        } else {
            this.io.emit("ondeck-update", { roundName: this.roundName, ondeck: this.ondeck, roundState: this.roundState, groups: this.groups });
        }
    }

    _timerUpdateEmit(time) {
        if (!time) {
            this.io.emit("timer-update", { remainingTime: this.remainingTime });
            return
        }

        this.io.emit("timer-update", { remainingTime: time });

        // play sound out of the server, and emit to clients at configured times
        const file = this.soundMap[time];
        if (file) {
            this.callbacks.onPlaySound(file);
        }


        // write time to timer.txt
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        const formattedTime = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
        let writeString;
        if (this.betweenRounds) {
            writeString = `transit${this.roundState + 1}/${formattedTime}`;
        } else {
            writeString = `stage${this.roundState}/${formattedTime}`
        }

        this.callbacks.onWriteStatus(writeString, (err) => {
            if (err && !this.writeErrorFlag) {
                console.error("Timer file write failed:", err.message);
                this.writeErrorFlag = true;
            } else if (!err) {
                this.writeErrorFlag = false; // Reset flag on successful write
            }
        });
    }

    // -- public methods -- 
    startTimer() {
        // 5s countdown on first start if not in finals mode
        if (!this.roundStarted) {
            console.log(`timer started`);
            this.roundStarted = true;
            this.io.emit("round-start", { roundStarted: this.roundStarted });
            if (!this.roundSettings.finalsMode) {
                this.betweenRounds = true;
                this.remainingTurnoverTime = 6;
                return this._runTurnoverTimer();
            }
            this._advanceRoundState();
            this.io.emit("ondeck-update", { roundName: this.roundName, ondeck: this.ondeck, roundState: this.roundState, groups: this.groups });
            this.io.emit("round-begin");
        }

        if (this.timerInterval || this.turnoverInterval) {
            return console.log("timer already running");
        }
        if (this.betweenRounds && !this.roundSettings.finalsMode) {
            console.log("resuming turnover timer");
            this._runTurnoverTimer();
        } else {
            console.log("resuming timer");
            // play boop on stage start 
            this.callbacks.onPlaySound(this.soundMap['boop']);
            if (this.roundSettings.finalsMode && this.nextClimberFlag) {
                this.nextClimberFlag = false;
                this.io.emit("round-begin");
                this.io.emit("ondeck-update", { roundName: this.roundName, ondeck: this.ondeck, roundState: this.roundState, groups: this.groups });
            }
            this._runTimer();
        }
    }

    pauseTimer() {
        console.log("timer paused");
        this._clearAllIntervals();
    }

    zeroTimer() {
        console.log("timer zero-ed");
        this._clearAllIntervals();
        this.remainingTime = this.roundSettings.timerMode;
        this._timerUpdateEmit(this.remainingTime);
    }

    nextClimber() {
        console.log("next climber: timer paused, round advanced");
        this._reset();
        this.roundStarted = true;
        this.io.emit("round-end");
        this.nextClimberFlag = true;
        this._advanceRoundState();
        // removed spoof, now send true state
        this.io.emit("ondeck-update", {
            roundName: this.roundName,
            ondeck: this.ondeck,
            roundState: (this.roundState),
            groups: this.groups,
            remainingTime: this.remainingTime,
            roundStarted: this.roundStarted
        });
    }

    updateRoundName(name) {
        this.roundName = name;
        console.log(`round name update: ${this.roundName}`);
    }

    updateGroupName(data) {
        const groupNumber = parseInt(data.groupDesig.split("-")[1], 10);
        this.groups[groupNumber] = data.newGroupName;
    }

    updateGroupCategory(data) {
        if (!data.groupName) { return };
        selectedCategory = data.selectedCategory;
        groupName = data.groupName;
        // TODO: figure out how to handle this with client-side protections against group wiping (or do away with categories)
        /*for (const category in groups) {
            if (groups[category] == groupName) {
                groups[category] = "";
                groups[selectedCategory] = groupName;
                ondeck[selectedCategory] = ondeck[category];
                ondeck[category] = "";
                athletes[selectedCategory] = athletes[category];
                athletes[category] = "";
                console.log(`category change: ${groupName} from ${category} to ${selectedCategory}`);
            }
        }
        io.emit("ondeck-update", { roundName: roundName, ondeck: ondeck, roundState: roundState, groups: groups });
        */
    }

    resetRound() {
        console.log("round reset");
        this.roundState = 0;
        this._reset();
        // populate transit area boulder list
        for (const category in this.athletes) {
            if (this.groups[category].length > 0) {
                this.roundState = -1;
                this._advanceRoundState();
                break;
            }
        }
        this.io.emit("ondeck-update", {
            roundName: this.roundName,
            ondeck: this.ondeck,
            roundState: (this.roundState),
            groups: this.groups,
            remainingTime: this.remainingTime,
            roundStarted: this.roundStarted
        });
    }

    changeRoundState(data) {
        console.log(`
                round state change: athlete# [${data.athleteID}] boulder# [${data.boulder}] stage# [${data.stage}] time: [${data.time}]
                `);
        this._reset();
        this.roundState = 0;
        if (data.time) {
            this.remainingTime = data.time;
            this.startInStageTime = data.time;
            this.roundStarted = false;
            this.io.emit("round-start", { roundSettings: this.roundStarted });
            this.betweenRounds = false;
            this.io.emit("round-begin", { groupName: this.groups, roundState: this.roundState });
            this._timerUpdateEmit(this.remainingTime);
        }
        this._selectRoundState(data);
    }

    updateSettings(newSettings) {
        // on timerMode change also emit an update to timer display elements
        if (newSettings.timerMode && this.roundSettings.timerMode !== newSettings.timerMode) {
            this.remainingTime = newSettings.timerMode;
            this._timerUpdateEmit(this.remainingTime);
        }
        Object.assign(this.roundSettings, newSettings);
        console.log(`settings updated: ${JSON.stringify(newSettings)}`);
        this.io.emit("settings-update", { roundSettings: this.roundSettings });
    }

    shutdown() {
        console.log("Clearing all competition intervals.");
        this._clearAllIntervals();
    }

    getFullState() {
        return {
            roundName: this.roundName,
            roundState: this.roundState,
            betweenRounds: this.betweenRounds,
            ondeck: this.ondeck,
            groups: this.groups,
            roundSettings: this.roundSettings,
            remainingTime: this.remainingTime,
            roundStarted: this.roundStarted,
        };
    }

    handleAthleteUpload(data) {
        if (data.delete === "yes") {
            // Clear the athletes/groups/undeck data
            this._clearData();
            console.log("athlete data cleared");
            return { message: "Athlete data cleared" };
        }

        if (this.roundStarted) {
            return { error: "Round started: first 'Reset Entire Round'" };
        }

        const { athletes: receivedAthletes, category: receivedCategory, groupName: receivedGroupName, groupNumber: groupDesig } = data; // Expecting { athletes: [...] }

        // Expecting "group-1"
        const groupNumber = parseInt(groupDesig.split("-")[1], 10);

        if (!Array.isArray(receivedAthletes) || !receivedAthletes.every(a => a.id && a.firstName && a.lastName)) {
            console.log(`bad upload array: ${groupNumber}`);
            return { error: "Invalid athlete data format" };
        }

        if (!this.athletes.hasOwnProperty(groupNumber)) {
            console.log(`bad upload index: ${groupNumber}`);
            return { error: "Invalid category" };
        }

        this.athletes[groupNumber] = receivedAthletes; // Overwrite existing data
        this.groups[groupNumber] = receivedGroupName; // store group name
        console.log(`groups: ${this.groups[groupNumber]}`);
        console.log("athlete list received: " + receivedGroupName);
        return { message: "Athlete data stored successfully" };
    }

    getAthletes() {
        return this.athletes;
    }

    getRoundSettings() {
        return this.roundSettings;
    }

}

module.exports = CompetitionManager;
