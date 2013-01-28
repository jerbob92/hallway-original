/*
*
* Copyright (C) 2013, Singly Inc.
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

var instagram = require('./lib.js');

exports.sync = function(pi, cb) {
  pi.data = {};
  var base = 'photo:' + pi.auth.pid + '/feed';
  var posts = pi.data[base] = [];
  var arg = {};

  if(pi.config.since) arg.min_id = pi.config.since;
  if(pi.config.at) arg.min_timestamp = pi.config.at;

  function poser(post){
    posts.push(post);
    if(post.created_time > (pi.config.at || 0)) {
      pi.config.at = post.created_time;
      pi.config.since = post.id;
    }
  }

  instagram.getFeed(pi, arg, poser, function(err) {
    if(posts.length > 0 || !pi.config.at) return cb(err, pi);
    // There's a nasty bug, since instagram doesn't support min_timestamp on
    // feed yet, and it seems if the min_id given is invalid (deleted), it
    // returns empty! So internally getFeed validates min_timestamp
    var params = {min_timestamp: pi.config.at};
    instagram.getFeed(pi, params, poser, function(err) {
      cb(err, pi);
    });
  });
};
