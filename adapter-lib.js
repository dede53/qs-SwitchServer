var fs					= require('fs');
var request				= require('request');


module.exports = function(settings){
	this.name = settings;
	this.loadSettings = function(){
			if(fs.existsSync(__dirname + "/settings/" + this.name + ".json")){
				console.log("	Einstellungen für " + this.name + " laden..");
				var data 				= fs.readFileSync(__dirname + "/settings/" + this.name + ".json", "utf8");
				this.settings			= JSON.parse(data);
			}
	}
	this.loadSettings();
	this.setVariable = function(variable, value){
		process.send({setVariable:{id: variable, status:value}});
	}
	that = this;
	this.log = {
		"info": function(data){
			if(that.settings.loglevel == 1 ){
				try{
					if(typeof data === "object"){
						var data = JSON.stringify(data);
					}else{
						var data = data.toString();
					}
					process.send({log: new Date() +":"+ data + '\n'});
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
					process.send({log:new Date() +":"+ data + '\n'});
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
					process.send({log:new Date() +":"+ data + '\n'});
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
					process.send({log:new Date() +":"+ data + '\n'});
				}catch(e){}
			}
		},
		"pure": function(data){
			console.log(data);
		}
	}
}