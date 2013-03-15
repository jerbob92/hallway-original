/*
 *
 * Copyright (C) 2011, The Locker Project
 * All rights reserved.
 *
 * Please see the LICENSE file for more information.
 *
 */

var fs = require('fs');
var request = require('request');
var async = require('async');
var url = require('url');
var path = require('path');
var twitterClient = require(path.join(__dirname, 'twitter_client.js'));
var logger = require('logger').logger('twitter-lib');

var PAGE_SIZE = 100;

exports.getMe = function(pi, cbEach, cbDone) {
  var arg = {};
  arg.path = '/account/verify_credentials.json';
  arg.token = pi.auth.token;
  getOne(pi.tc, arg, function(err, me) {
    if (me) cbEach(me);
    cbDone(err);
  });
};

exports.contactSync = function(type, pi, cbDone) {
  if (!pi.config) pi.config = {};

  var client = new twitterClient(pi.auth.consumerKey, pi.auth.consumerSecret);
  client.token = pi.auth.token; // Passed to getUsers

  var arg = {
    path: '/' + type + '/ids.json',
    token: client.token,
    stringify_ids: true,
    count: PAGE_SIZE
  };

  var cursor = type + 'Cursor';
  if (pi.config[cursor]) arg.cursor = pi.config[cursor];

  getOne(client, arg, function(err, userIDs) {
    if (err) return cbDone(err);

    getUsers(client, userIDs.ids, function(err, users) {
      if (err) return cbDone(err);

      var resp = {
        config: {},
        data: {}
      };

      var base = 'contact:' + pi.auth.profile.id + '@twitter/'  +  type;
      resp.data[base] = users;

      resp.config[cursor] = userIDs.next_cursor; // Twitter returns 0 at end
      if (userIDs.next_cursor > 0) resp.config.nextRun = -1;

      cbDone(null, resp);
    });
  });
};

function getUsers(client, userIDs, cbDone) {
  client.apiCall('GET', '/users/lookup.json', {
    token: client.token,
    user_id: userIDs.join(','),
    include_entities: false
  }, cbDone);
}

// get your home timeline, screen_name has to be me
exports.getTimeline = function(pi, arg, cbDone) {
  if (!arg.screen_name) return cbDone("missing screen_name");
  arg.path = '/statuses/home_timeline.json';
  arg.token = pi.auth.token;
  arg.token = pi.auth.token;
  getPage(pi.tc, arg, cbDone);
};

exports.getDirectMessages = function(sent, pi, arg, cbDone) {
  arg.path = '/direct_messages' + (sent ? '/sent' : '') + '.json';
  arg.token = pi.auth.token;
  getPage(pi.tc, arg, cbDone);
};

exports.syncDirectMessages = function(name, pi, cb) {
  pi.tc = new twitterClient(pi.auth.consumerKey, pi.auth.consumerSecret);

  var resp   = {data:{}, config:{}};
  var since  = 1;
  var max    = 0;
  var newest = 0;

  var newestName = name + 'MessagesNewest';
  var sinceName  = name + 'MessagesSince';
  var maxName    = name + 'MessagesMax';

  // if existing since, start from there
  if (pi.config && pi.config[newestName]) newest = pi.config[newestName];
  if (pi.config && pi.config[sinceName])  since  = pi.config[sinceName];
  if (pi.config && pi.config[maxName])    max    = pi.config[maxName];

  var arg = {
    screen_name : pi.auth.profile.screen_name,
    since_id    : since
  };

  if (max > 0) arg.max_id = max; // we're paging down results

  exports.getDirectMessages((name === 'sent'), pi, arg, function(err, js) {
    if (err) return cb(err);
    if (!Array.isArray(js)) return cb("no array");

    var messages = [];
    js.forEach(function(item){
      if (item.id > newest) newest = item.id + 10; // js not-really-64bit crap, L4M30
      if (item.id < max || max === 0) max = item.id;
      messages.push(item);
    });

    if (js.length <= 1 || max <= since) {
      since = newest; // hit the end, always reset since to the newest known
      max = 0; // only used when paging
    }

    var base = 'message:' + pi.auth.profile.id + '@twitter/direct_messages';
    resp.data[base] = messages;

    resp.config[newestName] = newest;
    resp.config[sinceName]  = since;
    resp.config[maxName]    = max;

    if (max > 1) resp.config.nextRun = -1; // run again if paging

    cb(err, resp);
  });
};

// should work for anyone, get their tweets
exports.getTweets = function(pi, arg, cbDone) {
  if (!arg.screen_name) return cbDone("missing screen_name");
  arg.path = '/statuses/user_timeline.json';
  arg.include_rts = true;
  arg.token = pi.auth.token;
  getPage(pi.tc, arg, cbDone);
};

// duh
exports.getMentions = function(pi, arg, cbDone) {
  if (!arg.screen_name) return cbDone("missing screen_name");
  arg.path = '/statuses/mentions_timeline.json';
  arg.token = pi.auth.token;
  getPage(pi.tc, arg, cbDone);
};

exports.getFavorites = function(pi, arg, cbDone) {
  if (!arg.screen_name) return cbDone("missing screen_name");

  arg.path = '/favorites/list.json'; // XXX
  arg.token = pi.auth.token;

  getPage(pi.tc, arg, cbDone);
};

// step through any sized list of ids using cursors
function getIdList(arg, cbEach, cbDone) {
  if (!arg.screen_name) return cbDone("missing screen_name");
  var me = this;
  if (!arg.cursor) arg.cursor = -1;
  getOne(arg, function(err, js) {
    if (err || !js.ids || js.ids.length === 0) return cbDone(err);
    cbEach(js);
    arg.cursor = js.next_cursor;
    if (arg.cursor === 0) return cbDone();
    me.getIdList(arg, cbEach, cbDone);
  });
}

function getOne(tc, arg, cb) {
  if (!arg.path) return cb("no path");
  tc.apiCall('GET', arg.path, arg, function(err, js) {
    if (err) return cb(err);
    cb(null, js);
  });
}

function getPage(tc, arg, cbDone) {
  arg.count = 200;
  tc.apiCall('GET', arg.path, arg, function(err, js) {
    if (err) return cbDone(err);
    if (!Array.isArray(js)) return cbDone("result not an array");
    cbDone(null, js);
  });
}
