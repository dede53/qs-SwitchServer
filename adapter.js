var express					=	require('express.oi');
var child_process			=	require('child_process');
var bodyParser				=	require('body-parser');
var request				    =	require('request');
var async 					= 	require('async');
var fs						=	require('fs');
var adapterLib 				=	require('./adapter-lib.js');
var status					=	{};
status.adapter 				=	{};
var errors					=	[];
var adapter                 =   {};
adapter.settings            =   require(__dirname + '/settings/adapter.json');
adapter.logFile				=	fs.createWriteStream(__dirname + "/log/debug-adapter.log", {flags : 'w'});
adapter.log = {
    "info": function(data, source){
        if(adapter.settings.loglevel == 1 ){
            setError(data, source);
        }
    },
    "debug": function(data, source){
        if(adapter.settings.loglevel <= 2){
            setError(data, source);
        }
    },
    "warning": function(data, source){
        if(adapter.settings.loglevel <= 3){
            setError(data, source);
        }
    },
    "error": function(data, source){
        if(adapter.settings.loglevel <= 4){
            setError(data, source);
        }
    },
    // Deprected!
    "pure": function(data, source){
        setError(data, source);
    }
};
var app						=	express().http().io();
/*
var options = {
	key: fs.readFileSync('./key.pem'),
	cert: fs.readFileSync('./cert.pem'),
    requestCert: false
}
var app						=	express().https(options).io();
*/
function setError(data, source){
    if(data == undefined){
        return;
    }
    if(typeof data === "object"){
		var data = JSON.stringify(data);
	}else{
        var data = data.toString();
	}
	var datum =  new Date().toLocaleString();
	adapter.logFile.write(datum +":"+ data + "\n");
	console.log(datum +":"+ data);
	errors.push({"time":datum, "message":data, "source": source});
	if(errors.length > adapter.settings.maxLogMessages){
		errors.splice(0,1);
	}
	app.io.emit("log", errors);
	app.io.emit("newLogMessage", {"time":datum, "message":data, "source": source});
}
var plugins					=	{};
var fs 						=	require('fs');

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));


createDir(__dirname + "/settings");
createDir(__dirname + "/log");
createDir(__dirname + "/temp");
createDir(__dirname + "/adapter");

function terminate(code){
	var list = Object.keys(plugins);
	for (var i = 0; i < list.length; i++) {
		stop(list[i], function(status){});
	}
	app.io.emit("active", false);
	process.exit(1);
}

process.on('SIGTERM', terminate);
process.on('SIGINT', terminate);


function createDir(name){
	if(!fs.existsSync(name)){
		fs.mkdirSync(name, "0766", function(err){
			if(err){
				adapter.log.error("mkdir " + name + ": failed: " + err);
			}else{
				adapter.log.info(name + " wurde erstellt");
			}
		});
	}
}

// Können auch alle zusammengelegt werden, wenn req.body.type mitgeliefert wird!! Dann mit if(req.body.type == "action"){...}
// Action
app.post('/action', function(req, res){
	action(req.body, function(status){
        res.status(status).json(status); // .json() entfernen wenn alles stimmt
    });
});
// Variable
app.post('/variable', (req, res) => {
	req.body.type = "variable";
	sendAllAdapters(req.body, (status) => {
		res.status(status).end();
	});
});
// alert
app.post('/alert', (req, res) => {
	req.body.type = "alert";
	sendAllAdapters(req.body, (status) => {
		res.status(status).end();
	});
});

app.delete('/alert', (req, res) => {
       req.body.type = "alert";
       sendAllAdapters(req.body, (status) => {
               res.status(status).end();
       });
});

app.get('/adapterList', function(req, res){
	getAdapterList(function(data){
		res.json(data);
	});
});

app.io.route('get', {
	"status": function(req){
		app.io.emit('status', status);
		req.socket.emit('log', errors);
	},
	"adapterList": function(req){
		getAdapterList(function(data){
			req.socket.emit('adapterList', data);
		});
	}
});

