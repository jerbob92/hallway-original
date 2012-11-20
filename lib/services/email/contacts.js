var lib = require('./lib');

exports.sync = function(pi, cb) {
  var url = 'accounts/' + pi.auth.account + '/contacts?limit=500';
  lib.fetch(pi.auth, url, function(err, js) {
    if(err) return cb(err);
    if(!js || !js.matches) return cb(new Error("invalid/missing data"));
    var data = {};
    data['contact:' + pi.auth.pid + '/contacts'] = js.matches;
    cb(null, {auth: pi.auth, data: data});
  });
};
