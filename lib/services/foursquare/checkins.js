/*
*
* Copyright (C) 2011, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

var request = require('request');
var _ = require('underscore');

var util = require('util');

var PAGE_SIZE = 100;
var FIRST_SYNC_PAGE_SIZE = 250;

exports.sync = function(pi, cb) {
  if (!pi.config) pi.config = {};

  var lastSync = pi.config.lastSync || 0;
  var cursor   = pi.config.cursor; // In the middle of paging, if present
  // Page ASAP during first sync, then save effort
  var pageSize = (lastSync > 0) ? PAGE_SIZE : FIRST_SYNC_PAGE_SIZE;

  var query = {
    limit           : pageSize,
    oauth_token     : pi.auth.accessToken,
    v               : '20130318'
  };
  if (cursor) query.beforeTimestamp = cursor;

  request.get('https://api.foursquare.com/v2/users/self/checkins', {
    qs: query,
    json: true
  }, function(err, response, body) {
    if (err) return cb(err);
    if (response.statusCode !== 200) {
      return cb(
        new Error('Bad HTTP status ' + 200 + '. ' + util.inspect(checkins))
      );
    }
    var checkins = body && body.response && body.response.checkins;
    if (!checkins) {
      return cb(new Error('No checkins in response. ' + util.inspect(body)));
    }
    checkins = checkins.items || [];

    var resp = {
      config : {},
      data   : {}
    };

    var newCheckins = checkins.filter(function(checkin) {
      return checkin.createdAt > lastSync;
    });
    resp.data['checkin:' + pi.auth.pid + '/checkins'] = newCheckins;

    var times = _.pluck(checkins, 'createdAt');

    // Track the latest checkin we know of.
    // When we finish paging, we'll start again here.
    var latestNewTime = _.max(times);
    var latestKnown = pi.config.latestKnown || 0;
    resp.config.latestKnown = _.max([latestNewTime, latestKnown]);

    // Check if we've crossed into checkins we already have
    if (checkins.length === 0 || newCheckins.length < checkins.length) {
      resp.config.cursor = null; // Done with this window
      resp.config.lastSync = resp.config.latestKnown;
    } else {
      resp.config.cursor = _.min(times);
      resp.config.nextRun = -1; // Still paging
    }

    return cb(null, resp);
  });
};
