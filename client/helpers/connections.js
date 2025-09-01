
export async function getSocketLink() {
    const res = await fetch("/connections");
    const { lanIPs, port, ngrokUrl } = await res.json();

    const host = window.location.hostname;

    let link;
    if (["localhost", "127.0.0.1", "::1"].includes(host)) {
        link = `http://localhost:${port}`;
    } else if (lanIPs.includes(host)) {
        link = `http://${host}:${port}`;
    } else {
        link = ngrokUrl.replace("https://", "wss://");
    }

    return link;
}