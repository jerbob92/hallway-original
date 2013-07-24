/*
 *
 * Copyright (C) 2012, Singly, Inc.
 * All rights reserved.
 *
 * Please see the LICENSE file for more information.
 *
 */

var rdio = require('./lib.js');

exports.sync = function (pi, cb) {
  rdio.getActivityStream(pi, function (err, config, updates) {
    if (err) return cb(err);
    var base = 'update:'+pi.auth.pid+'/activity';
    var data = {};
    data[base] = updates;
    cb(null, {config: config, data: data});
  });
};
