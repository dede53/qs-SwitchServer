var express					=	require('express.io');
var app						=	express().http().io();
var fork					=	require('child_process').fork;
var bodyParser				=	require('body-parser');
var http					=	require('request');
var adapterLib 				=	require('./adapter-lib.js');
var status					=	{};
var adapter					=	new adapterLib('adapter');
	adapter.settings 		=	process.argv[2];
var plugins					=	{};
var fs 						=	require('fs');
var adapterFunctions		=	require('../app/functions/adapter.js');

app.use( bodyParser.json() );
app.use(bodyParser.urlencoded({ extended: true }));	// for parsing application/x-www-form-urlencoded

app.post('/switch', function(req, res){
	action(req.body)
	res.json(200);
});

app.get('/adapterList', function(req, res){
	getAdapterList(function(data){
		res.json(data);
	});
});

app.io.route('get', {
	"status": function(req){
		req.io.emit('status', status);
	}
});

app.io.route('adapter', {
	get:function(req){
		adapterFunctions.get(function(data){
			req.io.emit('change', new message('get', data));
		});
	},
	remove:function(req){
		adapterFunctions.remove(req.data, function(response){});
	},
	install:function(req){
		adapterFunctions.install(req.data, function(response){});
	},
	restart:function(req){
		restart(req.data, function(response){
			status.adapter[req.data].status = response;
			req.io.emit('status', status);
		});
	},
	start:function(req){
		start(req.data, function(response){
			status.adapter[req.data].status = response;
			req.io.emit('status', status);
		});
	},
	stop:function(req){
		stop(req.data, function(response){
			status.adapter[req.data].status = response;
			req.io.emit('status', status);
		});
	}
});

try{
	app.listen(adapter.settings.port || 4040);
	console.log("Der SwitchServer läuft auf Port:" + (adapter.settings.port || 4040));
}catch(err){
	console.log(err);
}

if(!fs.existsSync(__dirname + "/log")){
	fs.mkdirSync(__dirname + "/log", 0766, function(err){
		if(err){
			console.log("mkdir " + __dirname + "/log: failed: " + err);
		}
	});
}

status.adapter				= {};

// fs.readdir("./adapter",function(err, files){
fs.readdir("./SwitchServer/adapter",function(err, files){
	files.forEach(function(name){
		status.adapter[name]		= {};
		status.adapter[name].name	= name;
		start(name, function(response){
			status.adapter[name].status = response;
		});
	});
});

function restart(name, callback){
	stop(name, function(status){
		callback(status);
		if(status == "gestoppt"){
			start(name, function(status){
				callback(status);
			});
		}
	});
}

function start(name, callback){
	if(plugins[name]){
		console.log(name + " läuft bereits!");
	}else{
		try{
			var name					= name.toLowerCase();
			plugins[name]				= {};
			var path					= __dirname + '/adapter/' + name + "/index.js";
			var debugFile				= __dirname + '/log/debug-' + name + '.log';
			plugins[name].log_file		= fs.createWriteStream( debugFile, {flags : 'w', encoding: 'utf8'});
			plugins[name].fork			= fork(path);
			status.adapter[name].pid	= plugins[name].fork.pid;

			plugins[name].fork.on('message', function(response) {				
				if(response.log){
					plugins[name].log_file.write(new Date() +":"+ response.log.toString() + '\n');
				}
				if(response.setVariable){
					console.log(response.setVariable);
					process.send(response);
				}
				if(response.statusMessage){
					status.adapter[name].statusMessage = response.statusMessage;
					plugins[name].log_file.write(new Date() +":"+ response.statusMessage.toString() + '\n');
				}
			});
			plugins[name].fork.on('error', function(data) {
				console.log("ERROR");
				console.log(data.toString());
				plugins[name].log_file.write(new Date() +":"+ data.toString() + '\n');
			});
			plugins[name].fork.on('disconnect', function() {
				// plugins[name] = undefined;
				// console.log("DISCONNECT");
			});
			plugins[name].fork.on('close', function() {
				// plugins[name] = undefined;
				// console.log("CLOSE");
			});
			plugins[name].log_file.write(new Date() +": Der Adapter wurde gestartet!\n");
			console.log("Adapter "+ name +" wurde gestartet");
			callback("gestartet");
		}catch(e){
			adapter.log.error(e);
			console.log(e);
			callback(404);
		}
	}
}

function stop(name, callback){
	try{
		plugins[name].fork.kill('SIGHUP');
		console.log(name + " wurde gestoppt");
		plugins[name].log_file.write(new Date() +": Der Adapter wurde gestoppt!\n");
		plugins[name] = undefined;
		callback("gestoppt");
	}catch(e){
		console.log(e);
		callback(404);
	}
}

function action(data){
	try{
		if(data.data.protocol.includes(":")){
			var protocol = data.data.protocol.split(":");
			data.data.protocol = protocol[1];
			plugins[protocol[0]].fork.send(data);
		}else{
			plugins[data.data.protocol].fork.send(data);
		}
	}catch(err){
		adapter.log.error(data);
		adapter.log.error(err);
		adapter.log.error("Adapter zum schalten nicht installiert: " + data.protocol);
	}
}

function downloadAdapterList(callback){
	http.get('https://raw.githubusercontent.com/dede53/qs-SwitchServer/master/adapterList.json', function(error, response, body){
		if(error){
			console.log("Die Adapter Liste konnte nicht herrunter geladen werden!");
			console.log(error);
		}else{
			callback(JSON.parse(body));
			fs.writeFile(__dirname + "/temp/adapterList.json", body, 'utf8', function(err){
				if(err){
					console.log("Die Adapter Liste konnte nicht gespeichert werden!");
					console.log(err);
				}
			});
		}
	});
}
function getAdapterList(callback) {
	if(fs.existsSync(__dirname + "/temp/adapterList.json")){
		try{
			var data 				= fs.readFileSync(__dirname + "/temp/adapterList.json", "utf8");
			callback(JSON.parse(data));
		}catch(e){
			downloadAdapterList(function(data){
				callback(data);
			});
		}
	}else{
		downloadAdapterList(function(data){
			callback(data);
		});
	}
}