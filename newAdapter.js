var express					=	require('express.oi');
var child_process			=	require('child_process');
var bodyParser				=	require('body-parser');
var request				    =	require('request');
var async 					= 	require('async');
var fs						=	require('fs');
var adapterLib 				=	require('./adapter-lib.js');
var errors 					= [];
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
var adapter                 =   {};
adapter.settings            =   require('./settings/adapter.json');
adapter.logFile				=	fs.createWriteStream( "./log/debug-adapter.log", {flags : 'w'});
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
var allAdapter = require('./adapterFunctions.js')(app);

allAdapter.startAll();

try{
	app.listen(4041);
	adapter.log.info("Der SwitchServer läuft auf Port:" + (adapter.settings.port || 4040));
	app.io.emit("active", false);
}catch(err){
	adapter.log.error(err);
}
