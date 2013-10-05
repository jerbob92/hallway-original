var request = require('request');

exports.sync = function(pi, cb) {
	pi.auth.access_token = pi.auth.token.access_token;
  exports.refreshToken(pi.auth, function(err, newAuth) {
    if (err && !newAuth) return cb(err);
    pi.auth.token = newAuth;
    pi.auth.access_token = newAuth.access_token;
    pi.auth.accessToken = newAuth.access_token;
    var uri = 'https://api.meetup.com/2/member/self?'+'access_token='+pi.auth.access_token;
    request.get({uri:uri, json:true}, function(err, resp, json){
      if(err || !json || !json.name) return cb(err);
      pi.auth.profile = json;
      pi.auth.pid = json.id+'@meetup';
      var base = 'member:'+pi.auth.pid+'/self';
      var data = {};
      data[base] = [json];
      cb(null, {auth: pi.auth, data: data});
    });
  })
};


exports.refreshToken = function refreshToken(auth, callback) {
  request.post({
    uri: 'https://secure.meetup.com/oauth2/access',
    form: {
      client_id: auth.clientID,
      client_secret: auth.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: auth.token.refresh_token
    },
    json: true
  }, function(err, resp, body) {
    if (err) return callback(err);
    if (resp.statusCode !== 200) return callback('non-200 while refreshing');
    callback(null, body);
  });
}
