var lib = require('./lib');

exports.sync = function(pi, cb) {
  lib.fetch(pi.auth, 'accounts/' + pi.auth.account, function(err, js) {
    if(err) return cb(err);
    if(!js || !js.email_addresses || !js.email_addresses[0]) {
      return cb(new Error("invalid/missing data"));
    }
    pi.auth.profile = js; // stash
    pi.auth.pid = encodeURIComponent(js.email_addresses[0]) + '@email';
    pi.auth.email = js.email_addresses[0];
    var base = 'profile:' + pi.auth.pid + '/self';
    var data = {};
    data[base] = [js];
    cb(null, {auth: pi.auth, data: data});
  });
};
