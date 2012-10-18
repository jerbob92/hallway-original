/*
 *
 * Copyright (C) 2011, The Locker Project
 * All rights reserved.
 *
 * Please see the LICENSE file for more information.
 *
 */

exports.sync = require('./lib').genericSync(function(pi){
  return 'devices.json';
}, function(pi, data, cb){
  if (!Array.isArray(data) || data.length === 0) return cb();
  var newConfig = {};
  for (var i in data) {
    var lastSyncTimeKey = data[i].type + '_lastSyncTime';
    newConfig[lastSyncTimeKey] = data[i].lastSyncTime;
  }
  newConfig._devices_ran = true;
  var base = 'device:'+pi.auth.pid+'/devices';
  var ret = {};
  ret[base] = data;
  cb(null, {
    config: newConfig,
    data: ret
  });
});
