'use strict';
var fs = require('fs');
var utils = require(__dirname + '/lib/utils');
var adapter = utils.adapter('hp-ilo');

var pollTimer = null;

function DeleteAllStates()
{	
	adapter.getStates(adapter.namespace + ".fans.*", function (err, states) 
	{
		var toDelete = [];
		for (var id in states) 
		{
			toDelete.push(id);
		}
		deleteStates(toDelete, function() {	});
	});
	adapter.getStates(adapter.namespace + ".temperatures.*", function (err, states) 
	{
		var toDelete = [];
		for (var id in states) 
		{
			toDelete.push(id);
		}
		deleteStates(toDelete, function() {	});
	});
}
			
function deleteStates(states, callback) 
{
	if (!states || !states.length) 
	{
		if (callback) callback();
			return;
	}
	var id = states.pop();
	adapter.delObject(id, function (err) 
	{
		adapter.delState(id, function (err) 
		{
			});         
	});
};	

	
	
adapter.on('stateChange', function (id, state)
{
    if (id && state && !state.ack)
	{
		id = id.substring(adapter.namespace.length + 1);
	}
});

adapter.on('ready', main);

function main() 
{
	adapter.log.info('Ready. Configured HP ILO: ' + adapter.config.ip);
    adapter.subscribeStates('*');
	
	/*
	if (parseInt(adapter.config.interval, 10)) {
		pollTimerChannel = setInterval(pollChannel, parseInt(adapter.config.interval, 10));
		pollTimerVolumeLevel = setInterval(pollVolumeLevel, parseInt(adapter.config.interval, 10));
		pollTimerOnlineStatus = setInterval(pollOnlineStatus, parseInt(adapter.config.interval, 10));
		pollTimerInput = setInterval(pollInputAndCurrentApp, parseInt(adapter.config.interval, 10));
	}
	*/
}
