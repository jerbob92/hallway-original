/*
 *
 * Copyright (C) 2012, The Locker Project
 * All rights reserved.
 *
 * Please see the LICENSE file for more information.
 *
 */

var path = require('path')
  , rdio = require(path.join(__dirname, 'lib.js'));

exports.sync = function (processInfo, cb) {
  var self = {};
  rdio.getSelf(processInfo.auth, function (me) { self = me; }, function (err) {
    if (err) return cb(err);
    processInfo.auth.profile = self;
    cb(null, {data : {self : [self]}, auth : processInfo.auth});
  });
};
