const os = require("os");

function getLocalIPs() {
    const interfaces = os.networkInterfaces();
    const addresses = [];

    for (const name in interfaces) {
        for (const iface of interfaces[name]) {
            if (iface.family === "IPv4" && !iface.internal) {
                addresses.push(iface.address);
            }
        }
    }
    return addresses;
}

module.exports = getLocalIPs;