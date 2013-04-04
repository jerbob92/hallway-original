/*
 *
 * Copyright (C) 2013, Singly Inc.
 * All rights reserved.
 *
 * Please see the LICENSE file for more information.
 *
 */

var fb = require('./lib.js');

exports.sync = function (pi, cbDone) {
  var resp = { data: {}, config: {} };

  fb.getStreamLikes({
    id          : pi.auth.profile.id,
    accessToken : pi.auth.accessToken,
    newestObjId : pi.config.newestObjId || 0
  }, function (err, newPosts, newestObjId) {
    if (newPosts && newPosts[0]) resp.config.newestObjId = newestObjId;
    resp.data['post:' + pi.auth.pid + '/stream_likes'] = newPosts;

    cbDone(err, resp);
  });
};

