/*
*
* Copyright (C) 2011, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

var fb = require('./lib.js');

exports.sync = function(pi, cb) {
  var data = {};
  var myID = pi.auth.pid.match(/(\d+)@/)[1];
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

  if (pi.config.paging) {
    args.until = pi.config.pagingMax;
  }

  if (pi.config.since) args.since = pi.config.since;

  fb.getPostPage(args, function(err, posts){
    if(err) return cb(err);
    if(!Array.isArray(posts.data)) return cb('No posts array');

    data[base]       = posts.data;
    data[baseSelf]   = [];
    data[baseOthers] = [];

    var newest = pi.config.newest || 0;
    var oldest = posts.data[0] ? posts.data[0].updated_time : 0;
    posts.data.forEach(function(post){
      if (post.updated_time > newest) newest = post.updated_time;
      if (post.updated_time < oldest) oldest = post.updated_time;

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

      if (posts.data.length !== 0 && posts.paging && posts.paging.next) {
        // we want the next run to include entries before the oldest entry
        pi.config.paging = true;
        pi.config.pagingMax = oldest - 1;
        pi.config.newest = newest;
        pi.config.nextRun = -1;
      } else if (pi.config.paging) {
        pi.config.paging = false;
        pi.config.since = newest;
      }

      cb(null, {data: data, config: pi.config});
    });
  });
};
