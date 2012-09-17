/*
*
* Copyright (C) 2011, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

var path = require('path');
var lib = require('./lib');
var async = require('async');

var PER_PAGE = 1000;
exports.sync = function(pi, callback) {
  
  if (!pi.config.photofeedThrough) pi.config.photofeedThrough = 0;
  var idThrough = pi.config.photofeedThrough;
  var photos = [];
  
  lib.getPage(pi, 'flickr.photos.getContactsPhotos', 'photo', PER_PAGE, {}, function(err, config, photosArray) {
    if (err) {
      return callback(err);
    }
    async.forEach(photosArray, function(photo) {
      if (photo.id > idThrough) {
        idThrough = photo.id;
        photos.push(photo);
      }
    }, function(err) {
      pi.config.photofeedThrough = idThrough;
      var data = {};
      data['photo:'+pi.auth.pid+'/photofeed'] = photos;
      callback(null, {data:data});
    });
  });
}