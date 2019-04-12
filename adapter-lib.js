var fs					= require('fs');
var request				= require('request');
var util				= require('util');
var events				= require("events");

util.inherits(main, events.EventEmitter);
function main(param){

	this.loadSettings = function(name){
		if(fs.existsSync(__dirname + "/settings/" + name + ".json")){
			var data 				= JSON.parse(fs.readFileSync(__dirname + "/settings/" + name + ".json", "utf8"));
			process.send({"settings": data});
			process.send({"debug": "Einstellungen für " + name + " wurden geladen..", "source": name});
			// Zeitkritisch!!!
			return data;
		}
	}


	if(typeof param == 'object'){
		this.name = param.name.toLowerCase();
		this.settings = param;
		process.send({"settings": param});
	}else{
		this.name = param.toLowerCase();
		this.settings = this.loadSettings(param.toLowerCase());
	}
	process.send({"status": "gestartet"});

	this.setVariable = function(variable, value){
		process.send({"setVariable":{id: variable, status:value}});
	}
	this.setDeviceStatus = function(id, status){
		process.send({"setDeviceStatus":{id: id, status:status}});
	}
	this.setSettings = (settings, forceRestart) => {
		settings.name = this.name;
		process.send({
			forceRestart: forceRestart || false,
			setSettings: {
				name: this.name,
				settings: settings
			}
		});
	}
	var that = this;
	this.log = {
		"info": function(data){
			if(that.settings.loglevel == 1 ){
				try{
					if(typeof data === "object"){
						var data = JSON.stringify(data);
					}else{
						var data = data.toString();
					}
					process.send({"info": data, "source": that.name});
				}catch(e){
					console.log(e);
				}
			}
		},
		"debug": function(data){
			if(that.settings.loglevel <= 2){
				try{
					if(typeof data === "object"){
						var data = JSON.stringify(data);
					}else{
						var data = data.toString();
					}
					process.send({"debug": data, "source": that.name});
				}catch(e){}
			}
		},
		"warning": function(data){
			if(that.settings.loglevel <= 3){
				try{
					if(typeof data === "object"){
						var data = JSON.stringify(data);
					}else{
						var data = data.toString();
					}
					process.send({"warning": data, "source": that.name});
				}catch(e){}
			}
		},
		"error": function(data){
			if(that.settings.loglevel <= 4){
				try{
					if(typeof data === "object"){
						var data = JSON.stringify(data);
					}else{
						var data = data.toString();
					}
					process.send({"error": data, "source": that.name});
				}catch(e){}
			}
		},
		"pure": function(data){
			console.log(data);
		}
    }

    process.on('uncaughtException', (err) => {
        this.log.error("uncaughtException:" + err);
    });

    process.on('message', (data) => {
    	switch(data.type){
    		case "variable":
    			this.emit('variable', data);
    			break;
    		case "alert":
    			this.emit('alert', data);
    			break;
    		case "action":
    			this.emit('action', data);
				if(data.adapter == this.name){
					this.emit(this.name, data);
				}
    			break;
    		default:
    			this.log.error("Fehler: Falscher datentype!");
    			this.log.error(data);
    			break;
    	}
		this.emit("all", data);
    });
}

module.exports = main;