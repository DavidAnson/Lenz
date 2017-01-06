'use strict';

const {app, BrowserWindow, ipcMain} = require('electron');
const path = require('path');
const url = require('url');
const {ExifImage} = require('exif');
const ipc = require('./ipc.js');
const packageJson = require('./package.json');

let win;

function createWindow() {
	win = new BrowserWindow({
		title: packageJson.name
	});
	win.setMenu(null);
	win.loadURL(url.format({
		pathname: path.join(__dirname, 'index.html'),
		protocol: 'file:',
		slashes: true
	}));

	// win.webContents.openDevTools();

	win.on('closed', () => {
		win = null;
	});
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') {
		app.quit();
	}
});

app.on('activate', () => {
	if (win === null) {
		createWindow();
	}
});

function getExif(file) {
	return new Promise((resolve, reject) => {
		// eslint-disable-next-line no-new
		new ExifImage({image: file}, (error, exif) => {
			if (error) {
				reject(error);
			} else {
				resolve(exif);
			}
		});
	});
}

ipc.createServer(ipcMain, 'getExif', (arg, reply) => {
	getExif(arg)
		.catch(() => {
			// Transform errors to empty exif data
		})
		.then(reply);
});