app.io.route('adapter', {
	get:function(req){
		req.socket.emit('change', new message('get', Object.keys(status.adapter)));
	},
	remove:function(req){
		remove(req.data, function(response){
			app.io.emit('status', status);
		});
	},
	install:function(req){
		install(req.data, function(response){});
	},
	update: function(req){
		console.log("Update ausführen:" + req.data);
		stop(req.data, function(response){
			status.adapter[req.data].status.inProcess = true;
			status.adapter[req.data].status.status = response;
			app.io.emit('status', status);
			update(req.data, (error) => {
				if(error == 200){
					start(req.data, function(response){
						status.adapter[req.data].status.inProcess = false;
						status.adapter[req.data].status.status = response;
						app.io.emit('status', status);
					});
				}
			});
		});
	},
	restart:function(req){
		restart(req.data, function(response){
			//status.adapter[req.data].status.status = response;
			//app.io.emit('status', status);
		});
	},
	start:function(req){
		start(req.data, function(response){
			status.adapter[req.data].status.status = response;
			app.io.emit('status', status);
		});
	},
	stop:function(req){
		stop(req.data, function(response){
			status.adapter[req.data].status.status = response;
			app.io.emit('status', status);
		});
	},
	saveSettings: function(req){
		saveSettings(req.data, function(response){
			if(response == 200){
				restart(req.data.name, function(response){
					status.adapter[req.data.name].status.status = response;
					app.io.emit('status', status);
				});
			}
		});
	}
});

app.io.route('SwitchServer', {
	restart: function(req){
		stopAll(function(status){
			app.io.emit('status', status);
			setTimeout(function(){
				startAll(function(status){
					app.io.emit('status', status);
				});
			}, 2000);
		});
	},
	updateAdapterList: function(req){
		downloadAdapterList(function(response){
			for(var index in response.adapter) {
				if(!status.adapter[index]){
					status.adapter[index]							=	new adapterStatus(response.adapter[index], index);
				}else{
					response.adapter[index].name = index;
					status.adapter[index].info = response.adapter[index];
					if(response.adapter[index].version > status.adapter[index].status.installedVersion){
						status.adapter[index].status.updateAvailable = true;
					}
				}

			}
			req.socket.emit('success');
			adapter.log.info("Adapterliste geupdatet!");
			app.io.emit('status', status);
		});
	}
});

startAll(function(status){
	// Nothing
});

try{
	app.listen(adapter.settings.port || 4040);
	adapter.log.info("Der SwitchServer läuft auf Port:" + (adapter.settings.port || 4040));
	app.io.emit("active", false);
}catch(err){
	adapter.log.error(err);
}

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

status.adapter[index]							=	{};
status.adapter[index].info						=	data.adapter[index];
status.adapter[index].info.name					=	index;
status.adapter[index].status					=	new adapterStatus();
status.adapter[index].errors					=	[];
status.adapter[index].setError					=	function(err){
	var datum =  new Date().toLocaleString();
	status.adapter[index].errors.push({"time":datum, "message":err});
	if(status.adapter[index].errors.length > adapter.settings.maxLogMessages){
		status.adapter[index].errors.splice(0,1);
	}
};

return {
    "info": { 								// aus adapterList.json
		name:"",
		version:"",
		shortDescription:"",
		description:"",
    },
    "status": {
        status: undefined,
        pid: undefined,
        statusMessage: undefined,
        installedVersion: undefined
    },
    "settings":{
    }
    "errors":[],
    "setError": function(err){
        var datum =  new Date().toLocaleString();
        this.errors.push({"time":datum, "message":err, "source": name});
        if(this.errors.length > adapter.settings.maxLogMessages){
            this.errors.splice(0,1);
        }
    }
}

******************************************/

function startAll(callback){
	getAdapterList(function(data){
		fs.readdir(__dirname + "/adapter",function(err, files){
			for(var index in data.adapter) {
				status.adapter[index]							=	new adapterStatus(data.adapter[index], index);
			}
			async.each(files, function(name, cb){
				start(name, function(response){
					cb();
				});
			},function(){
				callback(status);
			});
		});
	});
}

function stopAll(callback){
	async.each(plugins, function(index, cb){
		stop(index.name, function(response){
			cb();
		});
	}, function(){
		callback(status);
	});
}

