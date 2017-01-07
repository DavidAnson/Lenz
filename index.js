'use strict';

const {ipcRenderer, remote} = require('electron');
const fs = require('fs');
const path = require('path');
const pify = require('pify');
const React = require('react');
const ReactDOM = require('react-dom');
const ipc = require('./ipc.js');

const dialog = remote.dialog;
const getExifIpc = ipc.createClient(ipcRenderer, 'getExif');
const imageRe = /\.(bmp|gif|png|jpeg|jpg|jxr|tif|tiff|webp)$/i;
const exifImageOrientationMap = {
	1: 'rotate-none',
	3: 'rotate-flip',
	6: 'rotate-cw',
	8: 'rotate-ccw'
};

class Picture extends React.Component {
	constructor() {
		super();
		this.state = {
			stage: 'loading',
			orientation: null
		};
	}

	render() {
		if (this.state.stage === 'loading') {
			getExifIpc(this.props.file, exif => {
				const orientation = exif && exif.image && exif.image.Orientation && exifImageOrientationMap[exif.image.Orientation];
				this.setState({
					stage: 'preview',
					orientation
				});
			});
		}
		const children = [];
		const pushImage = props => {
			children.push(React.createElement('img', props));
		};
		if (this.state.stage === 'loading') {
			pushImage({src: 'waiting.svg'});
		} else if (this.state.stage === 'preview') {
			pushImage({src: 'waiting.svg'});
			pushImage({
				src: this.props.file,
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
				src: this.props.file,
				title: path.basename(this.props.file),
				className: this.state.orientation
			});
		} else if (this.state.stage === 'error') {
			pushImage({src: 'warning.svg'});
		}
		return React.createElement(
			'div', {
				className: 'frame'
			},
			...children
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
