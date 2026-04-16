const crypto = require("crypto");

function resolveConfig(baseConfig, argv) {
    return {
        ...baseConfig,

        port: argv.port ?? baseConfig.port,

        ngrok: {
            ...baseConfig.ngrok,
            enabled: argv.ngrok ?? true
        },

        serverSoundOn: argv.sound ?? false,

        controlKey: baseConfig.controlKey ?? generateControlKey(),

        sessionSecret: baseConfig.sessionSecret ?? crypto.randomBytes(32).toString("hex"),

    };
}

function generateControlKey() {
    const controlKey = crypto.randomBytes(4).toString("hex");
    console.log(`Generated control password: ${controlKey}`);
    return controlKey
}

module.exports = resolveConfig;