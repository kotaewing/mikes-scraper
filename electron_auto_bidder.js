const { app, BrowserWindow, ipcMain } = require('electron');
const { startAutoBidder, stopAutoBidder, log } = require('./scraper');
const fs = require('fs');

// NOTE: Uncomment for local dev
// require('electron-reload')(__dirname, {
//     electron: require(`${__dirname}/node_modules/electron`),
//     forceHardReset: true
// });


let mainWindow;
let browser;

async function saveCookies() {
    // Save cookies
    if (browser) {
        // Save Cookies
        const cookies = await browser.cookies();
        fs.writeFileSync('cookies.json', JSON.stringify(cookies), 'utf8');
        console.log('Cookies saved!');
    }
}

app.whenReady().then(() => {
    mainWindow = new BrowserWindow({
        width: 1920,
        height: 1080,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    mainWindow.loadFile('index.html');
});

app.addListener('before-quit', async () => {
    stopAutoBidder();
})

ipcMain.handle('start-auto-bidder', async (e, body) => {
    try {
        startAutoBidder(body);
    } catch (err) {
        log(err)
    }
});

ipcMain.handle('stop-auto-bidder', async () => {
    try {
        stopAutoBidder();
    } catch (err) {
        log(err);
    }
});

ipcMain.handle('save-cookies', async () => {
    try {
        await saveCookies();
    } catch (err) {
        log(err);
    }
});