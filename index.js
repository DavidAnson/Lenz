'use strict';

const {shell} = require('electron');
const remote = require('@electron/remote');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const url = require('url');
const Datauri = require('datauri');
const delay = require('delay');
const {ipcRenderer: ipc} = require('electron-better-ipc');
const pCancelable = require('p-cancelable');
const React = require('react');
const ReactDOM = require('react-dom');
const ListBox = require('./listbox.js');
const packageJson = require('./package.json');
const configurationJson = require('./configuration.json');

const {dialog} = remote;
const cancelableDelay = pCancelable.fn(delay);
const imageRe = /\.(bmp|gif|png|jpeg|jpg|jxr|webp)$/i;
/* image-orientation: from-image; Not available in Chrome yet */
const exifImageOrientationMap = {
	1: '',
	2: 'scale(-1, 1)',
	3: 'rotate(180deg)',
	4: 'scale(1, -1)',
	5: 'rotate(90deg) scale(1, -1)',
	6: 'rotate(90deg)',
	7: 'rotate(270deg) scale(1, -1)',
	8: 'rotate(270deg)'
};
const encodingUtf8 = {encoding: 'utf8'};
const favoritesTxt = 'Favorites.txt';

class ImagePreview extends React.PureComponent {
	constructor(props) {
		super(props);
		this.state = {
			stage: 'loading'
		};
	}

	render() {
		const {picture} = this.props;
		const {exif} = picture;
		const orientation = exif ? exif.orientation : null;
		const thumbnailDataUri = exif ? exif.thumbnailDataUri : null;
		const file = path.basename(picture.file);
		const setStage = stage => {
			picture.stage = stage;
			this.setState({
				stage
			});
			if (this.props.setStage) {
				this.props.setStage();
			}
		};
		if (this.state.stage === 'loading') {
			ipc.callMain('getExif', picture.file)
				.then(exif => {
					const {exposureTime, flash, fNumber, focalLength, gpsLatitude, gpsLongitude, iso, make, model, modifyDate, orientation, thumbnail} = exif;
					const details = [
						file
					];
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
					if (flash !== undefined) {
						const value = (flash % 2) ? 'On' : 'Off';
						details.push(`Flash: ${value}`);
					}
					if (modifyDate) {
						details.push(`Date: ${(new Date(modifyDate)).toLocaleString()}`);
					}
					if (make || model) {
						let value = model || make;
						if (value && make && !value.startsWith(make)) {
							value = `${make} ${value}`;
						}
						details.push(`Camera: ${value}`);
					}
					if (gpsLatitude && gpsLongitude) {
						details.gpsLabel = `GPS: ${gpsLatitude} ${gpsLongitude}`;
						// https://developers.google.com/maps/documentation/urls/guide
						details.gpsUri = `https://www.google.com/maps/place/${gpsLatitude.replace(/ /g, '')}+${gpsLongitude.replace(/ /g, '')}`;
					}
					let thumbnailDataUri = null;
					if (thumbnail) {
						const datauri = new Datauri();
						datauri.format('.jpg', thumbnail);
						thumbnailDataUri = datauri.content;
					}
					picture.exif = {
						orientation,
						thumbnailDataUri,
						details
					};
					setStage('preview');
				});
		}
		const children = [];
		const pushImage = props => {
			props.title = file;
			props.loading = 'lazy';
			children.push(React.createElement('img', props));
		};
		if (this.state.stage === 'loading') {
			pushImage({src: 'waiting.svg'});
		} else if (this.state.stage === 'preview') {
			if (thumbnailDataUri) {
				pushImage({
					src: thumbnailDataUri,
					style: {
						transform: exifImageOrientationMap[orientation || 1]
					}
				});
			} else {
				pushImage({src: 'waiting.svg'});
			}
			pushImage({
				src: picture.file,
				className: 'hidden',
				onLoad: () => {
					setStage('loaded');
				},
				onError: () => {
					setStage('error');
				}
			});
		} else if (this.state.stage === 'loaded') {
			pushImage({
				src: picture.file,
				style: {
					transform: exifImageOrientationMap[orientation || 1]
				},
				onError: () => {
					setStage('error');
				}
			});
		} else if (this.state.stage === 'error') {
			pushImage({src: 'warning.svg'});
		}
		return React.createElement(
			'div', {
				className: 'image' + (this.props.picture.favorite ? ' favorite' : ''),
				onClick: this.props.onClick
			}, ...children);
	}
}

class ImageDetail extends React.PureComponent {
	constructor(props) {
		super(props);
		this.state = {
			outerWidth: 1,
			outerHeight: 1,
			innerWidth: 1,
			innerHeight: 1
		};
		this.onResize = () => {
			this.forceUpdate();
		};
	}

	componentDidMount() {
		window.addEventListener('resize', this.onResize);
	}

	componentWillUnmount() {
		window.removeEventListener('resize', this.onResize);
	}

