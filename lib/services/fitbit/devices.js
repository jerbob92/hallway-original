/*
 *
 * Copyright (C) 2011, Singly, Inc.
 * All rights reserved.
 *
 * Please see the LICENSE file for more information.
 *
 */

exports.sync = require('./lib').genericSync(function(pi){
  return 'devices.json';
}, function(pi, data, cb){
  if (!Array.isArray(data) || data.length === 0) return cb();
  for (var i in data) {
    pi.config[data[i].type + '_lastSyncTime'] = data[i].lastSyncTime;
  }
  var base = 'device:' + pi.auth.pid + '/devices';
  var ret = {};
  ret[base] = data;
  cb(null, {
    config: pi.config,
    data: ret
  });
});
