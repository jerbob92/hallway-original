/*
*
* Copyright (C) 2013, Singly Inc.
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

/*
 * Instagram's /feed endpoint doesn't accept a min_timestamp, but has an issue
 * where if the max_id you send them doesn't exist (eg, it was deleted), they
 * return an empty set. So, the lib (getPage) verifies that for us while it's
 * paging. So that we can relinquish control of the worker, the cursor URL
 * (feedNext) is stored in the config. As long as we're paging, the timestamp of
 * the latest seen post is irrelevant. Once we're done, we start over from the
 * top (/feed is reverse chronological) and only go back as far as the timestamp
 * we've saved.
 */

var instagram = require('./lib.js');
var _ = require('underscore');

exports.sync = function(pi, cb) {
  if (!pi.config) pi.config = {};

  pi.data = {};
  var base = 'photo:' + pi.auth.pid + '/feed';

  var arg = {};
  if (pi.config.feedNext)  arg.uri = pi.config.feedNext;
  if (pi.config.feedSince) arg.min_timestamp = pi.config.feedSince;

  instagram.getFeed(pi, arg, function(err, ret) {
    if(!ret) return cb(err);
    pi.config.feedNext = ret.nextUrl;
    if (ret.since) pi.config.feedSince = ret.since;
    pi.data[base] = ret.posts;
    _.extend(pi.config, _.pick(ret, 'since', 'pagingSince', 'nextRun'));
    cb(err, pi);
  });
};
