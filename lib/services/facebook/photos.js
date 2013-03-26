/*
 *
 * Copyright (C) 2011, The Locker Project
 * All rights reserved.
 *
 * Please see the LICENSE file for more information.
 *
 */

var _ = require('underscore');

var fb = require('./lib.js');

// Modifies the pi.config object
function checkAlbums(pi, callback) {
  fb.getAlbums({
    accessToken : pi.auth.accessToken,
    albumSince  : pi.config.albumSince
  }, function (err, albums) {
    if (err || albums.length === 0) return callback(err, pi);

    var origSince = pi.config.albumSince; // preserve!

    albums.forEach(function (album) {
      if (album.modified > pi.config.albumSince) {
        pi.config.albumSince = album.modified; // Track newest
      }

      album.since = origSince; // What is oldest last known timestamp?

      pi.config.albums.push(album);
    });

    pi.config.nextRun = -1; // There's work to do

    // Fetch the album objects too
    var ids = [];

    albums.forEach(function (album) {
      ids.push(album.object_id);
    });

    fb.getObjects({
      ids: ids,
      accessToken: pi.auth.accessToken
    }, function (err, list) {
      if (list) pi.data['album:' + pi.auth.pid + '/albums'] = list;

      callback(null, pi);
    });
  });
}

exports.sync = function (pi, cb) {
  pi.data = {};
  if (!pi.config.albums) pi.config.albums = [];
  if (!pi.config.albumSince) pi.config.albumSince = 0;


  // If we don't have any albums yet, fetch them
  if (pi.config.albums.length === 0) return checkAlbums(pi, cb);

  // Otherwise, process one
  var album = pi.config.albums.pop();

  var path = '/' + album.object_id + '/photos';
  var params = {
    access_token : pi.auth.accessToken
  };
  if (_.isNumber(album.since)) params.since = album.since; // Timestamp
  if (album.after) params.after = album.after; // Paging cursor

  fb.getDataPage(path, params, function (err, photos, cursor) {
    photos.data.forEach(function(photo) {
      photo._album_id = album.object_id;
    });

    pi.data['photo:' + pi.auth.pid + '/photos'] = photos.data;

    if (cursor) { // More pages
      album.after = cursor;
      pi.config.albums.push(album); // Still working on this one
      pi.config.nextRun = -1;
    } else { // Done with this album
      if (pi.config.albums.length > 0) pi.config.nextRun = -1;
    }

    return cb(err, pi);
  });
};
