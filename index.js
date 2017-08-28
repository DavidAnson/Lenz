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
const ListBox = require('./listbox.js');
const packageJson = require('./package.json');

const fsReaddir = pify(fs.readdir);
const dialog = remote.dialog;
const getExifIpc = ipc.createClient(ipcRenderer, 'getExif');
const imageRe = /\.(bmp|gif|png|jpeg|jpg|jxr|webp)$/i;
/* image-orientation: from-image; Not available in Chrome yet */
const exifImageOrientationMap = {
	1: '',
	3: 'rotate(180deg)',
	6: 'rotate(90deg)',
	8: 'rotate(270deg)'
};

class ImagePreview extends React.Component {
	constructor(props) {
		super(props);
		this.state = {
			stage: 'loading'
		};
	}

	render() {
		const picture = this.props.picture;
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
			getExifIpc(picture.file, exif => {
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

class ImageDetail extends React.Component {
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
		const picture = this.props.picture;
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
			if ((orientation === 6) || (orientation === 8)) {
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

class Page extends React.Component {
	constructor(props) {
		super(props);
		this.state = {
			pictures: [],
			index: -1,
			favorited: false
		};
		this.onKeydown = event => {
			const index = this.state.index;
			switch (event.key) {
				case ' ':
					this.state.pictures[index].favorite = !this.state.pictures[index].favorite;
					this.forceUpdate();
					event.preventDefault();
					break;
				case 'a':
					this.aboutDialog();
					break;
				case 'f':
					this.setState({
						favorited: !this.state.favorited
					});
					break;
				case 'o':
					this.openFolder();
					break;
				default:
					break;
			}
		};
	}

	componentDidMount() {
		window.addEventListener('keydown', this.onKeydown); // this.container.addEventListener
	}
	componentWillUnmount() {
		window.removeEventListener('keydown', this.onKeydown); // this.container.addEventListener
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
					'label',
					null,
					React.createElement(
						'input', {
							type: 'radio',
							checked: !this.state.favorited,
							onChange: () => this.setState({
								favorited: false
							})
						}),
					'All Photos'),
				React.createElement(
					'label',
					null,
					React.createElement(
						'input', {
							type: 'radio',
							checked: this.state.favorited,
							onChange: () => this.setState({
								favorited: true
							})
						}),
					'Selected Photos'),
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
									setStage: (this.state.index === index) ?
										() => {
											this.forceUpdate();
										} : null
								}
							),
						keyForItem: picture => picture.file,
						visibilityForItem: picture => !this.state.favorited || picture.favorite,
						onSelected: selectedIndex => {
							this.showPicture(selectedIndex);
						}
					}
				),
				React.createElement(
					'div', {
						className: 'current'
					},
					(this.state.index === -1) ?
						null :
						React.createElement(
							ImageDetail, {
								picture: this.state.pictures[this.state.index],
								stage: this.state.pictures[this.state.index].stage
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
							exif: null,
							favorite: false
						};
					});
				this.setState({
					pictures,
					index: -1
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
