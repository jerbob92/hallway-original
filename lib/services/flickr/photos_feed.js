/*
*
* Copyright (C) 2011, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

var lib = require('./lib');

var PER_PAGE = 1000;

exports.sync = function (pi, callback) {
  lib.getPage(pi, 'flickr.photos.getContactsPhotos', 'photo', PER_PAGE, {
    'extras': 'description,date_upload,date_taken,last_update,tags,machine_tags,geo'
  }, function (err, config, photosArray) {
    if (err) return callback(err);

    var data = {};

    data['photo:' + pi.auth.pid + '/photos_feed'] = photosArray;

    callback(null, {config: config, data: data});
  });
};
