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
  lib.getPage(pi, 'flickr.people.getPhotos', 'photo', PER_PAGE, {}, function(err, config, contactsArray) {
    if (err) {
      return callback(err);
    }
    for(var i in photosArray) {
      photosArray[i] = {obj:photosArray[i], timestamp:config.lastUpdate, type:'new'};
    }
    callback(null, photosArray);
  });
}