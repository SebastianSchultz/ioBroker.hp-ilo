'use strict';
var fs = require('fs');
var utils = require('@iobroker/adapter-core');
var adapter = new utils.Adapter('hp-ilo');
var request = require('request');
var pollTimer = null;
var init = 0;
var ErrorCount = 0;
var PushoverNotificationSent = false;
var TelegramNotificationSent = false;
var EmailNotificationSent = false;

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
			adapter.setObjectNotExists("info.ILO_Status", {
			type: "state",
			common: {
			name: "ILO Status",
				type: "string",
				role: "state",
				read: true,
				write: false
			},
			native: {}
			});		
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
            
				adapter.setObjectNotExists("temperatures." + temp.Name.replace(/ /g, '_') + "_max", {
					type: "state",
					common: {
					name: temp.PhysicalContext + "_max", 
					type: "number",
					role: "state",
					read: true,
					write: true
					}
				});		
			}
        }
      }
      ErrorCount = 0;
		for (var f in body.Fans) 
		{
            var fan = body.Fans[f];
            adapter.setState('fans.' + fan.FanName.replace(/ /g, '_'), fan.CurrentReading), true;
        }
        
        for (var t in body.Temperatures) 
		{
            var temp = body.Temperatures[t];
			if (temp.CurrentReading > 0)
			{
				adapter.log.debug('Current Reading > 0');
				adapter.setState('temperatures.' + temp.Name.replace(/ /g, '_'), temp.CurrentReading, true);
				Send_Notification(temp);
			}
        }

        if (ErrorCount > 0)
		{
			adapter.setState("info.ILO_Status", true, true);
        }
		else
		{
			adapter.setState("info.ILO_Status", false, true);
			var PushoverNotificationSent = false;
			var TelegramNotificationSent = false;
			var EmailNotificationSent = false;
        }
    }, !true);	
};
	
function Send_Notification(temp)
{
	var SendToPushover = adapter.config.pushover;
	var SendToTelegram = adapter.config.telegram;
	var SendToEmail = adapter.config.email;
	var PushoverInstance =  '';
	var TelegramInstance =  '';
	var EmailInstance =  '';
	var EmailRecipient ='';
	if (SendToPushover)
	{
		var InstanceID = adapter.config.pushover_instance;
		if (InstanceID)
		{
			PushoverInstance = 'pushover.' + adapter.config.pushover_instance;
			adapter.log.debug('Send Notifications to Pushover Instance "' + PushoverInstance + '"');
		}
		else
		{
			adapter.log.error('Send Notifications to Pushover Instance in adapter config enabled but no instance defined!');
			SendToPushover = false;
		}
	}
	if (SendToTelegram)
	{
		var InstanceID = adapter.config.telegram_instance;
		if (InstanceID)
		{
			TelegramInstance = 'telegram.' + adapter.config.telegram_instance;
			adapter.log.debug('Send Notifications to Telegram Instance "' + TelegramInstance + '"');
		}
		else
		{
			adapter.log.error('Send Notifications to Telegram Instance in adapter config enabled but no instance defined!');
			SendToTelegram = false;
		}
	}
	if (SendToEmail)
	{
		var InstanceID = adapter.config.email_instance;
		if (InstanceID)
		{
			EmailInstance = 'email.' + adapter.config.email_instance;
			EmailRecipient = adapter.config.email_recipient;
			adapter.log.debug('Send Notifications to E-Mail Instance "' + EmailInstance + '" to recipient "' + EmailRecipient + '"');
		}
		else
		{	
			adapter.log.error('Send Notifications to E-Mail Instance in adapter config enabled but no instance defined!');
			SendToEmail = false;
		}	
	}
		
    adapter.getState('temperatures.' + temp.Name.replace(/ /g, '_') + '_max', function (err, state) 
	{
		if (state)
		{
			var max = state.val;
			var aktuell = temp.CurrentReading;
			adapter.log.debug('State "temperatures.' + temp.Name.replace(/ /g, '_') + '_max' + '" for notification. Actual Value: ' + aktuell +  ',  Max Value: ' + max);
			if (aktuell > max)
			{
				adapter.log.debug('Limit reached for State "temperatures.' + temp.Name.replace(/ /g, '_') + '_max' + '" for notification. Actual Value: ' + aktuell +  ',  Max Value: ' + max);
				ErrorCount++;
				if (SendToPushover === true & PushoverNotificationSent === false)
				{
					adapter.log.debug('Starting pushover notification...');
					adapter.sendTo(PushoverInstance, {
						message: "Aktuelle Temperatur " + temp.Name + " = " + aktuell + " Grad Celsius.",
						title: "ILO Temperatur Warnung!",
						priority: 0
					});
					PushoverNotificationSent = true;
				}

				if (SendToTelegram === true & TelegramNotificationSent === false)
				{
					adapter.log.debug('Starting telegram notification...');
					adapter.sendTo(TelegramInstance, "send", {
						text: ("ILO Temperatur Warnung!! Aktuelle Temperatur " + temp.Name + " = " + aktuell + " Grad Celsius.")
					});
					TelegramNotificationSent = true;
				} 

				if (SendToEmail === true & EmailNotificationSent === false)
				{
					adapter.log.debug('Starting email notification...');
					adapter.sendTo(EmailInstance, {
						to:      EmailRecipient,
						subject: "ILO Temperatur Warnung!!",
						text:    "Aktuelle Temperatur " + temp.Name + " = " + aktuell + " Grad Celsius."
					});
					EmailNotificationSent = true;
				}
			}
			
		}
	});
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
	Read_ILO();
    adapter.subscribeStates('*');
	pollTimer = setInterval(Read_ILO, 120000);
}
