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
  pi.data = {};
  var base = 'photo:' + pi.auth.pid + '/media';
  var posts = pi.data[base] = [];
  var arg = {};

  if (pi.config.since) arg.min_timestamp = pi.config.since;
  if (pi.config.mediaNext) arg.uri = pi.config.mediaNext;

  instagram.getMedia(pi, arg, function(post) {
    posts.push(post);
    if (post.created_time > (pi.config.since || 0)) {
      pi.config.since = post.created_time;
    }
  }, function(err, nextUrl) {
    pi.config.mediaNext = nextUrl;
    if (nextUrl) pi.config.nextRun = -1;
    cb(err, pi);
  });
};
