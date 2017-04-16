var express					=	require('express.io');
var app						=	express().http().io();
var child_process			=	require('child_process');
var bodyParser				=	require('body-parser');
var http					=	require('request');
var async 					= 	require('async');
var adapterLib 				=	require('./adapter-lib.js');
var status					=	{};
var adapter					=	new adapterLib('adapter');
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

app.get('/status', function(req, res){
	// getAdapterList(function(data){
		res.send(200);
		console.log(status);
	// });
});

app.io.route('get', {
	"status": function(req){
		req.io.emit('status', status);
	},
	"adapterList": function(req){
		getAdapterList(function(data){
			req.io.emit('adapterList', data);
		});
	}
});

app.io.route('adapter', {
	get:function(req){
		adapterFunctions.get(function(data){
			req.io.emit('change', new message('get', data));
		});
	},
	remove:function(req){
		remove(req.data, function(response){
			status.adapter[req.data].status.status = response;
			req.io.emit('status', status);
		});
	},
	install:function(req){
		install(req.data, function(response){
			setTimeout(function(){
				status.adapter[req.data].status.status = response;
				req.io.emit('status', status);
			}, 5000);
		});
	},
	restart:function(req){
		restart(req.data, function(response){
			status.adapter[req.data].status.status = response;
			req.io.emit('status', status);
		});
	},
	start:function(req){
		start(req.data, function(response){
			status.adapter[req.data].status.status = response;
			req.io.emit('status', status);
		});
	},
	stop:function(req){
		stop(req.data, function(response){
			status.adapter[req.data].status.status = response;
			req.io.emit('status', status);
		});
	},
	saveSettings: function(req){
		saveSettings(req.data, function(response){
			if(response == 200){
				restart(req.data.name, function(response){
					status.adapter[req.data.name].status.status = response;
					req.io.emit('status', status);
				});
			}
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

status.adapter 					=	{};

getAdapterList(function(data){
	fs.readdir("./SwitchServer/adapter",function(err, files){
		for(var index in data.adapter) {
			status.adapter[index]							=	{};
			status.adapter[index].info						=	data.adapter[index];
			status.adapter[index].info.name					=	index;
			status.adapter[index].status					=	new adapterStatus();
		}
		files.forEach(function(name){
			start(name, function(response){
				status.adapter[name].status.status = response;
			});
		});
	});
});

/******************************************
{
	info:{
		name:"",
		version:"",
		shortDescription:"",
		description:"",
	},
	status:{
		status:"",
		pid:"",
		statusMessage:"",
		installedVersion:""
	},
	settings:{
		loglevel:"",
		arduinos:[],

	}
}

******************************************/

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
	if(plugins[name] && plugins[name].running){
		adapter.log.info(name + " läuft bereits!");
	}else{
		try{
			var name					= name.toLowerCase();
			plugins[name]				= {};
			var path					= __dirname + '/adapter/' + name + "/index.js";
			var debugFile				= __dirname + '/log/debug-' + name + '.log';
			plugins[name].log_file		= fs.createWriteStream( debugFile, {flags : 'w', encoding: 'utf8'});
			plugins[name].fork			= child_process.fork(path);

			status.adapter[name].status.pid = plugins[name].fork.pid; 
			status.adapter[name].status.statusMessage = "";
			plugins[name].fork.on('message', function(response) {				
				if(response.log){
					adapter.log.info(response.log);
					plugins[name].log_file.write(new Date() +":"+ response.log.toString() + '\n');
				}
				if(response.setVariable){
					process.send(response);
				}
				if(response.statusMessage){
					status.adapter[name].status.statusMessage = response.statusMessage;
					app.io.broadcast('status', status);
					plugins[name].log_file.write(new Date() +":"+ response.statusMessage.toString() + '\n');
				}
				if(response.settings){
					status.adapter[name].settings 					=	response.settings;
					status.adapter[name].status.installedVersion	=	response.settings.version;
				}
			});
			plugins[name].fork.on('error', function(data) {
				status.adapter[name].status.pid = undefined;
				status.adapter[name].status.statusMessage = "Der Adapter ist abgestürzt!";
				plugins[name].log_file.write(new Date() +": Der Adapter ist abgestürzt! error\n");
				adapter.log.error(data.toString());
				plugins[name].log_file.write(new Date() +":"+ data.toString() + '\n');
			});
			plugins[name].fork.on('disconnect', function() {
				// status.adapter[name].status.pid = undefined;
				// status.adapter[name].status.statusMessage = "Der Adapter ist abgestürzt!";
				// plugins[name].log_file.write(new Date() +": Der Adapter ist abgestürzt!\n");
			});
			plugins[name].fork.on('close', function() {
				// status.adapter[name].status.pid = undefined;
				// status.adapter[name].status.statusMessage = "Der Adapter ist abgestürzt! close";
				// plugins[name].log_file.write(new Date() +": Der Adapter ist abgestürzt!\n");
			});
			plugins[name].log_file.write(new Date() +": Der Adapter wurde gestartet!\n");
			adapter.log.info("Adapter "+ name +" wurde gestartet");
			plugins[name].running = true;
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
		plugins[name].log_file.write(new Date() +": Der Adapter wurde gestoppt!\n");
		plugins[name].running = false;
		adapter.log.info(name + " wurde gestoppt");
		status.adapter[name].status.pid = undefined;
		status.adapter[name].status.statusMessage = undefined;
		callback("gestoppt");
	}catch(e){
		adapter.log.error(e);
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

function saveSettings(data, callback){
	fs.writeFile(__dirname + "/settings/" + data.name + ".json", JSON.stringify(data.settings), 'utf8', function(err){
		if(err){
			adapter.log.error("Die Adapter Einstellungen konnte nicht gespeichert werden!");
			adapter.log.error(err);
			callback(400);
		}else{
			adapter.log.info("Die Adaptereinstellungen wurden aktualisiert!");
			callback(200);
		}
	});
};

function downloadAdapterList(callback){
	http.get('https://raw.githubusercontent.com/dede53/qs-SwitchServer/master/adapterList.json', function(error, response, body){
		if(error){
			adapter.log.error("Die Adapter Liste konnte nicht herrunter geladen werden!");
			adapter.log.error(error);
		}else{
			callback(JSON.parse(body));
			if(!fs.existsSync(__dirname + "/temp")){
				fs.mkdirSync(__dirname + "/temp", 0766, function(err){
					if(err){
						console.log("mkdir " + __dirname + "/temp: failed: " + err);
					}else{
						adapter.log.info(__dirname + "/temp wurde erstellt");
					}
				});
			}
			fs.writeFile(__dirname + "/temp/adapterList.json", body, 'utf8', function(err){
				if(err){
					adapter.log.error("Die Adapter Liste konnte nicht gespeichert werden!");
					adapter.log.error(err);
				}else{
					adapter.log.info("Die adapterliste wurde aktualisiert!");
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

function adapterStatus(){
	return {
		status: undefined,
		pid: undefined,
		statusMessage: undefined,
		installedVersion: undefined
	}
}

function remove(name, callback){
	stop(name, function(){
		child_process.exec("rm -r " + __dirname + "/adapter/" + name + " && rm " + __dirname + "/settings/" + name + ".json", function(error, stdout, stderr){
			adapter.log.info(name + " wurde entfernt");
			status.adapter[name].status = new adapterStatus();
			status.adapter[name].settings = {};
			callback("entfernt");
		});
	});
}

function install(name, callback){
		var url = "git clone https://github.com/dede53/qs-" + name + ".git " + __dirname + "/adapter/" + name;
		adapter.log.error(url);
		child_process.exec(url, function(error, stdout, stderr){
			if(error){
				adapter.log.error("Adapter konnte nicht installiert werden.");
				adapter.log.error(stderr);
				callback(stderr);
				return;
			}
			adapter.log.info(stdout);
			try{
				var package = fs.readFileSync(__dirname + '/adapter/' + name + '/package.json');
				package = JSON.parse(package);
			}catch(e){
				adapter.log.error("Fehler in der package.json von " + name);
				callback(404);
			}

			var dependencies = Object.keys(package.dependencies);
			if(dependencies.length > 0 ){
				adapter.log.debug(name + ": Abhängigkeiten installieren!");
				installDependencies(dependencies, function(response){
					if(response != 200){
						adapter.log.error("Abhängigkeiten konnten nicht installiert werden!");
						adapter.log.error(response);
						return;
					}
					if(fs.existsSync(__dirname + "/adapter/" + name + "/" + name + ".json.example")){
						adapter.log.info(name + ": config verschieben!");
						fs.createReadStream(__dirname + "/adapter/" + name + "/" + name + ".json.example")
							.pipe(fs.createWriteStream(__dirname + "/settings/" + name + ".json"))
							.on('error', function(err){
								adapter.log.error(err);
							});			
							adapter.log.info(stdout);
							adapter.log.debug(name + " installiert!");
						start(name, function(status){
							callback(status);
						});
					}else{
						adapter.log.debug(name + " installiert!");
						start(name, function(status){
							callback(status);
						});
					}
				});
			}else{
				if(fs.existsSync(__dirname + "/adapter/" + name + "/" + name + ".json.example")){
					adapter.log.debug(name + ": config verschieben!");
					adapter.log.debug(__dirname + "/adapter/" + name + "/" + name + ".json.example");
					adapter.log.debug(__dirname + "/settings/" + name + ".json");
					fs.createReadStream(__dirname + "/adapter/" + name + "/" + name + ".json.example")
						.pipe(fs.createWriteStream(__dirname + "/settings/" + name + ".json"))
						.on('error', function(err){
							adapter.log.error(err);
						});	
						adapter.log.info(stdout);
						adapter.log.debug(name + " installiert!");
						start(name, function(status){
							callback(status);
						});
				}else{
					adapter.log.debug(name + " installiert!");
					start(name, function(status){
						callback(status);
					});
				}
			}

		});
}

function installDependencies(dependencies, cb){
	adapter.log.info(dependencies.length + " Abhängigkeiten müssen installiert werden:");
	async.each(dependencies,
		function(deb, callback){
			child_process.exec("npm install " + deb, function(error, stdout, stderr){
				if(error){
					adapter.log.info("npm install " + deb + ": nicht erfolgreich!");
					adapter.log.error(error);
				}else{
					adapter.log.info("npm install " + deb + ": erfolgreich!");
					callback();
				}
			});
		},
		function(err){
			if(err){
				adapter.log.error(err);
				cb(400);
			}else{
				cb(200);
			}
		}
	);
}