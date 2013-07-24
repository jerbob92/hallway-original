/*
 *
 * Copyright (C) 2011, Singly, Inc. 
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
  resp.config.firstSync = pi.config.firstSync;
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
    if (nextUrl) {
      // if first time syncing, return special '2' to prioritize syncing
      resp.config.nextRun = (resp.config.firstSync) ? -1 : 2;
    }else{
      if(!resp.config.firstSync) resp.config.firstSync = Date.now(); // when done paging flag
    }
    cb(err, resp);
  });
};
