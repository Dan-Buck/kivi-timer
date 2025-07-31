# Kivi Timer Web App

## Overview
The Kivi Timer Web App is a competition timer system designed for managing climbing competitions. It allows users to start, pause, and reset a timer while handling athlete rotations efficiently. The app supports real-time updates using WebSockets and features a control panel for authorized users.

## Features
- Timer management with configurable settings
- Athlete list management
- WebSocket-based real-time updates
- Authentication-protected control panel
- Transit area screen for displaying upcoming athletes
- Ngrok integration for external access

## Technologies Used
- Node.js
- Express.js
- Socket.io
- Ngrok
- Sessions for authentication

## Installation
1. Clone the repository:
   ```sh
   git clone https://github.com/your-repo/kivi-timer.git
   cd kivi-timer
   ```

2. Install dependencies:
   ```sh
   npm install
   ```

3. Create a `.env` file in the project root with the following variables:
   ```env
   NGROK_AUTHTOKEN=your-ngrok-auth-token
   NGROK_HOSTNAME="your-custom-ngrok-subdomain.ngrok-free.app"
   CONTROL_PASSWORD="your-chosen-control-password"
   ```

   and optionally add authentication to the URL tunnel:
    ```env
    NGROK_TUNNEL_AUTH="username:password"
    ```
    [Setting up and configuring a free ngrok account](https://ngrok.com/)


4. Start the server:
   ```sh
   node server.js
   ```

## Usage
- The app will start at `http://localhost:5000`unless otherwise specified.  
- The NGROK tunnel URL is displayed in the console when the server starts (or via the /connections endpoint). Share this with other clients and users who need access without localhost. 

### Endpoints
- The **fullscreen timer** is the homepage `/`. You must interact with the page for sounds to play. Click the timer to open the controls.
- Access the **control panel** by clicking the timer or navigating to `/control` and logging in with the preset key. No sound on this page.
- The **transit area** screen can be accessed at `/transit`. This shows which athletes are next up for each boulder.
- View the uploaded **athlete data** at `/athletes`. This page is for verification and not user-facing (yet).
- The **addresses** for the NGROK URL and localhost port are available at `/connections`, returning: json({ ngrokUrl, port })

### Operational Workflow
- From the control screen enter your round settings.
   - Turn on Finals Mode if only one athlete (per gender) will be climbing at a time.
- Then upload 1 or 2 athlete .csv files without column headers, formatted as below (via Save As .CSV):
    ```
    Athlete ID 1,First Name 1,Last Name 1 
    Athlete ID 2,First Name 2,Last Name 2 
    Athlete ID 3,First Name 3,Last Name 3
    ```
   Remember to specify gender for each upload. <b>NB: there can only be one group per male/female/combined category.</b>
- Press "Reset", which will queue the athletes and timers for all screens.
- Now hitting "Start/Resume" will lead with a 5s countdown then immediately into the round timer.
- The "Next Climber" button is for indefinite-length rounds such as finals. Click it when a climber finished to reset the timer and advance the round.
- It is good practice to click "Clear Athete Data" between rounds if not restarting the server.
- Use the "Place Athlete" feature only if needed to resume a round that was interrupted by server outage.

### MISC folder
This folder contains several files used at runtime that may be useful to you:
- **server.log** 
- **state-backup.json** : updated at round turnover. Currently experimental, may be used for manually restoring round state.
- **timer.txt** : updated at every 1s `timer-update` emit, potentially utilized for connection-free timer rendering.

## Ngrok Setup
The app uses Ngrok for external access. The tunnel URL is displayed in the console when the server starts. Share this with other clients and users who need access. 

## Contributing
Feel free to submit pull requests or issues to improve the app.

## License
MIT License

