/*
*
* Copyright (C) 2012, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

var FitBit = require('fitbit-js');

var ONE_DAY = 24 * 60 * 60 * 1000;
// rate limit is 150/hr, so we'll give ourselves a bit of headroom
var MAX_HITS = 145;

function format(epoch) {
    var d = new Date(epoch);
    return ""+d.getFullYear()+'-'+((d.getMonth() < 9 ? '0' : '') + (d.getMonth() + 1))+'-'+((d.getDate() < 10 ? '0' : '') + d.getDate());
}

exports.genericSync = function(pather, cbDone) {
  return function(pi, cb) {
    var fb = FitBit(pi.auth.consumerKey, pi.auth.consumerSecret);
    var path = pather(pi);
    if (!path) return cb(null, pi);
    fb.apiCall('GET', '/user/-/'+path,{ token: {
      oauth_token: pi.auth.token,
      oauth_token_secret: pi.auth.tokenSecret }
    }, function(err, resp, body){
      if (err) return cb(err);
      if (resp.statusCode !== 200) return cb('non-200 status code:' + resp.statusCode, body);
      cbDone(pi, body, cb);
    });
  };
};

// We want to sync recent data first during the initial sync, so we start from
// the last time your devices synced and head backwards day by day towards the
// day you joined. When we get there (and your devices have presumably uploaded
// new data), we move our sync window forward from [joinDate...deviceTime0] to
// [deviceTime0...deviceTime1] and reset the active day to deviceTime0. Rinse
// and repeat.
//
// memberSince is the day the user joined FitBit
// LAST_SYNC_TIME_KEY is the last time their device was sync'd (via devices.js)
// ACTIVE_KEY is the current date to sync
// COUNT_KEY keeps track of hits so we don't go over the rate limit
// WINDOW_*_KEY are the edges of the window we're currently syncing
exports.dailySync = function(apiPath, item, idrType, idrPath, deviceType) {
  var ACTIVE_KEY = idrPath + '_activeNext';
  var WINDOW_BEGIN_KEY = idrPath + '_windowBegin';
  var WINDOW_END_KEY = idrPath + '_windowEnd';
  var COUNT_KEY = idrPath + '_currentRLCount';
  var LAST_SYNC_TIME_KEY = deviceType + '_lastSyncTime';

  return this.genericSync(function(pi) {
    if (!pi.config) pi.config = {};
    if (!pi.config.sync) pi.config.sync = {};
    var sync = pi.config.sync;

    if (!pi.config.memberSince || !pi.config[LAST_SYNC_TIME_KEY]) {
      // If the user just authed, devices may not have synced yet.
      // We need their last upload time, so rerun immediately, hoping it's there
      if (!pi.config._devices_ran) pi.config.nextRun = -1;
      return false;
    }

    if (!pi.config[COUNT_KEY]) pi.config[COUNT_KEY] = 0;

    // The beginning of our window is only missing when we've never run before,
    // so we start from the day you joined Fitbit
    if (!sync[WINDOW_BEGIN_KEY]) {
      sync[WINDOW_BEGIN_KEY] = new Date(pi.config.memberSince).getTime();
    }
    // The end of the window is reset whenever we finish syncing a window.
    if (!sync[WINDOW_END_KEY]) {
      // The end of the new window is the last time your devices synced.
      sync[WINDOW_END_KEY] = new Date(pi.config[LAST_SYNC_TIME_KEY]).getTime();
    }
    // The day we're synching also resets when we finish a window
    if (!sync[ACTIVE_KEY]) {
      // Restart moving backwards from the end of the current window
      sync[ACTIVE_KEY] = sync[WINDOW_END_KEY];
    }

    // When we get earlier than our window, leap the beginning of the new window
    // to the current end and erase the end/active points to be set on the next
    // run. We go one day farther back than our window because we may have
    // synced a partial day before and want to update it.
    if (sync[ACTIVE_KEY] < sync[WINDOW_BEGIN_KEY] - ONE_DAY) {
      sync[WINDOW_BEGIN_KEY] = sync[WINDOW_END_KEY];
      sync[WINDOW_END_KEY] = sync[ACTIVE_KEY] = null;
      return false;
    }

    return apiPath + '/date/'+format(sync[ACTIVE_KEY])+'.json';

  }, function(pi, data, cb) {
    var sync = pi.config.sync;
    pi.config[COUNT_KEY]++;

    if (!data || !data[item]) return cb();

    data.id = format(sync[ACTIVE_KEY]); // stub in an id based on the date
    data.at = sync[ACTIVE_KEY]; // also fill in

    sync[ACTIVE_KEY] -= ONE_DAY;

    if (pi.config[COUNT_KEY] < MAX_HITS) {
      // If we are clear of the rate limit, run again right away
      pi.config.nextRun = -1;
    } else {
      // Otherwise we wait an hour, so the rate limit will be reset
      pi.config[COUNT_KEY] = 0;
    }

    var base = idrType + ':' + pi.auth.pid + '/' + idrPath;
    var ret = {};
    ret[base] = [data];

    return cb(null, {config:pi.config, data:ret});
  });
};
