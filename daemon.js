#!/usr/bin/env node
var child_process 			= require('child_process');
var daemon = require("daemonize2").setup({
	main: "adapter.js",
	name: "SwitchServer",
	pidfile: "SwitchServer.pid"
});

daemon.on('error', function(error){
	console.log("Weitere Informationen sind in den Dateien in ./log und vielleicht ./SwitchServer/log zu finden!");
	console.log(error);
});

switch (process.argv[2]) {
	case "start":
		daemon.start();
		break;
	case "stop":
		daemon.stop();
		break;
	case 'kill':
		daemon.kill();
		break;
	case 'restart':
		daemon.stop(function(err) {
			daemon.start();
		});
		break;
	case 'update':
		daemon.stop(function(err) {
			child_process.exec('git pull', function(error, stdout, stderr){
				if(error){
					console.log(error);
				}else{
					console.log(stdout);
					daemon.start();
				}
			});
		});
		break;
    case 'status':
		var pid = daemon.status();
		if(pid){
			console.log('Daemon running. PID: ' + pid);
		}else{
			console.log('Daemon is not running.');
		}
		break;
	default:
		console.log("Usage: [start|stop|kill|restart|update|status]");
}