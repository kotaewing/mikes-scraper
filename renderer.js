const { ipcRenderer } = require('electron');

document.getElementById('startAutoBidder').addEventListener('click', async () => {
    console.log('Starting Auto Bidder...');
    const trainingLocation = document.getElementById('training-location');
    const lastDate = document.getElementById('datePicker');
    if (!lastDate.value) {
        return alert("Please select the last day before continuing")
    }
    const button = document.getElementById('startAutoBidder');
    button.hidden = true;
    await ipcRenderer.invoke('start-auto-bidder', { trainingLocation: trainingLocation.value, lastDate: lastDate.value });
});

document.getElementById('stopAutoBidder').addEventListener('click', async () => {
    console.log('Stopping Auto Bidder...');
    const button = document.getElementById('startAutoBidder');
    button.hidden = false;
    await ipcRenderer.invoke('stop-auto-bidder');
});

document.getElementById('saveCookies').addEventListener('click', async () => {
    await ipcRenderer.invoke('save-cookies');
});