var fs						=	require('fs');
var adapterStatus = function(data, name){

	var path							= __dirname + '/adapter/' + name + "/index.js";
	var debugFile						= __dirname + '/log/debug-' + name + '.log';
	
	this.settings = {},
	this.status = {
		pid: "",
		name: name,
		activity: "",
		statusMessage: "",
		installedVersion: "",
		availableVersion: data.version,
		description: data.decription,
		hasWebpage:"",
		inProcess: false
	},
	this.logFile = fs.createWriteStream( debugFile, {flags : 'w', encoding: 'utf8'});
	this.fork;
	this.log = {
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
	}
}

module.exports = adapterStatus;