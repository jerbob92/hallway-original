/*
*
* Copyright (C) 2011, Singly, Inc. 
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

var fb = require('./lib.js');

exports.sync = function(pi, cb) {
  var data = {};
  var myID = pi.auth.pid.split('@')[0];
  var base = 'post:' + pi.auth.pid + '/feed';
  var baseSelf = base + '_self';
  var baseOthers = base + '_others';

  var args = {
    id          : 'me',
    type        : 'feed',
    limit       : 200,
    accessToken : pi.auth.accessToken
  };

  if (!pi.config) pi.config = {};
  if (typeof pi.config.since === 'undefined') pi.config.since = 0;

  if (pi.config.paging) {
    args.until = pi.config.pagingMax;
  }

  // by always passing `since` we can stop paging back when no data is returned
  if (pi.config.since) args.since = pi.config.since;

  fb.getPostPage(args, function(err, posts){
    if(err) return cb(err);
    if(!Array.isArray(posts.data)) return cb('No posts array');

    data[base]       = posts.data;
    data[baseSelf]   = [];
    data[baseOthers] = [];

    var newest = pi.config.newest || pi.config.since || 0;
    var oldest;
    posts.data.forEach(function(post){
      if (post.updated_time > newest) newest = post.updated_time;
      if (!oldest || post.created_time < oldest) oldest = post.created_time;

      // Sort my posts from everyone else's
      if (post.from && post.from.id === myID) {
        data[baseSelf].push(post);
      } else {
        data[baseOthers].push(post);
      }
    });

    var auth = {accessToken : pi.auth.accessToken};
    fb.getPostPhotos(auth, posts, function(err, photos) {
      if(photos) data['photo:' + pi.auth.pid + '/home_photos'] = photos;

      if (posts.data.length !== 0 || oldest > pi.config.since) {
        // we want the next run to include entries before the oldest entry
        pi.config = {
          paging    : true,
          pagingMax : oldest - 1,
          newest    : newest,
          since     : pi.config.since,
          nextRun   : -1
        };
      } else {
        // no data was returned so paging stops
        pi.config = {
          paging : false,
          since  : newest
        };
      }

      cb(null, {data: data, config: pi.config});
    });
  });
};
