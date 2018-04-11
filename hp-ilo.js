'use strict';
var fs = require('fs');
var utils = require(__dirname + '/lib/utils');
var adapter = new utils.Adapter('hp-ilo');
var request = require('request');
var pollTimer = null;
var init = 0;
var ErrorCount = 0;

function ILO_Request(url, next){
   url = "https://"+adapter.config.ip+url;
   request.timeout = 60000;
   request({
      "timeout": request.timeout,
      "rejectUnauthorized": false, 
      "url": url, 
      "method": "GET", 
      "headers":
      {
         "Content-Type": "application/json",
         "Accept": "application/json",
         "Authorization": "BASIC " + new Buffer(adapter.config.username+":"+adapter.config.password).toString('base64')
      }
   }, function(err, response, body)
   {
	if (err) 
	{
		adapter.log.error('Request error: ' + err + ' , URL: ' + url);
	}
    else if (response.statusCode != 200) 
	{
		adapter.log.debug('Response: ' + response.statusCode+": "+url);
	}
    else if (next) 
	{
		next(JSON.parse(body));
	}
   });
}	
	
function Read_ILO()
{
   ILO_Request("/rest/v1/Chassis/1/Thermal", function(body){
      if (init++ === 0)      {
        for (var f in body.Fans) {
             var fan = body.Fans[f];
			 
             adapter.createState('', 'fans', fan.FanName.replace(/ /g, '_'), {
                name: fan.FanName.replace(/ /g, '_'), 
                desc: 'Fan ' + fan.PhysicalContext + ' speed in %',
                type: 'number', 
                def:  0,
                read: true,
                write: false,
                role: 'state'  
			});         
        }
		
        for (var t in body.Temperatures) 
		{
			var temp = body.Temperatures[t];
			if (temp.CurrentReading > 0)
			{
				adapter.createState('', 'temperatures', temp.Name.replace(/ /g, '_'), {
					name: temp.PhysicalContext, 
					desc: 'Temperature ' + temp.PhysicalContext + ' in degrees',
					type: 'number', 
					def:  0,
					read: true,
					write: false,
					role: 'state'  
				});  
            
				adapter.createState('', 'temperatures', temp.Name.replace(/ /g, '_') + "_max", {
					name: temp.PhysicalContext + "_max", 
					desc: 'Max value of temperature ' + temp.PhysicalContext + ' in degrees for alarm notification',
					type: 'number', 
					def:  temp.LowerThresholdNonCritical,
					read: true,
					write: true,
					role: 'state'  
				});  
			}
        }
      }
      ErrorCount = 0;
		for (var f in body.Fans) 
		{
            var fan = body.Fans[f];
            adapter.setState('fans.' + fan.FanName.replace(/ /g, '_'), fan.CurrentReading);
        }
        
        for (var t in body.Temperatures) 
		{
            var temp = body.Temperatures[t];
			if (temp.CurrentReading > 0)
			{
				adapter.setState('temperatures.' + temp.Name.replace(/ /g, '_'), temp.CurrentReading, true);
				adapter.setState('temperatures.' + temp.Name.replace(/ /g, '_') + '_max', Math.round(temp.CurrentReading + 10), true);
				// FEHLERBENACHRICHTIGUNG: Send_Notification(temp);
			}
        }

        if (ErrorCount > 0)
		{
        }
		else
		{
            //benachrichtigung_gesendet = 0;
        }
    }, !true);	
};
	
function Send_Notification(temp){
    
    var max = getState(instanz + pfad + temp.Name.replace(/ /g, '_') + "_max");
    var aktuell = temp.CurrentReading;
 
    if (aktuell > max.val){
        ErrorCount++;
        if (benachrichtigung_per_email === true & benachrichtigung_gesendet === 0){
            sendTo("email", {
                to:      emailadresse,
                subject: "iLO Temperatur Warnung!!",
                text:    "Aktuelle Temperatur " + temp.Name + " = " + aktuell + " Grad Celsius."
            });
            benachrichtigung_gesendet = 1;
        }
      
        if (benachrichtigung_per_telegramm === true & benachrichtigung_gesendet === 0){
            sendTo("telegram.0", "send", {
                text: ("iLO Temperatur Warnung!! Aktuelle Temperatur " + temp.Name + " = " + aktuell + " Grad Celsius.") // um die Nachricht nur an Teilnehme xy zu schicken folgendes anfügen , chatId: 'xxx'
            });
            benachrichtigung_gesendet = 1;
        } 
    }
}
	
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
	if (adapter.config.pushover == true)
	{
		adapter.log.debug('Pushover? ' + adapter.config.pushover);
		adapter.log.debug('Pushover Instance: ' + 'pushover.' + adapter.config.pushover_instance);
	}
	if (adapter.config.telegram == true)
	{
		adapter.log.debug('Telegram? ' + adapter.config.telegram);
		adapter.log.debug('Telegram Instance: ' + 'telegram.' + adapter.config.telegram_instance);
	}
	if (adapter.config.email == true)
	{
		adapter.log.debug('E-Mail? ' + adapter.config.email);
		adapter.log.debug('E-Mail Instance: ' + 'email.' + adapter.config.email_instance)
	}
	Read_ILO();
    adapter.subscribeStates('*');
	pollTimer = setInterval(Read_ILO, 120000);
}
