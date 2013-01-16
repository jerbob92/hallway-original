/*
*
* Copyright (C) 2011, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

var request = require('request');
var util = require('util');

var PHOTOS_LIMIT = 250;

exports.sync = function(pi, cb) {
  if (!pi.config.photosLast) pi.config.photosLast = 0;
  // if no checkins since our last run, no photos then either, bail out
  if (pi.config.photosLast === pi.config.checkinsThrough) return cb(null, {});
  pi.config.photoLast = pi.config.checkinsThrough;

  getPhotos(pi.config, pi.auth.profile.id, pi.auth.accessToken, 0, function(err, photos) {
    var data = {};
    data['photo:' + pi.auth.pid + '/photos'] = photos;
    cb(err, {data:data, config:pi.config});
  });
};

function getPhotos(config, userID, token, offset, callback, photos) {
  if (!photos) photos = [];
  request.get({
    uri:'https://api.foursquare.com/v2/users/self/photos.json?' +
        'limit=' + PHOTOS_LIMIT + '&offset=' + offset +
        '&oauth_token=' + token,
    json:true
  },
  function(err, resp, js) {
    if (err) return callback(err);
    if (resp.statusCode !== 200) {
      return callback(
        new Error("status code " + resp.statusCode + " " + util.inspect(js))
      );
    }
    if (!js || !js.response || !js.response.photos) {
      return callback(
        new Error("missing response.photos: " + util.inspect(js))
      );
    }
    var response = js.response;
    if (!(response.photos && response.photos.items)) {
      return callback(err, photos);
    }
    var newPhotos = response.photos.items;
    photos = photos.concat(newPhotos);
    if (newPhotos && newPhotos.length === PHOTOS_LIMIT) {
      getPhotos(config, userID, token, offset + PHOTOS_LIMIT, callback, photos);
    } else {
      callback(err, photos);
    }
  });
}
