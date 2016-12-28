'use strict';

const remote = require('electron').remote;
const fs = require('fs');
const path = require('path');
const pify = require('pify');
const React = require('react');
const ReactDOM = require('react-dom');

const dialog = remote.dialog;
const imageRe = /\.(bmp|png|jpeg|jpg|tif|tiff)$/i;

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
					'img', {
						src: file,
						key: file,
						title: path.basename(file)
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
			dialog.showErrorBox(err.code, err.message);
		});
	}
}

ReactDOM.render(
	React.createElement(Page, null),
	document.getElementById('root'));
