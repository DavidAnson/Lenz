'use strict';

const remote = require('electron').remote;
const fs = require('fs');
const path = require('path');
const {ExifImage} = require('exif');
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

function getExif(file) {
	return new Promise((resolve, reject) => {
		new ExifImage({image: file}, (error, exif) => {
			if (error) {
				reject(error);
			} else {
				resolve({
					file,
					exif
				});
			}
		});
	});
}

class Picture extends React.Component {
	constructor() {
		super();
		this.state = {
			orientation: null
		};
	}

	render() {
		getExif(this.props.file)
			.then(result => {
				const {file, exif} = result;
				if ((file === this.props.file) && exif.image && exif.image.Orientation) {
					this.setState({orientation: exifImageOrientationMap[exif.image.Orientation]});
				}
			});
		return React.createElement(
			'div', {
				className: 'frame'
			},
			React.createElement(
				'img', {
					src: this.props.file,
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
						.then(files => {
							this.setState({
								files: files.filter(file => file.match(imageRe)).map(file => path.join(directory, file))
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
