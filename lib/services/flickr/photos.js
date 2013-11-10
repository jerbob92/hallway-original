/*
*
* Copyright (C) 2011, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

var lib = require('./lib');

var PER_PAGE = 100;

exports.sync = function (pi, callback) {
  lib.getPage(pi, 'flickr.people.getPhotos', 'photo', PER_PAGE, {
    'user_id': 'me',
    'extras': 'description,date_upload,date_taken,last_update,tags,' +
      'machine_tags,geo,url_sq,url_t,url_s,url_q,url_m,url_n,url_z,url_c,' +
      'url_l,url_o'
  }, function (err, config, photosArray) {
    if (err) return callback(err);

    var timezone = pi.auth.profile && pi.auth.profile.timezone;
    var offset = timezone && timezone.offset;

    photosArray.map(function(photo) {
      lib.setTime(photo, offset);
    });

    var data = {};

    data['photo:' + pi.auth.pid + '/photos'] = photosArray;

    callback(null, { config: config, data: data });
  });
};
