/*
*
* Copyright (C) 2012, Singly, Inc.
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

var rdio = require('./lib.js');

exports.sync = function(pi, cb) {
  rdio.getFollowing(pi, function(err, config, following) {
    if (err) return cb(err);
    var base = 'contact:'+pi.auth.pid+'/following';
    var data = {};
    data[base] = following;
    return cb(null, {config: config, data : data});
  });
};
