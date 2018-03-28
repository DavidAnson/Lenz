'use strict';

const {app, BrowserWindow, ipcMain} = require('electron');
const fs = require('fs');
const path = require('path');
const url = require('url');
const fastExif = require('fast-exif');
const Fraction = require('fraction.js');
const pify = require('pify');
const ipc = require('./ipc.js');
const packageJson = require('./package.json');
const configurationJson = require('./configuration.json');

const fsOpen = pify(fs.open);
const fsRead = pify(fs.read);
const fsClose = pify(fs.close);

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
	win.webContents.on('will-navigate', event => {
		event.preventDefault();
	});

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

ipc.createServer(ipcMain, 'getExif', (arg, reply) => {
	fastExif.read(arg, true)
		.catch(() => {
			// Transform errors to empty exif data
		})
		.then(exif => {
			if (exif && exif.thumbnail && exif.thumbnail.ThumbnailOffset && exif.thumbnail.ThumbnailLength) {
				return fsOpen(arg, 'r')
					.then(fd => {
						const thumbnailOffset = exif.thumbnail.ThumbnailOffset;
						const thumbnailLength = exif.thumbnail.ThumbnailLength;
						const buffer = Buffer.alloc(thumbnailLength);
						const exifOffset = 12; // sizeof(JPEG header) + sizeof(APP1 header) + sizeof(Exif header)
						return fsRead(fd, buffer, 0, thumbnailLength, exifOffset + thumbnailOffset)
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
								return fd;
							});
					})
					.then(fd => {
						return fsClose(fd);
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
			const gpsLatitude = gpsCoordinatesToString(exifGps.GPSLatitude, exifGps.GPSLatitudeRef);
			const gpsLongitude = gpsCoordinatesToString(exifGps.GPSLongitude, exifGps.GPSLongitudeRef);
			const make = (exifImage.Make || '').replace(/\0/g, '');
			const model = (exifImage.Model || '').replace(/\0/g, '');
			const modifyDate = exifImage.ModifyDate &&
				(exifImage.ModifyDate.valueOf() + (exifImage.ModifyDate.getTimezoneOffset() * 60 * 1000));
			reply({
				exposureTime,
				flash: exifExif.Flash,
				fNumber: exifExif.FNumber,
				focalLength: exifExif.FocalLength,
				gpsLatitude,
				gpsLongitude,
				iso: exifExif.ISO,
				make,
				model,
				modifyDate,
				orientation: exifImage.Orientation,
				thumbnail: exifThumbnail.buffer
			});
		});
});
