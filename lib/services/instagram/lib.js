/*
*
* Copyright (C) 2011, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

var request = require('request');
var async = require('async');
var url = require('url');
var _ = require('underscore');

var base = "https://api.instagram.com/v1/";

var PAGE_SIZE = 100;

exports.getSelf = function(pi, cbEach, cbDone) {
  var arg = {};
  arg.access_token = pi.auth.token && pi.auth.token.access_token;
  arg.path = '/users/self';
  getOne(arg, function(err, self){
    if (err || !self || !self.id) return cbDone(err);
    cbEach(self);
    cbDone();
  });
};

exports.getId = function(pi, cbDone) {
  var arg = {};
  arg.access_token = pi.auth.token && pi.auth.token.access_token;
  var path = pi.type;
  if(path == 'user') path = 'users';
  if(path == 'photo') path = 'media';
  arg.path = '/'+path+'/'+pi.id;
  getOne(arg, cbDone);
};

exports.getMedia = function(pi, arg, cbDone) {
  arg.access_token = pi.auth.token && pi.auth.token.access_token;
  arg.path = '/users/self/media/recent';
  getPage(arg, pi.config.pagingSince, cbDone);
};

exports.getFollows = function(pi, arg, cbDone) {
  arg.access_token = pi.auth.token && pi.auth.token.access_token;
  arg.path = '/users/self/follows';
  getPage(arg, null, cbDone);
};

exports.getFeed = function(pi, arg, cbDone) {
  arg.access_token = pi.auth.token && pi.auth.token.access_token;
  arg.path = '/users/self/feed';
  getPage(arg, pi.config.pagingSince, cbDone);
};

// just get one block of recent ones
exports.getMediaRecent = function(pi, arg, cb) {
  arg.access_token = pi.auth.token && pi.auth.token.access_token;
  arg.path = '/users/self/media/recent';
  getOne(arg, cb);
};
exports.getFeedRecent = function(pi, arg, cb) {
  arg.access_token = pi.auth.token && pi.auth.token.access_token;
  arg.path = '/users/self/feed';
  getOne(arg, cb);
};

function getOne(arg, cb) {
  if (!arg || !arg.path) return cb("no path");
  var api = url.parse(base + arg.path);
  delete arg.path;
  api.query = arg;
  request.get({uri:url.format(api), json:true}, function(err, res, body) {
    if (err || !res) return cb(err);
    if (res.statusCode !== 200) return cb("status code " + res.statusCode);
    if (!body || !body.meta) {
      return cb("invalid response: " + JSON.stringify(body));
    }
    if (body.meta.code !== 200) return cb(JSON.stringify(body.meta));
    cb(null, body.data);
  });
}

function getPage(arg, max, cbDone) {
  if (!arg) return cbDone("no arg");

  if (!arg.count) arg.count = PAGE_SIZE;

  // compose the uri if none
  if (!arg.uri) {
    if (!arg.path) return cbDone("no uri or path given");
    var api = url.parse(base + arg.path);
    delete arg.path;
    api.query = arg;
    arg.uri = url.format(api);
  }
  request.get({uri:arg.uri, json:true}, function(err, res, body) {
    if (err || !res) return cbDone(err);
    if (res.statusCode !== 200) return cbDone("status code " + res.statusCode);
    if (!body || !body.meta) {
      return cbDone("invalid response: " + JSON.stringify(body));
    }
    if (body.meta.code !== 200) return cbDone(JSON.stringify(body.meta));

    if (!max) max = 0;
    var timestamps = _.pluck(body.data, 'created_time');
    var maxTimestamp = _.max(timestamps);
    max = _.max([max, maxTimestamp]);

    // we can stop if the latest item previously seen is on this page
    // this is needed to handle /users/self/feed (see feed.js)
    var since = arg.min_timestamp;
    if (since && since <= maxTimestamp && since > _.min(timestamps)) {
      body.pagination = false;
    }

    var ret = {
      posts: body.data
    };
    if (body.pagination && body.pagination.next_url &&
        body.pagination.next_url !== arg.uri) {
      ret.nextUrl = body.pagination.next_url;
      ret.nextRun = -1;
      ret.pagingSince = max;
    } else {
      ret.since = max;
    }
    cbDone(null, ret);
  });
}
