/*
 *
 * Copyright (C) 2011, The Locker Project
 * All rights reserved.
 *
 * Please see the LICENSE file for more information.
 *
 */

var fb = require('./lib.js');

exports.sync = function(pi, cb) {
  if (!pi.config) pi.config = {};

  var resp = {
    data: {},
    config: {}
  };
  var base = 'contact:'+pi.auth.pid+'/friends';
  var contacts = resp.data[base] = [];

  var arg = {
    id          : "me",
    accessToken : pi.auth.accessToken,
    uri         : pi.config.nextUrl
  };

  fb.getFriends(arg, function(friend){
    contacts.push(friend);
  }, function(err, nextUrl) {
    resp.config.nextUrl = nextUrl;
    if (nextUrl) resp.config.nextRun = -1;
    cb(err, resp);
  });
};
