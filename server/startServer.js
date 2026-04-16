const ngrok = require("ngrok");

async function startServer({ app, server, config }) {
    const { port, ngrok: ngrokConfig } = config;

    server.listen(port, async () => {
        console.log(`Server running on http://localhost:${port}`);

        if (ngrokConfig.enabled) {
            try {
                const url = await ngrok.connect({
                    addr: port,
                    authtoken: ngrokConfig.authtoken,
                    basic_auth: ngrokConfig.tunnelAuth,
                    region: "eu",
                    hostname: ngrokConfig.hostname
                });

                console.log(`ngrok tunnel: ${url}`);
            } catch (err) {
                console.error("NONFATAL - ngrok failed:", err.message);
            }
        } else {
            console.log("ngrok disabled");
        }
    });
}

module.exports = startServer;
