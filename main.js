const { app, BrowserWindow, Tray, Menu, ipcMain, screen, dialog } = require('electron');
const { autoUpdater } = require("electron-updater");
const path = require('path');
const os = require('os');
const YTMusic = require('ytmusic-api');
const { spawn } = require('child_process');

// const ytDlpPath = path.join(__dirname, 'yt-dlp');
let ytDlpPath;
if (os.platform() === 'win32') {
  ytDlpPath = path.join(process.resourcesPath, 'yt-dlp.exe');
} else {
  ytDlpPath = path.join(process.resourcesPath, 'yt-dlp');
}

//HOT RELOAD!!!!!!!

// try {
//   require('electron-reload')(__dirname, {
//     electron: require(`${__dirname}/node_modules/electron`)
//   });
// } catch (e) {
//   console.warn("Hot reload not enabled:", e);
// }

let tray;
let popupWindow;
let isVisible = false;
const yt = new YTMusic();

(async () => {
  try {
    await yt.initialize();
  } catch (err) {
    console.error('YTMusic initialization failed:', err);
  }
})();

app.whenReady().then(() => {
  // Tray icon
  tray = new Tray(path.join(__dirname, 'icons/icon.png'));
  tray.setToolTip('YT Music Tray');
  tray.setContextMenu(Menu.buildFromTemplate([
        { label: 'Show', click: () => popupWindow.show()},
        { label: 'Exit', click: () => app.quit() }
    ]));

  // Popup window
  popupWindow = new BrowserWindow({
    transparent: true,
    backgroundColor: '#00000000',
    width: 400,
    height: 570,
    show: true,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: true,
    movable: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  isVisible = true;
  popupWindow.loadFile(path.join(__dirname, 'index.html'));

  //DEVTOOL!!!!!!!
  // popupWindow.webContents.openDevTools({ mode: 'detach' });
  
  tray.on('click', () => {
    console.log(isVisible)
    if (isVisible) {
      popupWindow.hide();
    } else {
      isVisible = true;
      const { width, height } = screen.getPrimaryDisplay().workAreaSize;
      popupWindow.setBounds({
        x: Math.round(width / 2 - 200),
        y: Math.round(height / 2 - 285),
        width: 400,
        height: 570
      });
      popupWindow.show();
      popupWindow.focus();
    }
  });

  // Close popup when clicking outside
  popupWindow.on('blur', () => {
    isVisible = false;
    popupWindow.hide()
    console.log(isVisible)
  });

  setTimeout(() => {
      console.log("🔍 Checking for updates...");
      autoUpdater.checkForUpdatesAndNotify();
    }, 2000);

  // if (os.platform() === "win32") {
  //   setTimeout(() => {
  //     console.log("🔍 Checking for updates...");
  //     autoUpdater.checkForUpdatesAndNotify();
  //   }, 2000);
  // }
});

// app.on('ready', () => {
//   if (os.platform() === 'win32') {
//     autoUpdater.checkForUpdatesAndNotify();
//   }
// })

// ----- AutoUpdater Events ----- //
autoUpdater.on("checking-for-update", () => {
  console.log("Checking for update...");
});

autoUpdater.on("update-available", (info) => {
  console.log("Update available:", info);
  dialog.showMessageBox({
    type: "info",
    title: "Update Available",
    message: `A new version (${info.version}) is available.\nIt will download automatically.`,
  });
});

autoUpdater.on("update-not-available", () => {
  console.log("No update available.");
});

autoUpdater.on("error", (err) => {
  console.error("Update error:", err);
  dialog.showErrorBox("Update Error", err == null ? "unknown" : (err.stack || err).toString());
});

autoUpdater.on("download-progress", (progress) => {
  console.log(`Downloading update: ${progress.percent}%`);
});

autoUpdater.on("update-downloaded", () => {
  const response = dialog.showMessageBoxSync({
    type: "question",
    buttons: ["Restart Now", "Later"],
    defaultId: 0,
    message: "Update downloaded. Restart to apply now?",
  });

  if (response === 0) {
    autoUpdater.quitAndInstall();
  }
});


autoUpdater.on("update-downloaded", () => {
  const response = dialog.showMessageBoxSync({
    type: "question",
    buttons: ["Restart now", "Later"],
    defaultId: 0,
    message: "Update downloaded. Restart now?"
  });

  if (response === 0) {
    autoUpdater.quitAndInstall();
  }
});

async function getAudioStream(videoId) {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  // Get info about the video
  const info = await ytdl.getInfo(url);
  // Choose best audio format
  const format = ytdl.chooseFormat(info.formats, { quality: 'highestaudio' });
  return format.url; // direct streamable URL
}

// IPC handlers
ipcMain.handle('yt-search', async (event, query) => {
  try {
    return await yt.searchSongs(query);
  } catch (err) {
    console.error('YTMusic search error:', err);
    return { error: err.message };
  }
});

ipcMain.handle('yt-getSong', async (event, videoId) => {
  try {
    return await yt.getSong(videoId);
  } catch (err) {
    console.error('YTMusic getSong error:', err);
    return { error: err.message };
  }
});

ipcMain.handle('yt-getAudio', async (event, videoId) => {
  try {
    return new Promise((resolve, reject) => {
        const ytProcess = spawn(ytDlpPath, [
            "--dump-single-json",
            "--no-check-certificates",
            "--no-warnings",
            "--prefer-free-formats",
            "--add-header", "referer: https://www.youtube.com/",
            "--add-header", "user-agent: Mozilla/5.0",
            `https://music.youtube.com/watch?v=${videoId}`
        ]);

        let stdout = "";
        let stderr = "";

        ytProcess.stdout.on("data", data => stdout += data.toString());
        ytProcess.stderr.on("data", data => stderr += data.toString());

        ytProcess.on("close", code => {
            if (code !== 0) {
                return reject(new Error(stderr || `yt-dlp exited with code ${code}`));
            }
            try {
                const info = JSON.parse(stdout);
                const audio = info.formats.find(f => f.acodec !== 'none');
                if (!audio) return reject(new Error("No audio stream found"));
                resolve({
                    url: audio.url,
                    mime: audio.ext
                });
            } catch (err) {
                reject(err);
            }
        });
    });
  } catch (err) {
    console.error("yt-dlp error:", err);
    return { error: err.message };
  }
});


ipcMain.handle('yt-getSuggestions', async (event, videoId) => {
  try {
    const suggestions = await yt.getUpNexts(videoId);
    return suggestions.map(s => ({
      name: s.title,
      artist: {name: s.artists}, // pick first artist
      videoId: s.videoId
    }));
  } catch (err) {
    console.error(err);
    return { error: err.message };
  }
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});