/*
*
* Copyright (C) 2012, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

var FitBit = require('fitbit-js');

exports.genericSync = function(pather, cbDone) {
  return function(pi, cb) {
    var fb = FitBit(pi.auth.consumerKey, pi.auth.consumerSecret);
    var path = pather(pi);
    if(!path) return cb(null, pi);
    fb.apiCall('GET', '/user/-/'+path,{ token: {
      oauth_token: pi.auth.token,
      oauth_token_secret: pi.auth.tokenSecret }
    }, function(err, resp, body){
      if (err) return cb(err);
      if (!resp.statusCode === 200) return cb('non-200 status code:' + resp.statusCode, body);
      cbDone(pi, body, cb);
    });
  };
};

// memberSince is the day the user joined FitBit
// lastSyncTime is the last time their device was sync'd (via devices.js)
// ACTIVE_KEY is the current date to sync
exports.dailySync = function(apiPath, item, idrType, idrPath, deviceType) {
  var ACTIVE_KEY = idrPath + '_activeNext';
  var LAST_SYNC_TIME_KEY = deviceType + '_lastSyncTime';
  return this.genericSync(function(pi) {
    if(!pi.config) pi.config = {};
    if(!pi.config.memberSince || !pi.config[LAST_SYNC_TIME_KEY]) {
      // TODO: uncomment this line when either everything has run the devices
      // synclet after this checking as been pushed live, or a migration is run
      // if (!pi.config._devices_ran) pi.config.nextRun = -1;
      return false;
    }
    if(!pi.config[ACTIVE_KEY]) {
      pi.config[ACTIVE_KEY] = new Date(pi.config.memberSince).getTime();
    }
    // don't run ahead of last sync
    if((pi.config[ACTIVE_KEY] > new Date(pi.config[LAST_SYNC_TIME_KEY]).getTime())) return false;
    return apiPath + '/date/'+format(pi.config[ACTIVE_KEY])+'.json';
  }, function(pi, data, cb) {
    if(!data || !data[item]) return cb();
    data.id = format(pi.config[ACTIVE_KEY]); // stub in an id based on the date
    data.at = pi.config[ACTIVE_KEY]; // also fill in
    var next = pi.config[ACTIVE_KEY] + (3600*1000*24); // next run get next day
    if(next < (new Date(pi.config[LAST_SYNC_TIME_KEY]).getTime())){
        pi.config[ACTIVE_KEY] = next; // don't move forward past last sync time!
        if(pi.config[ACTIVE_KEY] < Date.now()) pi.config.nextRun = -1; // force run again
    }
    var base = idrType + ':' + pi.auth.pid + '/' + idrPath;
    var ret = {};
    ret[base] = [data];
    cb(null, {config:pi.config, data:ret});
  });
};

function format(epoch) {
    d = new Date(epoch);
    return ""+d.getFullYear()+'-'+((d.getMonth() < 9 ? '0' : '') + (d.getMonth() + 1))+'-'+((d.getDate() < 10 ? '0' : '') + d.getDate());
}