	render() {
		const {picture} = this.props;
		const {exif} = picture;
		const orientation = exif ? exif.orientation : null;
		const details = exif ? exif.details : null;
		const thumbnailDataUri = exif ? exif.thumbnailDataUri : null;
		const children = [];
		const pushImage = props => {
			props.title = path.basename(picture.file);
			children.push(React.createElement('img', props));
		};
		if (this.props.stage === 'loading') {
			pushImage({src: 'waiting.svg'});
		} else if (this.props.stage === 'preview') {
			if (thumbnailDataUri) {
				pushImage({
					src: thumbnailDataUri,
					style: {
						transform: exifImageOrientationMap[orientation || 1]
					}
				});
			} else {
				pushImage({src: 'waiting.svg'});
			}
		} else if (this.props.stage === 'loaded') {
			let scale = 1;
			if ((orientation >= 5) && (orientation <= 8)) {
				const preScale = Math.min((this.state.outerWidth / this.state.innerWidth), (this.state.outerHeight / this.state.innerHeight));
				const postScale = Math.min((this.state.outerWidth / this.state.innerHeight), (this.state.outerHeight / this.state.innerWidth));
				scale = postScale / preScale;
			}
			pushImage({
				src: picture.file,
				style: {
					transform: exifImageOrientationMap[orientation || 1] + ` scale(${scale})`
				},
				ref: element => {
					if (element) {
						const outerWidth = element.clientWidth;
						const outerHeight = element.clientHeight;
						if ((this.state.outerWidth !== outerWidth) || (this.state.outerHeight !== outerHeight)) {
							this.setState({
								outerWidth,
								outerHeight
							});
						}
					}
				}
			});
		} else if (this.props.stage === 'error') {
			pushImage({src: 'warning.svg'});
		}
		if (details && (details.length > 0)) {
			const listItems = details.map(detail => {
				return React.createElement('li', {
					key: detail
				}, detail);
			});
			if (details.gpsUri && details.gpsLabel) {
				listItems.push(
					React.createElement('li', {
						key: details.gpsLabel
					},
					React.createElement('a', {
						href: '#',
						onClick: event => {
							event.preventDefault();
							shell.openExternal(details.gpsUri);
						}
					}, details.gpsLabel)));
			}
			children.push(React.createElement(
				'ul', {
					className: 'details'
				},
				listItems
			));
		}
		return React.createElement(
			'div', {
				className: 'image' + (this.props.picture.favorite ? ' favorite' : ''),
				ref: element => {
					if (element) {
						const innerWidth = element.clientWidth;
						const innerHeight = element.clientHeight;
						if ((this.state.innerWidth !== innerWidth) || (this.state.innerHeight !== innerHeight)) {
							this.setState({
								innerWidth,
								innerHeight
							});
						}
					}
				}
			}, ...children);
	}
}

class Page extends React.PureComponent {
	constructor(props) {
		super(props);
		this.state = {
			pictures: [],
			index: -1,
			showing: 0
		};
		this.onKeydown = event => {
			const {index} = this.state;
			const picture = this.state.pictures[index];
			switch (event.key) {
				case ' ':
					event.preventDefault();
					picture.favorite = !picture.favorite;
					if (picture.favorite) {
						picture.caption = picture.captionSaved || '';
					} else {
						picture.captionSaved = picture.caption;
						picture.caption = '';
					}
					this.saveFavorites();
					this.forceUpdate();
					break;
				case 'a':
				case 'A':
					this.aboutDialog();
					break;
				case 'f':
				case 'F':
					this.setState({
						showing: (this.state.showing + 1) % 3
					});
					break;
				case 'o':
				case 'O':
					this.openFolder();
					break;
				default:
					break;
			}
		};
		this.beforeunload = event => {
			if (this.savePending) {
				event.returnValue = false;
			}
		};
		this.savePending = false;
		this.directory = null;
	}

	componentDidMount() {
		window.addEventListener('keydown', this.onKeydown);
		window.addEventListener('beforeunload', this.beforeunload);
		if (configurationJson.openFolder) {
			this.readFolder(configurationJson.openFolder);
		}
	}