function restart(name, callback){
	stop(name, function(status){
		if(status == "gestoppt"){
            setTimeout(function(){
                start(name, function(status){
                    callback(status);
                });
            }, 1000);
		}else{
			callback(status);
		}
	});
}

function start(name, callback){
	if(plugins[name] && plugins[name].running == true){
		adapter.log.info(name + " läuft bereits!");
	}else{
		try{
			var name					= name.toLowerCase();
			plugins[name]				= {};
			plugins[name].name			= name;			
			var path					= __dirname + '/adapter/' + name + "/index.js";
			var debugFile				= __dirname + '/log/debug-' + name + '.log';
			plugins[name].log_file		= fs.createWriteStream( debugFile, {flags : 'w', encoding: 'utf8'});
			plugins[name].fork			= child_process.fork(path);

			status.adapter[name].status.pid = plugins[name].fork.pid;
			status.adapter[name].status.statusMessage = "";
			plugins[name].fork.on('message', function(response){
                if(response.log){
                    status.adapter[name].setError(response.log);
                    adapter.log.info(response.log, name);
                    plugins[name].log_file.write(new Date() +":"+ response.log.toString() + '\n');
                }
                if(response.info){
                    status.adapter[name].setError(response.info);
					adapter.log.info(response.info, name);
					plugins[name].log_file.write(new Date() +":"+ response.info.toString() + '\n');
                }
                if(response.debug){
                    status.adapter[name].setError(response.debug);
					adapter.log.debug(response.debug, name);
					plugins[name].log_file.write(new Date() +":"+ response.debug.toString() + '\n');
                }
                if(response.warning){
                    status.adapter[name].setError(response.warning);
					adapter.log.warning(response.warning, name);
					plugins[name].log_file.write(new Date() +":"+ response.warning.toString() + '\n');
                }
                if(response.error){
                    status.adapter[name].setError(response.error);
                    adapter.log.error(response.error, name);
					plugins[name].log_file.write(new Date() +":"+ response.error.toString() + '\n');
                }
				if(response.setVariable){
					request.post({
						url:'http://' + adapter.settings.QuickSwitch.ip + ':' + adapter.settings.QuickSwitch.port + '/setVariable',
						form: response.setVariable
					},function( err, httpResponse, body){
						if(err){
							adapter.log.error("Error! \n QuickSwitch ist nicht erreichbar!");
							adapter.log.error(err);
						}else{
							if(httpResponse.statusCode !== 200 && httpResponse.statusCode !== 304){
								adapter.log.error("QuickSwitch [" + adapter.settings.QuickSwitch.ip + ':' + adapter.settings.QuickSwitch.port + "] meldet einen Fehler:");
								adapter.log.error(body);
								return;
							}else{
								// adapter.log.info("Erfolgreich an QuickSwitch gesendet");
							}
						}
					});
					//process.send(response);
				}
				if(response.setDeviceStatus){
					request.post({
						url:'http://' + adapter.settings.QuickSwitch.ip + ':' + adapter.settings.QuickSwitch.port + '/setDeviceStatus',
						form: response.setDeviceStatus
					},function( err, httpResponse, body){
						if(err){
							adapter.log.error("Error! \n QuickSwitch ist nicht erreichbar!");
							adapter.log.error(err);
						}else{
							if(httpResponse.statusCode !== 200 && httpResponse.statusCode !== 304){
								adapter.log.error("QuickSwitch [" + adapter.settings.QuickSwitch.ip + ':' + adapter.settings.QuickSwitch.port + "] meldet einen Fehler");
								adapter.log.error(body);
								return;
							}else{
								// adapter.log.info("Erfolgreich an QuickSwitch gesendet");
							}
						}
					});
					//process.send(response);
				}
				if(response.chatMessage){
					request.post({
						url:'http://' + adapter.settings.QuickSwitch.ip + ':' + adapter.settings.QuickSwitch.port + '/addChatMessage',
						form: response.chatMessage
					},function( err, httpResponse, body){
						if(err){
							adapter.log.error("Error! \n QuickSwitch ist nicht erreichbar!");
							adapter.log.error(err);
						}else{
							if(httpResponse.statusCode !== 200 && httpResponse.statusCode !== 304){
								adapter.log.error("QuickSwitch [" + adapter.settings.QuickSwitch.ip + ':' + adapter.settings.QuickSwitch.port + "] meldet einen Fehler");
								adapter.log.error(body);
								return;
							}else{
								// adapter.log.info("Erfolgreich an QuickSwitch gesendet");
							}
						}
					});
				}
				if(response.status){
					status.adapter[name].status.status = response.status;
					app.io.emit('status', status);
				}
				if(response.statusMessage){
					status.adapter[name].status.statusMessage = response.statusMessage;
					app.io.emit('status', status);
				}
				if(response.longStatusMessage){
					status.adapter[name].status.longStatusMessage = response.longStatusMessage;
					app.io.emit('status', status);
				}
				if(response.settings){
					if(response.settings.version != status.adapter[name].info.version){
						status.adapter[name].status.updateAvailable = true;
					}
					status.adapter[name].settings 					=	response.settings;
					status.adapter[name].status.installedVersion	=	response.settings.version;
				}
				if(response.setSettings){
					saveSettings(response.setSettings, function(anw){
						if(anw == 200 ){
							if(response.forceRestart == true){
								restart(name, function(adapterStatus){
									status.adapter[name].status.status = adapterStatus;
									app.io.emit('status', status);
								});
							}else{
								status.adapter[name].settings = response.setSettings.settings;
								app.io.emit('status', status);
							}
						}
					});
				}
				if(response.action){
					request.get('http://' + adapter.settings.QuickSwitch.ip + ':' + adapter.settings.QuickSwitch.port + '/switch/' + response.action.type + '/' + response.action.id + '/' + response.action.status, function(error, response, body){
						if(error){
							adapter.log.error("Die Adapter Liste konnte nicht herrunter geladen werden!");
							adapter.log.error(error);
						}else{
							adapter.log.debug("Aktion ausgeführt!");
						}
					});
				}
                if(response.alert){
                    request.delete('http://' + adapter.settings.QuickSwitch.ip + ':' + adapter.settings.QuickSwitch.port + '/alert/' + response.alert, function(error, res, body){
                        if(error){
                            adapter.log.error("Alert konnte nicht gelöscht werden!");
                            adapter.log.error(error);
                        }else{
                            adapter.log.debug("Alert gelöscht:" + response.alert);
                        }
                    });
                }
			});
			plugins[name].fork.on('error', function(data) {
				console.log(typeof data);
				console.log(data);
				status.adapter[name].status.pid = undefined;
				status.adapter[name].status.status = "Fehler!";
                status.adapter[name].status.statusMessage = "Der Adapter ist abgestürzt!";
                status.adapter[name].setError("Der Adapter ist abgestürzt!");
				plugins[name].log_file.write(new Date() +": Der Adapter ist abgestürzt!\n");
				adapter.log.error(JSON.stringify(data));
				plugins[name].log_file.write(new Date() +":"+ JSON.stringify(data) + '\n');
				app.io.emit('status', status);
			});
			plugins[name].fork.on('disconnect', function(){
				adapter.log.error("disconnect");
                // status.adapter[name].status.pid = undefined;
                plugins[name].running = false;
				status.adapter[name].status.status = "Fehler!";
                status.adapter[name].setError("Der Adapter läuft nicht (disconnect)");
				status.adapter[name].status.statusMessage = "Der Adapter läuft nicht (disconnect)";
				plugins[name].log_file.write(new Date() +": Der Adapter läuft nicht!\n");
				app.io.emit('status', status);
				
				// plugins[name].log_file.write(new Date() + JSON.stringify(data));
			});
			plugins[name].fork.on('close', function() {
                plugins[name].running = false;
				adapter.log.error("close");
				// status.adapter[name].status.pid = undefined;
				// status.adapter[name].status.statusMessage = "Der Adapter ist abgestürzt! close";
				// plugins[name].log_file.write(new Date() +": Der Adapter ist abgestürzt!\n");
			});
			// plugins[name].fork.stderr.on('data', function(data){
  	// 			console.log('stderr:' + data);
			// });
            status.adapter[name].setError("Der Adapter wurde gestartet!");
			plugins[name].log_file.write(new Date() +": Der Adapter wurde gestartet!\n");
			adapter.log.info("Adapter "+ name +" wurde gestartet");
			plugins[name].running = true;
			status.adapter[name].status.status = "gestartet";
			callback("gestartet");
		}catch(e){
			adapter.log.error(e);
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
		status.adapter[name].status.status = "gestoppt";
		callback("gestoppt");
	}catch(e){
		adapter.log.error(e);
		callback(404);
	}
}

function action(data, callback){
	data.type = "action";
	if(data.protocol == undefined || data.protocol == "undefined"){
        adapter.log.error("Kein Protocol für das Gerät " + data.name + "|" + data.Raum + " ausgewählt!");
        callback(400);
		return;
	}
	if(data.protocol.includes(":")){
        var bla = data.protocol.split(":");
		data.protocol = bla[1];
		data.adapter = bla[0];
	}else{
        data.adapter = data.protocol;
	}
	if(!plugins[data.adapter]){
        adapter.log.error("Adapter zum schalten nicht installiert: " + data.adapter + ":" + data.protocol);
        callback(401);
		return;
	}
	sendAllAdapters(data, (status) => {
		callback(status);
	});
}

function sendAllAdapters(data, callback){
	try{
		for(var id in plugins){
			plugins[id].fork.send(data);
		}
        callback(200);
    }catch(err){
        callback(404);
		adapter.log.error(data);
		adapter.log.error(err);
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
	request.get('https://raw.githubusercontent.com/dede53/qs-SwitchServer/master/adapterList.json', function(error, response, body){
		if(error){
			adapter.log.error("Die Adapter Liste konnte nicht herrunter geladen werden!");
			adapter.log.error(error);
		}else{
			callback(JSON.parse(body));
			createDir(__dirname + "/temp");
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
/**
 * 
 * 				status.adapter[index]							=	{};
				status.adapter[index].info						=	data.adapter[index];
				status.adapter[index].info.name					=	index;
				status.adapter[index].status					=	new adapterStatus();
				status.adapter[index].errors					=	[];
				status.adapter[index].setError					=	function(err){
                    var datum =  new Date().toLocaleString();
                    status.adapter[index].errors.push({"time":datum, "message":err});
                    if(status.adapter[index].errors.length > adapter.settings.maxLogMessages){
                        status.adapter[index].errors.splice(0,1);
                    }
                };
 */
function adapterStatus(info, name){
    info.name = name;
    return {
    	"name": name,
        "info": info,
        "status": {
            status: undefined,
            pid: undefined,
            statusMessage: undefined,
            installedVersion: undefined,
            updateAvailable: false,
            inProcess: false
        },
        "errors":[],
        "setError": function(err){
            var datum =  new Date().toLocaleString();
            this.errors.push({"time":datum, "message":err, "source": name});
            if(this.errors.length > adapter.settings.maxLogMessages){
                this.errors.splice(0,1);
            }
        }
    }
}

function remove(name, callback){
	stop(name, function(){
		child_process.exec("rm -r " + __dirname + "/adapter/" + name + " && rm " + __dirname + "/settings/" + name + ".json", function(error, stdout, stderr){
			adapter.log.info(name + " wurde entfernt");
			status.adapter[name].status = {
	            status: undefined,
	            pid: undefined,
	            statusMessage: undefined,
	            installedVersion: undefined,
	            updateAvailable: false
	        };

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

function update(name, callback){
	var command = "cd "+ __dirname + "/adapter/"+ name +" && git pull";
	adapter.log.error(command);
	child_process.exec(command, function(error, stdout, stderr){
		if(error){
			adapter.log.error("Adapter konnte nicht aktualisiert werden.");
			adapter.log.error(stderr);
			callback(stderr);
			return;
		}
		// neue Versionsnummer in die Einstellungen schreiben
		status.adapter[name].settings.version = status.adapter[name].info.version;
		status.adapter[name].status.updateAvailable = false;
		saveSettings(status.adapter[name], (err) =>{});
		app.io.emit('status', status);
		adapter.log.info(stdout);
		callback(200);
	});
}