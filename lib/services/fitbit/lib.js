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
// _memberSince is the day the user joined FitBit
// LAST_SYNC_TIME_KEY contains last time their device was sync'd (via devices.js)
// sync contains an object describing the current state of the synclet:
//   begin: The beginning of the current window being synched
//   end: The end of the current window being synched
//   hits: How many times we've hit the API so we can avoied the rate limit
//   active: The day currently being synched
exports.dailySync = function(apiPath, item, idrType, idrPath, deviceType) {
  var LAST_SYNC_TIME_KEY = '_' + deviceType + '_lastSyncTime';

  return this.genericSync(function(pi) {
    if (!pi.config) pi.config = {};
    if (!pi.config.sync) pi.config.sync = {};
    // We modify pi directly so it persists to the post-fetch callback
    var sync = pi.config.sync;

    if (!pi.config._memberSince || !pi.config[LAST_SYNC_TIME_KEY]) {
      // If the user just authed, devices may not have synced yet.
      // We need their last upload time, so rerun immediately, hoping it's there
      if (!pi.config._devices_ran) pi.config.nextRun = -1;
      return false;
    }

    if (!sync.hits) sync.hits = 0;

    // The beginning of our window is only missing when we've never run before,
    // so we start from the day you joined Fitbit
    if (!sync.begin) sync.begin = new Date(pi.config._memberSince).getTime();

    // The end of the window is cleared whenever we finish syncing a window.
    // The end of the new window is the last time your devices synced.
    if (!sync.end) sync.end = new Date(pi.config[LAST_SYNC_TIME_KEY]).getTime();

    // The day we're synching also resets when we finish a window.
    // Restart, moving backwards from the end of the current window.
    if (!sync.active) sync.active = sync.end;

    // When we get earlier than our window, leap the beginning of the new window
    // to the current end and erase the end/active points to be set on the next
    // run. We go one day farther back than our window because we may have
    // synced a partial day before and want to update it.
    if (sync.active < sync.begin - ONE_DAY) {
      sync.begin = sync.end;
      sync.end = sync.active = null;
      return false;
    }

    return apiPath + '/date/' + format(sync.active) + '.json';

  }, function(pi, data, cb) {
    if (!data || !data[item]) return cb();

    var newConfig = {};
    var sync = newConfig.sync = pi.config.sync;
    sync.hits++;

    // The entry's ID and at are the date we're syncing
    data.id = format(sync.active);
    data.at = sync.active;

    // Step back in time one day
    sync.active -= ONE_DAY;

    if (sync.hits < MAX_HITS) {
      // If we are clear of the rate limit, run again right away
      newConfig.nextRun = -1;
    } else {
      // Otherwise we wait an hour, so the rate limit will be reset
      sync.hits = 0;
    }

    var base = idrType + ':' + pi.auth.pid + '/' + idrPath;
    var ret = {};
    ret[base] = [data];

    return cb(null, {
      config: newConfig,
      data: ret
    });
  });
};
