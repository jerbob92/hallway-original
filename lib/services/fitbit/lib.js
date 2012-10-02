/*
*
* Copyright (C) 2012, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

var OAlib = require('oauth').OAuth;

exports.genericSync = function(pather, cbDone) {
  return function(pi, cb) {
    var OA = new OAlib(null, null, pi.auth.consumerKey, pi.auth.consumerSecret, '1.0', null, 'HMAC-SHA1', null, {'Accept': '*/*', 'Connection': 'close'});
    var path = pather(pi);
    if(!path) return cb(null, pi);
    // need foo:bar to make fitbit api work right otehrwie no params appends ? and get BROKEN erro!
    var url = 'http://api.fitbit.com/1/user/-/'+path;
    OA.get(url, pi.auth.token, pi.auth.tokenSecret, function(err, body){
      if(err) return cb(err);
      var js;
      try{ js = JSON.parse(body); }catch(E){ return cb(err); }
      cbDone(pi, js, cb);
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
