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

  fb.getUrlLikes({
    id          : "me()",
    accessToken : pi.auth.accessToken,
    newestUrl   : pi.config.newestUrl || ''
  }, function (err, newUrls) {
    if (newUrls && newUrls[0]) resp.config.newestUrl = newUrls[0];
    resp.data['url:' + pi.auth.pid + '/url_likes'] = newUrls;

    cbDone(err, resp);
  });
};

