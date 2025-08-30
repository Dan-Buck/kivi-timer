let audioContext;

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

async function playAudioBuffer(path) {
    try {
        const response = await fetch(path);
        const data = await response.arrayBuffer();
        const buffer = await audioContext.decodeAudioData(data);

        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.destination);
        source.start(0);
    } catch (err) {
        console.warn("Error playing sound:", err);
    }
}
