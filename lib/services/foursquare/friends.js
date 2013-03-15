/*
*
* Copyright (C) 2011, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

var async = require('async');
var request = require('request');
var url = require('url');
var util = require('util');
var _ = require('underscore');

var PAGE_SIZE = 100;
var MULTI_SIZE = 5;

exports.sync = function(pi, callback) {
  if (!pi.config) pi.config = {};
  if (!pi.config.offset) pi.config.offset = 0;

  request.get('https://api.foursquare.com/v2/users/self/friends.json', {
    qs: {
      oauth_token : pi.auth.accessToken,
      limit       : PAGE_SIZE,
      offset      : pi.config.offset
    },
    json: true
  }, function(err, resp, js) {
    if (err) return callback(err);
    if (resp.statusCode !== 200) {
      return callback(
        new Error("status code " + resp.statusCode + " " + util.inspect(js))
      );
    }
    if (!js || !js.response ||
       !js.response.friends || !js.response.friends.items) {
      return callback(
        new Error("missing response.friends.items: " + util.inspect(js))
      );
    }
    var friends = js.response.friends.items.map(function(item) {
      return item.id;
    });

    // get the rich versions of each friend
    downloadUsers(pi.auth, friends, function(err, contacts) {
      if (err) return callback(err);

      var resp = {data: {}, config: {}};
      resp.data['contact:' + pi.auth.pid + '/friends'] = contacts;

      if (contacts.length === 0) {
        resp.config.offset = 0;
      } else {
        resp.config.offset = pi.config.offset + PAGE_SIZE;
        resp.config.nextRun = -1;
      }

      callback(err, resp);
    });
  });
};

// multi-fetcher
function downloadUsers(auth, users, callback) {
  if (users.length === 0) return callback(null, []);

  var groups = [];
  while (users.length > 0) {
    groups.push(users.slice(0, MULTI_SIZE));
    users = users.slice(MULTI_SIZE);
  }

  async.map(groups, function(group, callback) {
    return fetchGroup(auth, group, callback);
  }, function(err, groups) {
    callback(err, _.flatten(groups));
  });
}

function fetchGroup(auth, group, callback) {
  var segments = group.map(function(id) {
    return '/users/' + id;
  });

  request.get('https://api.foursquare.com/v2/multi', {
    qs: {
      oauth_token      : auth.accessToken,
      requests         : segments.join(',')
    },
    json             : true
  }, function(err, response, multi) {
    if (err) return callback(err);

    var responses = multi && multi.response && multi.response.responses;
    if (!responses) {
      return callback(
        new Error('Unexpected user batch response: ' + util.inspect(multi))
      );
    }

    var users = _.chain(responses)
      .map(function(r) {
        return r && r.response && r.response.user;
      })
      .compact()
      .value();

    return callback(err, users);
  });
}
