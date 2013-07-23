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
  rdio.getSelf(pi.auth, function (err, self) {
    if (err) return cb(err);
    pi.auth.profile = self;
    pi.auth.pid = self.key + '@rdio';
    var base = 'profile:'+pi.auth.pid+'/self';
    var data = {};
    data[base] = [self];
    cb(null, {auth:pi.auth, config:pi.config, data:data});
  });
};
