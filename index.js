'use strict';

const {ipcRenderer, remote} = require('electron');
const fs = require('fs');
const path = require('path');
const url = require('url');
const Datauri = require('datauri');
const pify = require('pify');
const React = require('react');
const ReactDOM = require('react-dom');
const ipc = require('./ipc.js');
const packageJson = require('./package.json');

const fsReaddir = pify(fs.readdir);
const dialog = remote.dialog;
const getExifIpc = ipc.createClient(ipcRenderer, 'getExif');
const imageRe = /\.(bmp|gif|png|jpeg|jpg|jxr|webp)$/i;
const exifImageOrientationMap = {
	1: 'rotate-none',
	3: 'rotate-flip',
	6: 'rotate-cw',
	8: 'rotate-ccw'
};

class Picture extends React.Component {
	constructor(props) {
		super(props);
		const {exif} = props.picture;
		this.state = {
			stage: exif ? 'loaded' : 'loading',
		};
	}

	render() {
		const {exif} = this.props.picture;
		const orientation = exif ? exif.orientation : null;
		const details = exif ? exif.details : null;
		const thumbnailDataUri = exif ? exif.thumbnailDataUri : null;
		if (this.state.stage === 'loading') {
			getExifIpc(this.props.picture.file, exif => {
				const {exposureTime, flash, fNumber, focalLength, gpsLatitude, gpsLongitude, iso, make, model, modifyDate, orientation, thumbnail} = exif;
				const details = [];
				if (fNumber) {
					details.push(`F-number: \u0192/${fNumber}`);
				}
				if (exposureTime) {
					details.push(`Exposure time: ${exposureTime}s`);
				}
				if (iso) {
					details.push(`ISO speed: ${iso}`);
				}
				if (focalLength) {
					details.push(`Focal length: ${focalLength}mm`);
				}
				if (flash) {
					const value = (flash % 2) ? 'On' : 'Off';
					details.push(`Flash: ${value}`);
				}
				if (modifyDate) {
					details.push(`Date: ${(new Date(modifyDate)).toLocaleString()}`);
				}
				if (gpsLatitude && gpsLongitude) {
					details.push(`GPS: ${gpsLatitude} ${gpsLongitude}`);
				}
				if (make || model) {
					let value = model || make;
					if (value && make && !value.startsWith(make)) {
						value = `${make} ${value}`;
					}
					details.push(`Camera: ${value}`);
				}
				let thumbnailDataUri = null;
				if (thumbnail) {
					const datauri = new Datauri();
					datauri.format('.jpg', thumbnail);
					thumbnailDataUri = datauri.content;
				}
				this.props.picture.exif = {
					orientation,
					thumbnailDataUri,
					details
				};
				this.setState({
					stage: 'preview'
				});
			});
		}
		const children = [];
		const pushImage = props => {
			props.title = path.basename(this.props.picture.file);
			children.push(React.createElement('img', props));
		};
		if (this.state.stage === 'loading') {
			pushImage({src: 'waiting.svg'});
		} else if (this.state.stage === 'preview') {
			if (thumbnailDataUri) {
				pushImage({
					src: thumbnailDataUri,
					className: exifImageOrientationMap[orientation]
				});
			} else {
				pushImage({src: 'waiting.svg'});
			}
			pushImage({
				src: this.props.picture.file,
				className: 'hidden',
				onLoad: () => this.setState({
					stage: 'loaded'
				}),
				onError: () => this.setState({
					stage: 'error'
				})
			});
		} else if (this.state.stage === 'loaded') {
			pushImage({
				src: this.props.picture.file,
				className: exifImageOrientationMap[orientation],
				onError: () => this.setState({
					stage: 'error'
				})
			});
		} else if (this.state.stage === 'error') {
			pushImage({src: 'warning.svg'});
		}
		const thumb = (this.props.className === 'thumb');
		if (!thumb && details && (details.length > 0)) {
			children.push(React.createElement(
				'ul', {
					className: 'details'
				},
				details.map(detail => {
					return React.createElement('li', {
						key: detail
					}, detail);
				})
			));
		}
		return React.createElement(
			'div', {
				className: 'picture ' + (this.props.className || ''),
				onClick: this.props.onClick
			}, ...children);
	}
}

class Page extends React.Component {
	constructor(props) {
		super(props);
		this.state = {
			pictures: [],
			index: -1
		};
	}

	render() {
		const children = [];
		children.push(React.createElement(
			'div', {
				className: 'frame'
			},
			React.createElement(
				'div', {
					className: 'banner'
				},
				React.createElement(
					'button', {
						onClick: () => this.openFolder()
					},
					'Open Folder'),
				React.createElement(
					'button', {
						onClick: () => this.aboutDialog()
					},
					'About')
			),
			React.createElement(
				'div', {
					className: 'content'
				},
				React.createElement(
					'ul', {
						className: 'list'
					},
					this.state.pictures.map((picture, index) =>
						React.createElement(
							'li', {
								key: picture.file,
							},
							React.createElement(
								Picture, {
									picture,
									className: 'thumb',
									onClick: () => {
										this.showPicture(index);
									}
								}
							)
						)
					)
				),
				React.createElement(
					'div', {
						className: 'current'
					},
					(this.state.index === -1) ?
						null :
						React.createElement(
							Picture, {
								picture: this.state.pictures[this.state.index],
							}
						)
				)
			)
		));
		return React.createElement('div', {
			className: 'page'
		}, ...children);
	}

	showPicture(index) {
		this.setState({
			index
		});
	}

	openFolder() {
		new Promise(resolve => {
			dialog.showOpenDialog(
				remote.getCurrentWindow(), {
					properties: ['openDirectory']
				}, resolve);
		})
			.then(directories => {
				if (directories) {
					return this.readFolder(directories[0]);
				}
			})
			.catch(err => {
				dialog.showErrorBox(err.code || 'Oops', err.message);
			});
	}

	readFolder(directory) {
		return fsReaddir(directory)
			.then(files => {
				const pictures = files
					.filter(file => file.match(imageRe))
					.map(file => {
						return {
							file: path.join(directory, file),
							exif: null
						};
					});
				this.setState({
					pictures,
					index: 0
				});
			});
	}

	aboutDialog() {
		this.about = new remote.BrowserWindow({
			title: packageJson.name,
			parent: remote.getCurrentWindow(),
			width: 300,
			height: 300,
			modal: true,
			minimizable: false,
			resizable: false
		});
		this.about.setMenu(null);
		this.about.loadURL(url.format({
			pathname: path.join(__dirname, 'about.html'),
			protocol: 'file:',
			slashes: true
		}));
		// this.about.webContents.openDevTools();
		this.about.on('closed', () => {
			this.about = null;
		});
	}
}

ReactDOM.render(
	React.createElement(Page, null),
	document.getElementById('root'));
