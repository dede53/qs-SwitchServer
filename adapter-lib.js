var fs					= require('fs');
var request				= require('request');


module.exports = function(param){

	this.loadSettings = function(name){
		if(fs.existsSync(__dirname + "/settings/" + name + ".json")){
			process.send({"log": "Einstellungen für " + name + " laden.."});
			var data 				= JSON.parse(fs.readFileSync(__dirname + "/settings/" + name + ".json", "utf8"));
			process.send({"settings": data});
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

	this.setVariable = function(variable, value){
		process.send({setVariable:{id: variable, status:value}});
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
					process.send({"log": data});
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
					process.send({"log": data});
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
					process.send({"log": data});
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
					process.send({"log": data});
				}catch(e){}
			}
		},
		"pure": function(data){
			console.log(data);
		}
	}
}