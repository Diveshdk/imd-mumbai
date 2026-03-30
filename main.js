const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const express = require('express');
const bodyParser = require('body-parser');

// Create a local server to handle API requests that would normally be Next.js API routes
const apiApp = express();
apiApp.use(bodyParser.json());

// Set up the API routes here using your existing logic
// This is a simplified example - we would ideally port your route.ts logic here
apiApp.post('/api/upload/warning', async (req, res) => {
  // logic from app/api/upload/warning/route.ts
});

const API_PORT = 3001;
apiApp.listen(API_PORT, () => {
  console.log(`API Server running on port ${API_PORT}`);
});

// Ensure data folder exists in user's documents or appData
const dataPath = path.join(app.getPath('userData'), 'imd-data');
if (!fs.existsSync(dataPath)) {
  fs.mkdirSync(dataPath, { recursive: true });
}

// Pass the data path to the Next.js process via environment variable
process.env.APP_DATA_PATH = dataPath;

let mainWindow;
let nextProcess;

// Fix for running from within ASAR
const isPackaged = app.isPackaged;
const resourcesPath = isPackaged ? process.resourcesPath : __dirname;
const appPath = isPackaged ? path.join(resourcesPath, 'app.asar.unpacked') : __dirname;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true, // Need true for local storage access and communication
      contextIsolation: false, // For simpler configuration in internal environment
    },
    icon: path.join(__dirname, 'public/favicon.ico'),
    title: "IMD Mumbai Rainfall Analysis"
  });

  // Ensure next process is spawned from outside ASAR to avoid ENOTDIR
  const nextCommand = isPackaged ? path.join(appPath, 'node_modules', '.bin', 'next') : 'npm';
  const nextArgs = isPackaged ? ['start'] : ['run', 'start'];

  nextProcess = spawn(nextCommand, nextArgs, {
    cwd: isPackaged ? appPath : process.cwd(),
    env: { ...process.env, PORT: '3000', NEXT_TELEMETRY_DISABLED: '1' },
    shell: true
  });

  nextProcess.stdout.on('data', (data) => {
    console.log(`Next.js stdout: ${data}`);
    if (data.toString().includes('Ready in')) {
      mainWindow.loadURL('http://localhost:3000');
    }
  });

  nextProcess.stderr.on('data', (data) => {
    console.error(`Next.js stderr: ${data}`);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (nextProcess) {
       nextProcess.kill();
    }
  });
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
