module.exports = {
    port: process.env.PORT || 5000,
    controlKey: process.env.CONTROL_PASSWORD,
    ngrok: {
        authtoken: process.env.NGROK_AUTHTOKEN,
        hostname: process.env.NGROK_HOSTNAME,
        tunnelAuth: process.env.NGROK_TUNNEL_AUTH
    },
    // round settings with defaults
    roundSettings: {
        timerMode: 300,
        finalsMode: false,
        turnover: 15,
        boulders: 5,
        zones: 0,
    },
    // times and sound files to play
    soundMap: {
        5: 'client/static/sounds/5beeps-boop.mp3',
        60: 'client/static/sounds/beep.mp3'
    }
}
