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

  fb.getPageLikes({
    id          : "me()",
    accessToken : pi.auth.accessToken,
    since       : pi.config.pageLikesSince || 0
  }, function (err, newPages, newSince) {
    resp.data['page:' + pi.auth.pid + '/page_likes'] = newPages;
    resp.config.pageLikesSince = newSince;

    cbDone(err, resp);
  });
};

