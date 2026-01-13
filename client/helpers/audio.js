let audioContext;
let currentSource = null;

export function playSound(path) {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    if (audioContext.state === "suspended") {
        audioContext.resume().then(() => {
            console.log("AudioContext resumed!");
            playAudioBuffer(path);
        });
    } else {
        playAudioBuffer(path);
    }
}

export function stopSound() {
    if (currentSource) {
        currentSource.stop();
        currentSource.disconnect();
        currentSource = null;
    }
}

async function playAudioBuffer(path) {
    try {
        stopSound();

        const response = await fetch(path);
        const data = await response.arrayBuffer();
        const buffer = await audioContext.decodeAudioData(data);

        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.destination);
        source.onended = () => {
            if (currentSource === source) {
                currentSource = null;
            }
        };
        currentSource = source;
        source.start(0);
    } catch (err) {
        console.warn("Error playing sound:", err);
    }
}
