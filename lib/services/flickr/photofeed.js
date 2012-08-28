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

var PER_PAGE = 1000;
exports.sync = function(pi, callback) {
  lib.getPage(pi, 'flickr.photos.getContactsPhotos', 'photo', PER_PAGE, {}, function(err, config, photosArray) {
    if (err) {
      return callback(err);
    }
    var data = {};
    console.log(require('util').inspect(photosArray, false, null));
    data['photo:'+pi.auth.pid+'/photofeed'] = photosArray;
    callback(null, {data:data});
  });
}