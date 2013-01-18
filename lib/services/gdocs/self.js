var lib = require('./lib');

exports.sync = function(pi, cb) {
  lib.get(pi.auth, {
    uri:'https://docs.google.com/feeds/metadata/default?alt=json&v=3' +
        '&access_token=' + pi.auth.token.access_token,
    json:true
  }, function(err, resp, me){
    if(err) return cb(err);
    if(resp.statusCode !== 200 || !me || !me.entry.id || !me.entry.id.$t) {
      return cb(resp.statusCode + ': ' + JSON.stringify(me));
    }
    // the unique part of the id is the email addy, use that!
    me.entry._id = me.entry.id.$t.split('/').pop();
    pi.auth.pid = me.entry._id + '@gdocs';
    pi.auth.profile = me.entry;
    var data = {};
    data['profile:' + pi.auth.pid + '/self'] = [me.entry];
    // pass back auth, could have token refreshed
    cb(null, {data:data, auth:pi.auth});
  });
};
