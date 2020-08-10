var express					=	require('express.oi');
var child_process			=	require('child_process');
var bodyParser				=	require('body-parser');
var request				    =	require('request');
var async 					= 	require('async');
var fs 						=	require('fs');
var adapterStatus 			=	require('./allAdapter.js');

var downloadAdapterList = function(callback){
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

var getAdapterList = function(callback) {
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

module.exports = (app) => {
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

	this.installed = {};
	this.list = [];
	this.setStatus = function(statusName, status, adapterName){
		this.installed[adapterName].status[statusName] = status;
		app.io.emit('status', this.installed);
	}

	this.loadSettings = () => {
		if(fs.existsSync(__dirname + "/settings/" + name + ".json")){
			this.installed[name].settings = JSON.parse(fs.readFileSync(__dirname + "/settings/" + name + ".json", "utf8"));
			app.io.emit('status', this.installed);
		}
	}

	this.saveSettings = function(data, callback){
		fs.writeFile(__dirname + "/settings/" + data.name + ".json", JSON.stringify(data.settings), 'utf8', function(err){
			if(err){
				adapter.log.error("Die Adapter Einstellungen konnte nicht gespeichert werden!");
				adapter.log.error(err);
				callback(400);
			}else{
				this.installed[data.name].settings = data;
				app.io.emit('status', this.installed);
				adapter.log.info("Die Adaptereinstellungen wurden aktualisiert!");
				callback(200);
			}
		});
	}

	this.restart = function(name, callback){
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

	this.start = (name, callback) => {
		console.log(this);
		if(this.installed[name] && this.installed[name].running == true){
			adapter.log.info(name + " läuft bereits!");
		}else{
			try{
				var name							= name.toLowerCase();
				this.installed[name]							=	new adapterStatus(this.list[name], name);
				this.installed[name]				= {};
				this.installed[name].name			= name;			
				var path							= __dirname + '/adapter/' + name + "/index.js";
				var debugFile						= __dirname + '/log/debug-' + name + '.log';
				this.installed[name].log_file		= fs.createWriteStream( debugFile, {flags : 'w', encoding: 'utf8'});
				this.installed[name].fork			= child_process.fork(path);
				this.setStatus("pid", this.installed[name].fork.pid, name);
				this.installed[name].fork.on('message', (response) => {
	                if(response.log){
	                    this.installed[name].setError(response.log);
	                    adapter.log.info(response.log, name);
	                    this.installed[name].log_file.write(new Date() +":"+ response.log.toString() + '\n');
	                }
	                if(response.info){
	                    this.installed[name].setError(response.info);
						adapter.log.info(response.info, name);
						this.installed[name].log_file.write(new Date() +":"+ response.info.toString() + '\n');
	                }
	                if(response.debug){
	                    this.installed[name].setError(response.debug);
						adapter.log.debug(response.debug, name);
						this.installed[name].log_file.write(new Date() +":"+ response.debug.toString() + '\n');
	                }
	                if(response.warning){
	                    this.installed[name].setError(response.warning);
						adapter.log.warning(response.warning, name);
						this.installed[name].log_file.write(new Date() +":"+ response.warning.toString() + '\n');
	                }
	                if(response.error){
	                    this.installed[name].setError(response.error);
	                    adapter.log.error(response.error, name);
						this.installed[name].log_file.write(new Date() +":"+ response.error.toString() + '\n');
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
								if(body !== '200'){
									adapter.log.error("QuickSwitch [" + adapter.settings.QuickSwitch.ip + ':' + adapter.settings.QuickSwitch.port + "] meldet einen Fehler");
									if(callback){
										callback(body);
									}
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
								if(body !== '200'){
									adapter.log.error("QuickSwitch [" + adapter.settings.QuickSwitch.ip + ':' + adapter.settings.QuickSwitch.port + "] meldet einen Fehler");
									if(callback){
										callback(body);
									}
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
								if(body !== '200'){
									adapter.log.error("QuickSwitch [" + adapter.settings.QuickSwitch.ip + ':' + adapter.settings.QuickSwitch.port + "] meldet einen Fehler");
									if(callback){
										callback(body);
									}
									return;
								}else{
									// adapter.log.info("Erfolgreich an QuickSwitch gesendet");
								}
							}
						});
					}
					if(response.setStatus){
						this.setStatus(response.setStatus.statusName, response.setStatus.status, name);
					}
					if(response.activity){
						console.log("veraltet: response.activity");
						// this.installed[name].status.activity = response.activity;
						// app.io.emit('status', status);
					}
					if(response.statusMessage){
						console.log("veraltet: response.statusMessage");
						// this.installed[name].status.statusMessage = response.statusMessage;
						// app.io.emit('status', status);
					}
					if(response.longStatusMessage){
						console.log("veraltet: response.longStatusMessage");
						// status.adapter[name].status.longStatusMessage = response.longStatusMessage;
						// app.io.emit('status', status);
					}
					if(response.setSettings){
						this.setSettings(response.setStatus.statusName, response.setStatus.status, name);
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
					console.log("disconnect");
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
				console.log(e);
				callback(404);
			}
		}
	}

	this.stop = function(name, callback){
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

	this.action = function(data, callback){
		if(data.protocol == undefined || data.protocol == "undefined"){
	        adapter.log.error("Kein Protocol für das Gerät " + data.name + "|" + data.Raum + " ausgewählt!");
	        callback(400);
			return;
		}
		if(data.protocol.includes(":")){
	        var bla = data.protocol.split(":");
			data.protocol = bla[1];
			var protocol = bla[0];
		}else{
	        var protocol = data.protocol;
		}
		if(!plugins[protocol]){
	        adapter.log.error("Adapter zum schalten nicht installiert: " + protocol + ":" + data.protocol);
	        callback(401);
			return;
		}
		try{
			adapter.log.error("Sende an:" + protocol);
			plugins[protocol].fork.send(data);
	        callback(200);        
	    }catch(err){
	        callback(404);
			adapter.log.error(data);
			adapter.log.error(err);
		}
	}

	this.downloadAdapterList = downloadAdapterList,

	this.getAdapterList = getAdapterList;

	// this.adapterStatus = function(info, name){
	//     info.name = name;
	//     return {
	//         "info": info,
	//         "status": {
	//             status: undefined,
	//             pid: undefined,
	//             statusMessage: undefined,
	//             installedVersion: undefined
	//         },
	//         "errors":[],
	//         "setError": function(err){
	//             var datum =  new Date().toLocaleString();
	//             this.errors.push({"time":datum, "message":err, "source": name});
	//             if(this.errors.length > adapter.settings.maxLogMessages){
	//                 this.errors.splice(0,1);
	//             }
	//         }
	//     }
	// }

	this.remove = function(name, callback){
		stop(name, function(){
			child_process.exec("rm -r " + __dirname + "/adapter/" + name + " && rm " + __dirname + "/settings/" + name + ".json", function(error, stdout, stderr){
				adapter.log.info(name + " wurde entfernt");
				status.adapter[name] = undefined;
				callback("entfernt");
			});
		});
	}
	
	this.install = function(name, callback){
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

	this.installDependencies = function(dependencies, cb){
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

	this.startAll = (callback) => {
		getAdapterList((data)  => {
			fs.readdir("./adapter", (err, files) => {
				for(var index in data.adapter) {
					this.installed[index]							=	new adapterStatus(data.adapter[index], index);
				}
				async.each(files, (name, cb) => {
					this.start(name, function(response){
						cb();
					});
				},function(){
					callback(status);
				});
			});
		});
	}

	this.stopAll = function(callback){
		async.each(plugins, (index, cb) => {
			stop(index.name, (response) => {
				cb();
			});
		}, function(){
			callback(status);
		});
	}
	getAdapterList((data) => {
		this.list = data.adapter;
	});
	return this;
}