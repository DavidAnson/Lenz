'use strict';

module.exports.createServer = (ipc, api, callback) => {
	ipc.on(api, (event, args) => {
		const {id, arg} = args;
		callback(arg, reply => {
			event.sender.send(api, {
				id,
				arg: reply
			});
		});
	});
};

module.exports.createClient = (ipc, api) => {
	const pending = {};
	let id = 0;

	ipc.on(api, (event, args) => {
		const {id, arg} = args;
		pending[id](arg);
		delete pending[id];
	});

	return (arg, callback) => {
		id++;
		pending[id] = callback;
		ipc.send(api, {
			id,
			arg
		});
	};
};
