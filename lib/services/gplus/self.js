/*
*
* Copyright (C) 2011, Singly, Inc.
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

var gdata = require('gdata-js');

var PROFILE_URL = 'https://www.googleapis.com/plus/v1/people/me';

exports.sync = function (pi, cb) {
  var client = gdata.clientFromAuth(pi.auth);

  client.getFeed(PROFILE_URL, {}, function (err, result) {
    if (err) {
      return cb(err);
    }

    pi.auth.pid = result.id + '@gplus';
    pi.auth.profile = result;

    var base = 'contact:' + pi.auth.pid + '/self';

    pi.data = {};
    pi.data[base] = [result];

    cb(null, pi);
  });
};
