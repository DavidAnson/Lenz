'use strict';

const {ipcRenderer, remote} = require('electron');
const fs = require('fs');
const path = require('path');
const pify = require('pify');
const React = require('react');
const ReactDOM = require('react-dom');

const dialog = remote.dialog;
const imageRe = /\.(bmp|gif|png|jpeg|jpg|jxr|tif|tiff|webp)$/i;
const exifImageOrientationMap = {
	1: 'rotate-none',
	3: 'rotate-flip',
	6: 'rotate-cw',
	8: 'rotate-ccw'
};

class IpcWrapper {
	constructor() {
		this.id = 1;
		this.pending = {};
		ipcRenderer.on('getExif', (event, arg) => {
			const {id, exif} = arg;
			this.pending[id](exif);
			delete this.pending[id];
		});
	}

	getExif(file, callback) {
		const id = this.id;
		this.id++;
		this.pending[id] = callback;
		ipcRenderer.send('getExif', {
			id,
			file
		});
	}
}
const ipcWrapper = new IpcWrapper();

class Picture extends React.Component {
	constructor() {
		super();
		this.state = {
			src: 'waiting.svg',
			orientation: null
		};
	}

	render() {
		ipcWrapper.getExif(this.props.file, exif => {
			const orientation = exif && exif.image && exif.image.Orientation && exifImageOrientationMap[exif.image.Orientation];
			this.setState({
				src: this.props.file,
				orientation
			});
		});
		return React.createElement(
			'div', {
				className: 'frame'
			},
			React.createElement(
				'img', {
					src: this.state.src,
					title: path.basename(this.props.file),
					className: this.state.orientation
				}
			)
		);
	}
}

class Page extends React.Component {
	constructor() {
		super();
		this.state = {
			files: []
		};
	}

	render() {
		return React.createElement(
			'div',
			null,
			React.createElement(
				'button', {
					onClick: () => this.openFolder()
				},
				'Open Folder'),
			React.createElement(
				'div',
				null,
				this.state.files.map(file => React.createElement(
					Picture, {
						file,
						key: file
					}
				))
			)
		);
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
					const directory = directories[0];
					return pify(fs.readdir)(directory)
						.then(allFiles => {
							const files = allFiles
								.filter(file => file.match(imageRe))
								.map(file => path.join(directory, file));
							this.setState({
								files
							});
						});
				}
			})
			.catch(err => {
				dialog.showErrorBox(err.code || 'Oops', err.message);
			});
	}
}

ReactDOM.render(
	React.createElement(Page, null),
	document.getElementById('root'));
