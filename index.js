'use strict';

const {ipcRenderer, remote} = require('electron');
const fs = require('fs');
const path = require('path');
const Datauri = require('datauri');
const pify = require('pify');
const React = require('react');
const ReactDOM = require('react-dom');
const ipc = require('./ipc.js');

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
			orientation: exif ? exif.orientation : null
		};
	}

	render() {
		if (this.state.stage === 'loading') {
			getExifIpc(this.props.picture.file, exif => {
				const {orientation} = exif;
				let thumbnail = null;
				if (exif.thumbnail) {
					const datauri = new Datauri();
					datauri.format('.jpg', exif.thumbnail);
					thumbnail = datauri.content;
				}
				this.props.picture.exif = {
					orientation,
					thumbnail
				};
				this.setState({
					stage: 'preview',
					orientation,
					thumbnail
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
			if (this.state.thumbnail) {
				pushImage({
					src: this.state.thumbnail,
					className: exifImageOrientationMap[this.state.orientation]
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
				className: exifImageOrientationMap[this.state.orientation],
				onError: () => this.setState({
					stage: 'error'
				})
			});
		} else if (this.state.stage === 'error') {
			pushImage({src: 'warning.svg'});
		}
		return React.createElement(this.props.className === 'thumb' ? 'li' : 'div', {
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
		const zoomed = (this.state.index !== -1);
		const children = [];
		children.push(React.createElement(
			'div', {
				className: zoomed ? 'hidden' : null
			},
			React.createElement(
				'button', {
					onClick: () => this.openFolder()
				},
				'Open Folder'),
			React.createElement(
				'ul',
				null,
				this.state.pictures.map((picture, index) => React.createElement(
					Picture, {
						key: picture.file,
						picture,
						className: 'thumb',
						onClick: () => {
							this.showPicture(index);
						}
					}
				))
			)
		));
		if (zoomed) {
			const picture = this.state.pictures[this.state.index];
			children.push(React.createElement(
				Picture, {
					picture,
					onClick: () => {
						this.showPicture(-1);
					}
				}
			));
		}
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
					pictures
				});
			});
	}
}

ReactDOM.render(
	React.createElement(Page, null),
	document.getElementById('root'));