	componentWillUnmount() {
		window.removeEventListener('keydown', this.onKeydown);
		window.removeEventListener('beforeunload', this.beforeunload);
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
						onClick: () => this.openFolder(),
						autoFocus: true
					},
					'Open Folder'),
				React.createElement(
					'div',
					null,
					React.createElement(
						'label',
						null,
						React.createElement(
							'input', {
								type: 'radio',
								checked: this.state.showing === 0,
								onChange: () => this.setState({
									showing: 0
								})
							}),
						'All Photos'),
					React.createElement(
						'label',
						null,
						React.createElement(
							'input', {
								type: 'radio',
								checked: this.state.showing === 1,
								onChange: () => this.setState({
									showing: 1
								})
							}),
						'Selected'),
					React.createElement(
						'label',
						null,
						React.createElement(
							'input', {
								type: 'radio',
								checked: this.state.showing === 2,
								onChange: () => this.setState({
									showing: 2
								})
							}),
						'Captioned')),
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
					ListBox, {
						items: this.state.pictures,
						containerClass: 'container',
						itemClass: 'item',
						selectedItemClass: 'selectedItem',
						elementForItem: (picture, index) =>
							React.createElement(
								ImagePreview, {
									picture,
									favorite: picture.favorite, // Update if changed
									setStage: (this.state.index === index) ?
										() => {
											this.forceUpdate();
										} : null
								}
							),
						keyForItem: picture => picture.file,
						visibilityForItem: picture =>
							(this.state.showing === 0) ||
							((this.state.showing === 1) && picture.favorite) ||
							((this.state.showing === 2) && picture.favorite && picture.caption),
						onSelected: selectedIndex => {
							this.showPicture(selectedIndex);
						}
					}
				),
				React.createElement(
					'div', {
						className: 'current'
					},
					React.createElement(
						'div', {
							className: 'constraint'
						},
						React.createElement(
							'div', {
								className: 'photo'
							},
							(this.state.index === -1) ?
								null :
								React.createElement(
									ImageDetail, {
										picture: this.state.pictures[this.state.index],
										favorite: this.state.pictures[this.state.index].favorite, // Update if changed
										stage: this.state.pictures[this.state.index].stage
									}
								)
						)
					),
					React.createElement(
						'input', {
							type: 'text',
							className: 'caption',
							value: (this.state.index === -1) ? '' : this.state.pictures[this.state.index].caption,
							disabled: (this.state.index === -1),
							spellCheck: true,
							onKeyDown: event => event.stopPropagation(),
							onChange: event => {
								this.state.pictures[this.state.index].caption = event.target.value;
								this.state.pictures[this.state.index].favorite = true;
								this.saveFavorites();
								this.forceUpdate();
							}
						})
				)
			)
		));
		return React.createElement(React.StrictMode,
			null,
			React.createElement(React.Fragment,
				null,
				...children));
	}

	showPicture(index) {
		this.setState({
			index
		});
	}

	openFolder() {
		if (this.savePending) {
			return;
		}
		this.setState({
			pictures: [],
			index: -1,
			showing: 0
		});
		dialog.showOpenDialog({
			properties: ['openDirectory']
		})
			.then(openDialogResult => {
				const {canceled, filePaths} = openDialogResult;
				if (!canceled && (filePaths.length > 0)) {
					return this.readFolder(filePaths[0]);
				}
			})
			.catch(this.showError);
	}

	readFolder(directory) {
		this.directory = directory;
		return Promise.all([
			fs.readdir(directory),
			fs.readFile(path.join(directory, favoritesTxt), encodingUtf8)
				.catch(() => {
					return ''; // Ignore Favorites.txt read errors
				})
		])
			.then(results => {
				const [files, favorites] = results;
				const filesAndCaptions = new Map(files.map(file => [file, undefined]));
				const favoritesRe = /^"(.+?)"(?:[^\n\S]+(.+?))?$/gm;
				let match = null;
				while ((match = favoritesRe.exec(favorites)) !== null) {
					const [, file, caption] = match;
					filesAndCaptions.set(file, caption || null);
				}
				const sortedFiles = [...filesAndCaptions.keys()].sort((a, b) => a.localeCompare(b));
				const pictures = sortedFiles
					.filter(file => file.match(imageRe))
					.map(file => {
						const caption = filesAndCaptions.get(file);
						return {
							file: path.join(directory, file),
							exif: null,
							caption: caption || '',
							favorite: caption !== undefined
						};
					});
				this.setState({
					pictures
				});
			});
	}

	saveFavorites() {
		if (this.saveDelayPromise) {
			this.saveDelayPromise.cancel();
		}
		this.savePending = true;
		this.saveActionPromise = (this.saveActionPromise || Promise.resolve())
			.then(() => {
				this.saveDelayPromise = cancelableDelay(500);
				return this.saveDelayPromise;
			})
			.then(() => {
				const favoritesPath = path.join(this.directory, favoritesTxt);
				const lines = this.state.pictures
					.filter(picture => picture.favorite)
					.map(picture => {
						const basename = path.basename(picture.file);
						const {caption} = picture;
						return `"${basename}"` + (caption ? ` ${caption}` : '');
					});
				return (lines.length === 0) ?
					fs.access(favoritesPath)
						.then(() => {
							return fs.unlink(favoritesPath);
						}, () => {}) :
					fs.writeFile(favoritesPath, lines.join(os.EOL), encodingUtf8);
			})
			.then(() => {
				this.savePending = false;
			})
			.catch(error => {
				this.savePending = false;
				if (!this.saveDelayPromise.isCanceled) {
					this.showError(error);
				}
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
			resizable: false,
			webPreferences: {
				enableRemoteModule: true,
				nodeIntegration: true
			}
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

	showError(err) {
		dialog.showErrorBox(err.code || 'Oops', err.message);
	}
}

ReactDOM.render(
	React.createElement(Page, null),
	document.querySelector('#root'));

// Prevent drag/drop
['dragenter', 'dragover', 'drop'].forEach(type => {
	document.addEventListener(type, event => {
		event.preventDefault();
		event.dataTransfer.dropEffect = 'none';
		event.dataTransfer.effectAllowed = 'none';
	});
});
