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
   NGROK_HOSTNAME=your-custom-ngrok-subdomain.ngrok-free.app
   CONTROL_PASSWORD=your-chosen-control-password
   ```

4. Start the server:
   ```sh
   node server.js
   ```

## Usage
- The app will start at `http://localhost:5000`. 
- The NGROK tunnel URL is displayed in the console when the server starts. Share this with other clients and users who need access. 
- Access the **control panel** by clicking the timer or navigating to `/control` and logging in with the preset key.
- The **transit area** screen can be accessed at `/transit`.

### Operational Workflow
- From the control screen enter your round settings
- Then upload 1 or 2 athlete .csv files without column headers, formatted as below (via Save As .CSV):
    Athlete ID 1,Athlete Name 1 
    Athlete ID 2,Athlete Name 2 
    Athlete ID 3,Athlete Name 3 
- Finally hit "Reset" which will queue the athletes and timers for all screens
- Now hitting "Start/Resume" will lead with a 5s countdown then immediately into the round timer
- It is good practice to click "Clear Athete Data" between rounds if not restarting the server
- Use the "Place Athlete" feature only if needed to resume a round that was interrupted by server outage


## Ngrok Setup
The app uses Ngrok for external access. The tunnel URL is displayed in the console when the server starts. Share this with other clients and users who need access. 

## Contributing
Feel free to submit pull requests or issues to improve the app.

## License
MIT License

