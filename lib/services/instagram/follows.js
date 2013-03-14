/*
*
* Copyright (C) 2011, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

var instagram = require('./lib.js');

exports.sync = function(pi, cb) {
  var resp = {
    config: {},
    data : {}
  };
  var contacts = resp.data['contact:' + pi.auth.pid + '/follows'] = [];
  instagram.getFollows(pi, {uri: pi.config.followsNext}, function(item) {
    contacts.push(item);
  }, function(err, nextUrl) {
    resp.config.followsNext = nextUrl;
    if (nextUrl) resp.config.nextRun = -1;
    cb(err, resp);
  });
};
