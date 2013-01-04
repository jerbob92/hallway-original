/*
 *
 * Copyright (C) 2013, Singly Inc.
 * All rights reserved.
 *
 * Please see the LICENSE file for more information.
 *
 */

var path = require('path');
var tw = require(path.join(__dirname, 'lib.js'));

exports.sync = function(pi, cb) {
  pi.tc = require(path.join(__dirname, 'twitter_client.js'))(pi.auth.consumerKey, pi.auth.consumerSecret);
  var resp = {data:{}, config:{}};
  var since=1;
  var max=0;
  var newest=0;
  // if existing since, start from there
  if (pi.config && pi.config.receivedMessagesNewest) newest = pi.config.receivedMessagesNewest;
  if (pi.config && pi.config.receivedMessagesSince) since = pi.config.receivedMessagesSince;
  if (pi.config && pi.config.receivedMessagesMax) max = pi.config.receivedMessagesMax;
  var arg = {screen_name:pi.auth.profile.screen_name, since_id:since};
  if (max > 0) arg.max_id = max; // we're paging down results
  tw.getDirectMessages(pi, arg, function(err, js){
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
    resp.config.receivedMessagesNewest = newest;
    resp.config.receivedMessagesSince = since;
    resp.config.receivedMessagesMax = max;
    if (max > 1) resp.config.nextRun = -1; // run again if paging
    cb(err, resp);
  });
};
