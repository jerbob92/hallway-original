var lib = require('./lib');

exports.sync = function(pi, cb) {
  lib.get(pi.auth, {
    uri: 'https://www.googleapis.com/oauth2/v1/userinfo'
  }, function(err, resp, me){
    if(err) return cb(err);
    if(resp.statusCode !== 200 || !me || !me.id) {
      return cb(resp.statusCode + ': ' + JSON.stringify(me));
    }
    pi.auth.pid = me.id+'@gcal';
    pi.auth.profile = me;
    var data = {};
    data['profile:' + pi.auth.pid + '/self'] = [me];
    cb(null, {data:data, auth:pi.auth});
  });
};
