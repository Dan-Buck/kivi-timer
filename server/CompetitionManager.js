class CompetitionManager {
    constructor(io, config, callbacks) {
        this.io = io;
        this.roundSettings = { ...config.roundSettings };
        this.soundMap = config.soundMap;
        this.callbacks = callbacks;

        // timer management vars
        this.timerInterval = null;
        this.turnoverInterval = null;
        this.betweenRounds = true;
        this.roundStarted = false;
        this.remainingTime = 0;
        this.remainingTurnoverTime = 0;
        this.pauseFlag = false;
        this.roundState = 0;
        this.roundName = "";
        this.selectRoundFlag = false;
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
        this.remainingTime = 0;
        this.remainingTurnoverTime = 0;
        if (this.roundSettings.leadMode) {
            this.io.emit("turnover-begin");
            this.remainingTurnoverTime = this.roundSettings.turnover;
            this._timerUpdateEmit(this.roundSettings.turnover);
        } else {
            this.remainingTime = this.roundSettings.timerMode;
            this._timerUpdateEmit(this.remainingTime);
        }

        this.betweenRounds = true;
        this.roundStarted = false;
        this.nextClimberFlag = false;
        this.selectRoundFlag = false;
        this.pauseFlag = false;
        this.io.emit("round-start", { roundStarted: this.roundStarted });
        this._clearAllIntervals();
        this.io.emit("settings-update", { roundSettings: this.roundSettings });
        this.io.emit("turnover-begin");
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
                this.io.emit("turnover-begin");

                // for lead mode, advance roundstate, jump back to turnover and pause 
                if (this.roundSettings.leadMode) {
                    this._advanceRoundState();
                    this.io.emit("ondeck-update", { roundName: this.roundName, ondeck: this.ondeck, roundState: this.roundState, groups: this.groups });
                    this._timerUpdateEmit(this.roundSettings.turnover);
                    this._clearAllIntervals();
                    return;
                }

                // no entering turnover for boulder finals mode, just advance round and pause
                if (this.roundSettings.finalsMode) {
                    this._clearAllIntervals();
                    this.betweenRounds = false;
                    this.io.emit("stage-begin", { groupName: this.groups, roundState: this.roundState });
                    console.log("stage " + (this.roundState + 1) + " begin: " + this.groups[1] + "|" + this.groups[2] + "|" + this.groups[3]);
                    this.remainingTime = this.roundSettings.timerMode;
                    this._timerUpdateEmit(this.remainingTime);
                    this._advanceRoundState();
                    this.io.emit("ondeck-update", { roundName: this.roundName, ondeck: this.ondeck, roundState: this.roundState, groups: this.groups });
                } else {
                    this.remainingTurnoverTime = this.roundSettings.turnover;
                    this._timerUpdateEmit(this.remainingTurnoverTime);
                    this._runTurnoverTimer();
                    // emit ondeck-update here for clients to do their own roundState +1 spoofing
                    this.io.emit("ondeck-update", { betweenRounds: this.betweenRounds, roundName: this.roundName, ondeck: this.ondeck, roundState: (this.roundState), groups: this.groups });
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
                this.io.emit("stage-begin", { groupName: this.groups, roundState: this.roundState });
                console.log("stage " + (this.roundState + 1) + " begin: " + this.groups[1] + "|" + this.groups[2] + "|" + this.groups[3]);

                this.remainingTime = this.roundSettings.timerMode;
                this._timerUpdateEmit(this.remainingTime);
                // lead mode will advance roundstate on stage end
                if (!this.roundSettings.leadMode) {
                    this._advanceRoundState();
                }
                this.io.emit("ondeck-update", { roundName: this.roundName, ondeck: this.ondeck, roundState: this.roundState, groups: this.groups });

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

        console.log(`advancing ${steps} steps`);

        for (let step = 0; step < steps; step++) {
            this._advanceRoundState();
        }
        // emit ondeck-update here just to fake roundstate advance for clarity. TBD fix logic? //
        if (!data.time) {
            this.selectRoundFlag = true;
            this.io.emit("ondeck-update", { roundName: this.roundName, ondeck: this.ondeck, roundState: (this.roundState), groups: this.groups, selectRoundFlag: this.selectRoundFlag });
        } else {
            this.io.emit("ondeck-update", { roundName: this.roundName, ondeck: this.ondeck, roundState: this.roundState, groups: this.groups });
        }
    }

    _timerUpdateEmit(time) {
        if (!time) {
            this.io.emit("timer-update", { remainingTime: this.remainingTime, remainingTurnoverTime: this.remainingTurnoverTime });
            return
        }

        this.io.emit("timer-update", { remainingTime: time, remainingTurnoverTime: this.remainingTurnoverTime });

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

    _updateTimerSettings(newSettings) {
        const { leadMode: oldLeadMode, turnover: oldTurnover, timerMode: oldTimerMode } = this.roundSettings;
        const { leadMode: newLeadMode, turnover: newTurnover, timerMode: newTimerMode, } = newSettings;
        // on timerMode change also emit an update to timer display elements
        if (newTimerMode && oldTimerMode !== newTimerMode && !oldLeadMode) {
            this.remainingTime = newTimerMode;
            this._timerUpdateEmit(this.remainingTime);
        }
        // on activating lead mode, emit turnover instead to timer displays
        if (newLeadMode && !oldLeadMode) {
            this.remainingTurnoverTime = oldTurnover;
            this.io.emit("turnover-begin");
            this.io.emit("settings-update", { leadMode: newLeadMode });
            this._timerUpdateEmit(oldTurnover);
        } else if (newLeadMode === false && oldLeadMode) {
            this.io.emit("stage-begin");
            this._timerUpdateEmit(this.roundSettings.timerMode);
        }
        // changing turnover with leadmode on
        if (oldLeadMode && newTurnover && newTurnover != oldTurnover) {
            this.remainingTurnoverTime = newTurnover;
            this._timerUpdateEmit(newTurnover);
        }
    }

    _stopSound() {
        this.io.emit("stop-sound");
        this.callbacks.onPlaySound("MUTE");
    }

    // -- public methods -- 
    startTimer() {
        // check timer isn't running
        if (this.timerInterval || this.turnoverInterval) {
            return console.log("timer already running");
        }

        // check if resuming a pause
        if (this.pauseFlag) {
            this.pauseFlag = false;
            if (this.betweenRounds && (!this.roundSettings.finalsMode || this.roundSettings.leadMode)) {
                console.log("resuming turnover timer");
                return this._runTurnoverTimer();
            } else {
                console.log("resuming timer");
                this.callbacks.onPlaySound(this.soundMap['boop']);
                return this._runTimer();
            }
        }

        // if round hasn't started, handle setup
        if ((!this.roundStarted && this.roundState === 0) || this.selectRoundFlag) {
            console.log(`round started`);
            this.roundStarted = true;
            this.io.emit("round-start", { roundStarted: this.roundStarted });

            // go to 5s countdown on first start if not in finals mode
            if (!this.roundSettings.finalsMode && !this.selectRoundFlag) {
                this.betweenRounds = true;
                this.io.emit("turnover-begin");
                this.remainingTurnoverTime = 6;
                return this._runTurnoverTimer();
            } else {
                this.betweenRounds = false;
                this.selectRoundFlag = false;
            }

            // handle finals mode startup
            this._advanceRoundState();
            this.io.emit("ondeck-update", { roundName: this.roundName, ondeck: this.ondeck, roundState: this.roundState, groups: this.groups, selectRoundFlag: this.selectRoundFlag });
            this.io.emit("stage-begin");

            // for now, lead mode also uses finals mode
            if (this.roundSettings.leadMode) {
                console.log("starting timer");
                this.callbacks.onPlaySound(this.soundMap['boop']);
                this.io.emit("turnover-begin");
                this.betweenRounds = true;
                return this._runTurnoverTimer();
            }
        }

        console.log("starting timer");
        // play boop on stage start for finals mode
        this.callbacks.onPlaySound(this.soundMap['boop']);

        // when starting a normal lead mode round
        if (this.roundSettings.leadMode) {
            console.log("normal lead stage begun");
            return this._runTurnoverTimer();
        }

        // if "Next Climber" button was used, handle round turnover stuff
        if (this.roundSettings.finalsMode && this.nextClimberFlag) {
            this.nextClimberFlag = false;
            this.betweenRounds = false;
            this.io.emit("stage-begin");
            this.io.emit("ondeck-update", { roundName: this.roundName, ondeck: this.ondeck, roundState: this.roundState, groups: this.groups });
        }

        this._runTimer();

    }

    pauseTimer() {
        console.log("timer paused");
        this._clearAllIntervals();
        this.pauseFlag = true;
        this._stopSound();
    }

    zeroTimer() {
        console.log("timer zero-ed");
        this._stopSound();
        this._clearAllIntervals();
        this.pauseFlag = true;
        if (this.betweenRounds) {
            this.remainingTurnoverTime = this.roundSettings.turnover;
            this._timerUpdateEmit(this.remainingTurnoverTime);
        } else {
            this.remainingTime = this.roundSettings.timerMode;
            this._timerUpdateEmit(this.remainingTime);
        }

    }

    nextClimber() {
        console.log("next climber: timer paused, round advanced");
        this._stopSound();
        this._reset();
        this.roundStarted = true;
        this.io.emit("turnover-begin");

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
        if (this.roundSettings.leadMode) {
            this._timerUpdateEmit(this.roundSettings.turnover);
        } else {
            this.io.emit("stage-begin");
        }
    }

    // for lead mode:  end obs, begin stage
    beginClimbing() {
        // make sure climbing hasn't already begun
        if (this.betweenRounds == false) return;
        this._stopSound();
        this.callbacks.onPlaySound(this.soundMap['boop']);
        this._clearAllIntervals();
        this.remainingTurnoverTime = this.roundSettings.turnover;
        this.betweenRounds = false;
        this.io.emit("stage-begin", { groupName: this.groups, roundState: this.roundState });
        console.log("stage " + (this.roundState + 1) + " begin: " + this.groups[1] + "|" + this.groups[2] + "|" + this.groups[3]);

        this.remainingTime = this.roundSettings.timerMode + 1;
        this._runTimer();
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
        this._stopSound();
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
        if (this.roundSettings.leadMode) {
            this._timerUpdateEmit(this.roundSettings.turnover);
        } else {
            this.io.emit("stage-begin");
        }
    }

    changeRoundState(data) {
        console.log(`
                round state change: athlete# [${data.athleteID}] boulder# [${data.boulder}] stage# [${data.stage}] time: [${data.time}]
                `);
        this._reset();
        this.roundState = 0;
        if (data.time) {
            this.remainingTime = data.time;
            this.roundStarted = true;
            this.io.emit("round-start", { roundStarted: this.roundStarted });
            this.betweenRounds = false;
            this.io.emit("stage-begin", { groupName: this.groups, roundState: this.roundState });
            this._timerUpdateEmit(this.remainingTime);
        }
        this._selectRoundState(data);
    }

    updateSettings(newSettings) {
        // check for timer, turnover updates to send to displays
        this._updateTimerSettings(newSettings);

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
            remainingTurnoverTime: this.remainingTurnoverTime,
            roundStarted: this.roundStarted,
            nextClimberFlag: this.nextClimberFlag,
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
