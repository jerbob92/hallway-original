
var request = require('request');
var util = require('util');

exports.sync = function(pi, cb) {
  var path = pi.type+"s";
  if(path == "contacts") path = "users";
  request.get({
    uri:  'https://api.foursquare.com/v2/'+path+'/'+pi.id+'?v=20120413&oauth_token=' + pi.auth.accessToken,
    json: true
  }, function(err, resp, js) {
    if(err) return cb(err);
    if(resp.statusCode !== 200) {
      return cb(
        new Error("status code " + resp.statusCode + " " + util.inspect(js))
      );
    }
    if(!js || !js.response || !js.response[pi.type]) {
      return cb(new Error("missing valid response: " + util.inspect(js)));
    }
    cb(null, js.response[pi.type]);
  });
};
