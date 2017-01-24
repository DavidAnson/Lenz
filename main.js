'use strict';

const {app, BrowserWindow, ipcMain} = require('electron');
const fs = require('fs');
const path = require('path');
const url = require('url');
const fastExif = require('fast-exif');
const pify = require('pify');
const ipc = require('./ipc.js');
const packageJson = require('./package.json');

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

ipc.createServer(ipcMain, 'getExif', (arg, reply) => {
	fastExif.read(arg)
		.catch(() => {
			// Transform errors to empty exif data
		})
		.then(exif => {
			if (exif && exif.thumbnail && exif.thumbnail.ThumbnailOffset && exif.thumbnail.ThumbnailLength) {
				return fsOpen(arg, 'r')
					.then(fd => {
						const thumbnailOffset = exif.thumbnail.ThumbnailOffset;
						const thumbnailLength = exif.thumbnail.ThumbnailLength;
						const buffer = new Buffer(thumbnailLength);
						const exifOffset = 12; // sizeof(JPEG header) + sizeof(APP1 header) + sizeof(Exif header)
						return fsRead(fd, buffer, 0, thumbnailLength, exifOffset + thumbnailOffset)
							.then(() => {
								if ((thumbnailLength >= 4) &&
									(buffer[0] === 0xff) && (buffer[1] === 0xd8) &&
									(buffer[thumbnailLength - 2] === 0xff) && (buffer[thumbnailLength - 1] === 0xd9)) {
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
			const gpsLatitude = exifGps.GPSLatitude && (exifGps.GPSLatitude.length === 3) && exifGps.GPSLatitudeRef &&
				`${exifGps.GPSLatitude[0]}\u00b0 ${exifGps.GPSLatitude[1]}' ${exifGps.GPSLatitude[2]}" ${exifGps.GPSLatitudeRef}`;
			const gpsLongitude = exifGps.GPSLongitude && (exifGps.GPSLongitude.length === 3) && exifGps.GPSLongitudeRef &&
				`${exifGps.GPSLongitude[0]}\u00b0 ${exifGps.GPSLongitude[1]}' ${exifGps.GPSLongitude[2]}" ${exifGps.GPSLongitudeRef}`;
			const modifyDate = exifImage.ModifyDate &&
				(exifImage.ModifyDate.valueOf() + (exifImage.ModifyDate.getTimezoneOffset() * 60 * 1000));
			reply({
				exposureTime: exifExif.ExposureTime,
				flash: exifExif.Flash,
				fNumber: exifExif.FNumber,
				focalLength: exifExif.FocalLength,
				gpsLatitude,
				gpsLongitude,
				iso: exifExif.ISO,
				make: exifImage.Make,
				model: exifImage.Model,
				modifyDate,
				orientation: exifImage.Orientation,
				thumbnail: exifThumbnail.buffer
			});
		});
});
