'use strict';

const {app, BrowserWindow, Menu} = require('electron');
const electronRemoteMain = require('@electron/remote/main');
const fs = require('fs').promises;
const path = require('path');
const url = require('url');
const {ipcMain: ipc} = require('electron-better-ipc');
const fastExif = require('fast-exif');
const Fraction = require('fraction.js');
const roundTo = require('round-to');
const packageJson = require('./package.json');
const configurationJson = require('./configuration.json');

electronRemoteMain.initialize();

let win;

function createWindow() {
	Menu.setApplicationMenu(null);
	win = new BrowserWindow({
		title: packageJson.name,
		webPreferences: {
			contextIsolation: false,
			nodeIntegration: true
		}
	});
	win.loadURL(url.format({
		pathname: path.join(__dirname, 'index.html'),
		protocol: 'file:',
		slashes: true
	}));
	win.webContents.on('will-navigate', event => {
		event.preventDefault();
	});
	electronRemoteMain.enable(win.webContents);

	if (configurationJson.openDevTools) {
		win.webContents.openDevTools();
	}

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

function gpsCoordinatesToString(coordinates, reference) {
	let result;
	if (coordinates && (coordinates.length > 0) && !Number.isNaN(coordinates[0]) && reference) {
		result = `${coordinates[0]}\u00B0`;
		if (coordinates[1] && !Number.isNaN(coordinates[1])) {
			result += ` ${coordinates[1]}'`;
			if (coordinates[2] && !Number.isNaN(coordinates[2])) {
				result += ` ${coordinates[2]}"`;
			}
		}
		result += ` ${reference}`;
	}
	return result;
}

ipc.answerRenderer('getExif', file => {
	return fastExif.read(file, true)
		.catch(() => {
			// Transform errors to empty exif data
		})
		.then(exif => {
			if (exif && exif.thumbnail && exif.thumbnail.ThumbnailOffset && exif.thumbnail.ThumbnailLength) {
				return fs.open(file, 'r')
					.then(filehandle => {
						const thumbnailOffset = exif.thumbnail.ThumbnailOffset;
						const thumbnailLength = exif.thumbnail.ThumbnailLength;
						const buffer = Buffer.alloc(thumbnailLength);
						const exifOffset = 12; // sizeof(JPEG header) + sizeof(APP1 header) + sizeof(Exif header)
						return filehandle.read(buffer, 0, thumbnailLength, exifOffset + thumbnailOffset)
							.then(() => {
								if ((thumbnailLength >= 4) &&
									(buffer[0] === 0xFF) && (buffer[1] === 0xD8) &&
									(buffer[thumbnailLength - 2] === 0xFF) && (buffer[thumbnailLength - 1] === 0xD9)) {
									exif.thumbnail.buffer = buffer;
								}
							})
							.catch(() => {
								// Ignore any read errors
							})
							.then(() => {
								return filehandle;
							});
					})
					.then(filehandle => {
						return filehandle.close();
					})
					.catch(() => {
						// Ignore any thumbnail errors
					})
					.then(() => {
						return exif;
					});
			}
			return exif;
		})
		.then(exif => {
			exif = exif || {};
			const exifExif = exif.exif || {};
			const exifGps = exif.gps || {};
			const exifImage = exif.image || {};
			const exifThumbnail = exif.thumbnail || {};
			const exposureTime = exifExif.ExposureTime ? (new Fraction(exifExif.ExposureTime)).toFraction() : null;
			const fNumber = exifExif.FNumber ? roundTo(exifExif.FNumber, 2) : null;
			const focalLength = exifExif.FocalLength ? roundTo(exifExif.FocalLength, 2) : null;
			const gpsLatitude = gpsCoordinatesToString(exifGps.GPSLatitude, exifGps.GPSLatitudeRef);
			const gpsLongitude = gpsCoordinatesToString(exifGps.GPSLongitude, exifGps.GPSLongitudeRef);
			const iso = exifExif.ISO ? roundTo(exifExif.ISO, 0) : null;
			const make = (exifImage.Make || '').replace(/\0/g, '');
			const model = (exifImage.Model || '').replace(/\0/g, '');
			const modifyDate = exifImage.ModifyDate &&
				(exifImage.ModifyDate.valueOf() + (exifImage.ModifyDate.getTimezoneOffset() * 60 * 1000));
			return {
				exposureTime,
				flash: exifExif.Flash,
				fNumber,
				focalLength,
				gpsLatitude,
				gpsLongitude,
				iso,
				make,
				model,
				modifyDate,
				thumbnail: exifThumbnail.buffer
			};
		});
});
