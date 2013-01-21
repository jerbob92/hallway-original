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

var timeout = 60000;

exports.getMe = function(pi, cbEach, cbDone) {
  var arg = {};
  arg.path = '/account/verify_credentials.json';
  arg.token = pi.auth.token;
  getOne(pi.tc, arg, function(err, me) {
    if (me) cbEach(me);
    cbDone(err);
  });
};

// just chunk friends or followers
exports.getFFchunk = function(pi, arg, cbDone) {
  arg.token = pi.auth.token;
  if (!arg.cursor) arg.cursor = -1;
  if (!arg.slice) arg.slice = 0;
  // bump to next page if we sliced past current one
  if (arg.slice > 5000) {
    arg.cursor++;
    arg.slice = 0;
  }
  getOne(pi.tc, arg, function(err, js) {
    if (err || !js.ids) return cbDone(err);
    var users = [];
    //drift back a bit to overlap more efficiently
    var start = ((arg.slice > 10) ? arg.slice-10 : arg.slice);
    // three passes to do 5k
    var end = arg.slice + 1700;
    var ids = js.ids.slice(start, end);
    exports.getUsers(pi, ids, function(user) {
      users.push(user);
    }, function(err) {
      if (err) return cbDone(err);
      // reset back to start if we hit the end
      if (users.length < 1000) {
        arg.cursor = -1;
        arg.slice = 0;
      } else {
        arg.slice += users.length;
      }
      cbDone(err, users);
    });
  });
};

// walk my friends list getting/caching each one
exports.getMyFriends = function(pi, cbEach, cbDone) {
  var me = this;
  var arg = {};
  arg.cursor=-1; // not sure why?
  arg.path = '/friends/ids.json';
  arg.token = pi.auth.token;
  getOne(pi.tc, arg, function(err, js) {
    if (err || !js.ids || js.ids.length === 0) return cbDone(err);
    var ids = js.ids.slice(0, 2000);
    me.getUsers(pi, ids, cbEach, cbDone);
  });
};

// only get a chunk of them due to rate limits
exports.getMyFollowers = function(pi, cbEach, cbDone) {
  var me = this;
  var arg = {};
  arg.cursor=-1;
  arg.path = '/followers/ids.json';
  arg.token = pi.auth.token;
  getOne(pi.tc, arg, function(err, js) {
    if (err || !js.ids || js.ids.length === 0) return cbDone(err);
    var ids = js.ids.slice(0, 1000);
    me.getUsers(pi, ids, cbEach, cbDone);
  });
};

// just get extended details of all followers
exports.getFollowers = function(arg, cbEach, cbDone) {
  var me = this;
  arg.path = '/followers/ids.json';
  // use a queue to process each block of ids
  var q = async.queue(function(js, cb) {
    me.getUsers(js.ids, cbEach, cb);
  }, 1);
  getIdList(arg, q.push, function(err) {
    if (err) return cbDone(err);
    // queue could be done, but likely not
    if (q.length() === 0) return cbDone();
    q.drain = cbDone;
  });
};

// get your home timeline, screen_name has to be me
exports.getTimeline = function(pi, arg, cbDone) {
  if (!arg.screen_name) return cbDone("missing screen_name");
  arg.path = '/statuses/home_timeline.json';
  arg.token = pi.auth.token;
  arg.token = pi.auth.token;
  getPage(pi.tc, arg, cbDone);
};

// get just one chunk of a timeline, screen_name has to be me
exports.getTimelinePage = function(pi, arg, cbEach, cbDone) {
  if (!arg.screen_name) return cbDone("missing screen_name");
  if (!arg.count) arg.count = 100;
  arg.path = '/statuses/home_timeline.json';
  arg.token = pi.auth.token;
  getOne(pi.tc, arg, function(err, js) {
    if (js) cbEach(js);
    cbDone(err);
  });
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
  arg.path = '/statuses/mentions.json';
  arg.token = pi.auth.token;
  getPage(pi.tc, arg, cbDone);
};

exports.getFavorites = function(pi, arg, cbDone) {
  if (!arg.screen_name) return cbDone("missing screen_name");

  arg.path = '.1/favorites/list.json'; // XXX
  arg.token = pi.auth.token;

  getPage(pi.tc, arg, cbDone);
};

// get replies and retweets for any tweet id
exports.getRelated = function(pi, arg, cbEach, cbDone) {
  if (!arg.id) return cbDone("missing tweet id");
  getOne(pi.tc, {
    token:pi.auth.token,
    path:"/related_results/show/"+arg.id+".json"
  }, function(err, related) {
    if (err || !Array.isArray(related)) return cbDone(err);
    getOne(pi.tc, {
      token:pi.auth.token,
      path:"/statuses/"+arg.id+"/retweeted_by.json"
    }, function(err, retweeted) {
      if (err || !Array.isArray(retweeted)) return cbDone(err);
      if (retweeted.length > 0) related.push({
        results:retweeted,
        resultType:"ReTweet"
      });
      if (related.length > 0) cbEach(related);
      cbDone();
    });
  });
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

// bulk chunk get user details
exports.getUsers = function(pi, users, cbEach, cbDone) {
  if (users.length === 0) return cbDone();
  var lenStart = users.length;
  var me = this;
  var id_str = "";
  var ids = {};
  for(var i = 0; i < 100 && users.length > 0; i++) {
    var id = users.pop();
    ids[id] = true; // track hash of all attempted
    if (i > 0) id_str += ',';
    id_str += id;
  }
  getOne(pi.tc, {
    path:'/users/lookup.json',
    user_id:id_str,
    token:pi.auth.token
  }, function(err, infos) {
    if (err) return cbDone(err);
    for(var i=0; i < infos.length; i++) {
      if (!ids[infos[i].id_str]) continue; // skip dups
      delete ids[infos[i].id_str];
      cbEach(infos[i]);
    }
    for (var id in ids) {
      users.push(id); // any non-done users push back for next attempt
    }
    if (lenStart === users.length) {
      return cbDone("failed to find remaining users");
    }
    me.getUsers(pi, users, cbEach, cbDone); // loop loop till done
  });
};

// call the api non-authenticated
function getOnePublic(arg, cb) {
  if (!arg.path) return cb("no path");
  var api = url.parse('https://api.twitter.com/1'+arg.path);
  delete arg.path;
  api.query = arg;
  request.get({
    uri:url.format(api),
    timeout:timeout
  }, function(err, resp, body) {
    var js;
    try {
      if (err) throw err;
      js = JSON.parse(body);
    } catch(E) {
      return cb(E);
    }
    cb(null, js);
  });
}

function getOne(tc, arg, cb) {
  if (!arg.path) return cb("no path");
  arg.include_entities = true;
  tc.apiCall('GET', arg.path, arg, function(err, js) {
    if (err) return cb(err);
    cb(null, js);
  });
}

function getPage(tc, arg, cbDone) {
  arg.count = 200;
  arg.include_entities = true;
  tc.apiCall('GET', arg.path, arg, function(err, js) {
    if (err) return cbDone(err);
    if (!Array.isArray(js)) return cbDone("result not an array");
    cbDone(null, js);
  });
}
