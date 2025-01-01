'use strict';

const {shell} = require('electron');
const packageJson = require('./package.json');

function openExternal() {
	const {event} = window;
	event.preventDefault();
	shell.openExternal(event.target.href);
}

const groups = [
	[
		'large',
		packageJson.name
	],
	['space', ''],
	[
		'normal',
		`Version ${packageJson.version}`,
		`by ${packageJson.author.name}`,
		`<a href="${packageJson.author.url}" onclick="${openExternal.name}()">${packageJson.author.url}</a>`
	],
	['space', ''],
	[
		'small',
		`Electron: ${process.versions.electron}`,
		`Chrome: ${process.versions.chrome}`,
		`Node.js: ${process.versions.node}`
	]
];

document.write('<div>');
groups.forEach(group => {
	const className = group.shift();
	group.forEach(item => document.write(`<p class="${className}">${item}</p>`));
});
document.write('</div>');

document.addEventListener('keydown', () => {
	const {event} = window;
	if (event.key === 'Escape') {
		window.close();
	}
});
