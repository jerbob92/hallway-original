var request = require("request");
var crypto = require('crypto');

exports.sync = function(pi, cb) {
  var arg = processInfo.auth;
  var data = {};
  arg.changes = data['change:'+arg.pid+'/changes'] = [];
  page(arg, function(err){
    cb(err, {data : data});
  })
};

function page(arg, callback)
{
  if(!arg.url) arg.url = "https://docs.google.com/feeds/default/private/changes?alt=json&v=3";
  if(!arg.newest) arg.newest = 0;
  var api = arg.url + "&access_token="+arg.token.access_token;
  request.get({uri:api, json:true}, function(err, resp, body){
    if(err || !body || !body.feed || !body.feed.entry || !Array.isArray(body.feed.entry) || body.feed.entry.length == 0) return callback(err);
    body.feed.entry.forEach(function(e){
      if(e.docs$changestamp && e.docs$changestamp > arg.newest) arg.newest = e.docs$changestamp; // track the newest
      arg.changes.push(e);
    });
    var next;
    if(Array.isArray(body.feed.link)) body.feed.link.forEach(function(l){ if(l.rel == 'next') next = l.href;});
    if(!next || next == arg.url) return callback();
    arg.url = next;
    page(arg, callback);
  });
}