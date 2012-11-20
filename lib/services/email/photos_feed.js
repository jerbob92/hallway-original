var lib = require('./lib');

exports.sync = function(pi, cb) {
  var url = 'accounts/' + pi.auth.account + '/files' +
            '?limit=500&file_name=' + encodeURIComponent('/.jpe?g$/');
  lib.fetch(pi.auth, url, function(err, js){
    if(err) return cb(err);
    if(!js || !Array.isArray(js)) return cb(new Error("invalid/missing data"));
    var good = [];
    js.forEach(function(file){
      if(file.size < 50000) return; // skip too small
      if(file.addresses.from.email === pi.auth.email) return; // skip from self
      good.push(file);
    });
    var data = {};
    data['afile:'+pi.auth.pid+'/photos_feed'] = good;
    cb(null, {data:data});
  });
};
