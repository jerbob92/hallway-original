/*
*
* Copyright (C) 2011, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

var instagram = require('./lib.js');
var _ = require('underscore');

exports.sync = function(pi, cb) {
  pi.data = {};
  var base = 'photo:' + pi.auth.pid + '/media';
  var arg = {};

  if (pi.config.since) arg.min_timestamp = pi.config.since;
  if (pi.config.mediaNext) arg.uri = pi.config.mediaNext;

  instagram.getMedia(pi, arg, function(err, ret) {
    pi.config.mediaNext = ret.nextUrl;
    pi.data[base] = ret.posts;
    _.extend(pi.config, _.pick(ret, 'since', 'pagingSince', 'nextRun'));
    cb(err, pi);
  });
};
