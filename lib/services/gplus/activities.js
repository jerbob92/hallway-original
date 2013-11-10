/*
*
* Copyright (C) 2011, Singly, Inc.
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

var gdata = require('gdata-js');

var ACTIVITIES_URL = 'https://www.googleapis.com/plus/v1/people/me/activities/public';
var MAX_RESULTS = 100;

exports.sync = function (pi, cb) {
  var client = gdata.clientFromAuth(pi.auth);

  if (!pi.config) {
    pi.config = {};
  }

  if (!pi.config.activities) {
    pi.config.activities = {};
  }

  var params = {
    'maxResults': MAX_RESULTS
  };

  if (pi.config.activities.pageToken) {
    params.pageToken = pi.config.activities.pageToken;
  }

  client.getFeed(ACTIVITIES_URL, params, function (err, result) {
    if (err) {
      return cb(err);
    }

    if (result.nextPageToken) {
      pi.config.activities.pageToken = result.nextPageToken;

      pi.config.nextRun = -1;
    } else {
      delete pi.config.activities.pageToken;
    }

    var activityBase = 'activity:' + pi.auth.pid + '/activities';
    var photoBase = 'photo:' + pi.auth.pid + '/activities';

    pi.data = {};

    pi.data[photoBase] = [];
    pi.data[activityBase] = result.items;

    // Gather up all photos
    result.items.forEach(function (data) {
      if (!data.object.attachments) {
        return;
      }

      var images = data.object.attachments.filter(function (attachment) {
        return attachment.objectType === 'photo';
      });

      if (images.length) {
        images.forEach(function (image) {
          image.published = data.published;
          image.updated = data.updated;

          pi.data[photoBase].push(image);
        });
      }
    });

    cb(err, pi);
  });
};
