/*
*
* Copyright (C) 2011, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

var gplus = require('./lib.js');

exports.sync = function(pi, cb) {
  gplus.getMe(pi.auth, function(err, me){
    if (err) return cb(err);
    if (!me) return cb('No user ID found in profile');

    pi.auth.pid = me.id + '@gplus';
    pi.auth.profile = me;

    var base = 'profile:' + pi.auth.pid + '/self';
    pi.data = {};
    pi.data[base] = [me];
    console.log(pi);
    cb(null, pi);
  });
};
