function parseCLI() {
    const args = process.argv.slice(2);
    const result = {};

    for (const arg of args) {
        if (arg === "--help") {
            result.help = true;
            continue;
        }

        const [key, value] = arg.split("=");

        if (!key.startsWith("--")) continue;

        const name = key.slice(2);

        if (value === undefined) {
            result[name] = true;
        } else if (value === "true" || value === "false") {
            result[name] = value === "true";
        } else if (!isNaN(value)) {
            result[name] = Number(value);
        } else {
            result[name] = value;
        }
    }

    if (result.help) {
        console.log(`
            Usage: node server.js [options]

            Options:
            --port=<number>     Port to run the server on
            --ngrok=<boolean>   Enable or disable ngrok
            --sound=<boolean>   Enable or disable direct server sound play
            --help              Show this help message

            Examples:
            node server.js --port=4000
            node server.js --ngrok=false
        `);
        process.exit(0);
    }

    return result;
}

module.exports = parseCLI;