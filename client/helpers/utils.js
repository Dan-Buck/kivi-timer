
// takes user's athletes.csv and converts to json for POST to server
export function csvToJson(csv) {
    const rows = csv
        .trim()
        .split("\n")
        .map(row => row.trim())
        .filter(row => row !== "") // remove blank lines
        .map(row => row.split(","));

    return rows.map(row => ({
        id: row[0].trim(),
        firstName: row[1].trim(),
        lastName: row[2].trim()
    }));
}

export function csvError(err) {
    console.error("CSV parsing error:", err);
    alert("Please properly format the CSV file: \n"
        + "Athlete ID 1,First Name 1,Last Name 1\n"
        + "Athlete ID 2,First Name 2,Last Name 2\n"
        + "..."
    )
    return;
}

export function mergeState(prev, incoming) {
    return {
        ...prev,
        ...incoming,
        groups: incoming.groups ?? prev.groups,
        roundSettings: incoming.roundSettings ?? prev.roundSettings,
    };
}

export function checkIfTurnover(data) {
    const { betweenRounds, roundStarted, roundSettings, nextClimberFlag } = data;
    const { leadMode } = roundSettings;
    return ((betweenRounds && roundStarted && !nextClimberFlag) || (leadMode && betweenRounds)) ? true : false;

}
