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

var PER_PAGE = 500;
exports.sync = function(pi, callback) {
  
  if (!pi.config.photosThrough) pi.config.photosThrough = 0;
  var idThrough = pi.config.photosThrough;
  var photos = [];
  
  lib.getPage(pi, 'flickr.people.getPhotos', 'photo', PER_PAGE, {'user_id': 'me'}, function(err, config, photosArray) {
    if (err) {
      return callback(err);
    }
    
    async.forEach(photosArray, function(photo) {
      if (photo.id > idThrough) {
        idThrough = photo.id;
        photos.push(photo);
      }
    }, function(err) {
      pi.config.photosThrough = idThrough;
      var data = {};
      data['photo:'+pi.auth.pid+'/photos'] = photos;
      callback(null, {data:data});
    });
  });
}