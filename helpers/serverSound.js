const player = require('play-sound')();
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const audioPlay = require('audio-play');
const audioLoader = require('audio-loader');


const playersByOS = {
    linux: ['mpg123', 'mpg321', 'mplayer', 'ffplay', 'vlc'],
    darwin: ['afplay', 'mplayer', 'ffplay', 'vlc'],
    win32: ['powershell', 'ffplay', 'vlc', 'wmplayer']
};

function detectAvailablePlayer() {
    const candidates = playersByOS[process.platform] || [];
    for (const cmd of candidates) {
        try {
            execSync((process.platform === 'win32' ? 'where ' : 'which ') + cmd, { stdio: 'ignore' });
            return cmd;
        } catch {
            // ignore
        }
    }
    return null;
}

const playerCmd = detectAvailablePlayer();

function playSoundFile(file) {
    if (!playerCmd) {
        console.error('No audio player found on this system, switching to Node-based');
        const absPath = path.resolve(file);
        return fs.promises.readFile(absPath)
            .then(buffer => audioLoader(buffer))
            .then(audioBuffer => audioPlay(audioBuffer))
            .catch(err => {
                console.error(`Node-based playback failed: ${err.message}`);
            });
    }
    player.play(file, { player: playerCmd }, err => {
        if (err) console.error(`Could not play sound: ${err.message}`);
    });
}

const soundMap = {
    5: 'client/static/sounds/5beeps-boop.mp3',
    60: 'client/static/sounds/beep.mp3'
};

function playSound(time) {
    const file = soundMap[time];
    if (file) {
        playSoundFile(file);
    }
}

module.exports = { playSound };
