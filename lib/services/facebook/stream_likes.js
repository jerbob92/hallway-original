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

exports.sync = function (pi, cbDone) {
  if (!pi.config.offset) pi.config.offset = 0;

  var resp = {
    data: {},
    config: pi.config
  };

  function finishPaging() {
    resp.config.offset = 0;
    resp.config.lastSyncedId = pi.config.latestId;
    return cbDone(null, resp);
  }

  var arg = {
    accessToken : pi.auth.accessToken
  };
  arg.fql = 'SELECT object_id FROM like' +
            ' WHERE user_id = ' + pi.auth.profile.id +
            ' LIMIT ' + fb.PAGE_SIZE + ' OFFSET ' + pi.config.offset;

  // Get a page of Likes
  fb.getFQL(arg, function (err, likes) {
    if (err) return cbDone(err);

    var ids = _.pluck(likes, 'object_id');
    ids.concat(ids.map(function(id) {
      return [pi.auth.profile.id, id].join('_');
    }));

    // No more data
    if (ids.length === 0) return finishPaging();

    // Save the most recent Liked object
    if (pi.config.offset === 0) resp.config.latestId = ids[0];

    arg = { accessToken: pi.auth.accessToken };
    var params = { ids: ids.join(',') };

    // Fill in the Liked objects
    // NB: If posts with huge volumes of Likes or Comments hurt us, we can limit
    // or shut off those fields.
    // See: https://developers.facebook.com/docs/reference/api/field_expansion/
    fb.getPage(fb.apiUrl(arg, '/', params), function(err, posts) {
      if (err) return cbDone(err);

      resp.data['post:' + pi.auth.pid + '/stream_likes'] = _.values(posts);

      // Crossed into Likes we've seen
      if (_.contains(ids, pi.config.lastSyncedId)) {
        return finishPaging();
      } else {
        resp.config.offset = pi.config.offset + fb.PAGE_SIZE;
        resp.config.nextRun = -1;
      }

      return cbDone(err, resp);
    });
  });
};

