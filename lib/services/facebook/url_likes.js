/*
 *
 * Copyright (C) 2013, Singly Inc.
 * All rights reserved.
 *
 * Please see the LICENSE file for more information.
 *
 */

var _ = require('underscore');
var fb = require('./lib.js');

/*
 * latestUrl contains the most recent URL we know of that the user Liked.
 * lastSyncedUrl contains the most recent URL we captured during a synclet run
 * (including nextRun paging).
 *
 * When we start a run (ie, offset: 0), we record the latestUrl. As we page
 * back, we check for the lastSyncedUrl so that we can stop paging when we cross
 * into URLs we've already seen. Once we finish the run, lastSyncedUrl is set to
 * latestUrl for next time.
 *
 * There is no guarantee that lastSyncedUrl will still exist in the user's
 * Likes, eg. if they user has since disLiked it. In that case, we will rescan
 * the full set of Likes, but unfortunately there's no other data to key off of.
 */
exports.sync = function (pi, cbDone) {
  if (!pi.config.offset) pi.config.offset = 0;

  var resp = {
    data: {},
    config: pi.config
  };

  var arg = {
    accessToken : pi.auth.accessToken
  };
  arg.fql = 'SELECT url FROM url_like' +
            ' WHERE user_id = me()' +
            ' LIMIT ' + fb.SMALL_PAGE_SIZE + ' OFFSET ' + pi.config.offset;

  fb.getFQL(arg, function (err, urls) {
    if (err) return cbDone(err);

    resp.data['url:' + pi.auth.pid + '/url_likes'] = urls;

    if (pi.config.offset === 0 && urls.length > 0) {
      resp.config.latestUrl = urls[0].url;
    }

    var seen = _.chain(urls)
      .pluck('url')
      .contains(pi.config.lastSyncedUrl)
      .value();

    if (urls.length === 0 || seen) { // Done for now
      resp.config.offset = 0;
      resp.config.lastSyncedUrl = pi.config.latestUrl;
    } else {
      resp.config.offset = pi.config.offset + fb.SMALL_PAGE_SIZE;
      resp.config.nextRun = -1;
    }

    cbDone(err, resp);
  });
};

