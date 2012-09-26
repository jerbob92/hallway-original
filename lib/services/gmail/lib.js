var fs = require('fs');

exports.genericSync = function(url, cbData) {
  return function(pi, cbFinal) {
    var OAlib = require('oauth').OAuth;
    var OA = new OAlib(null, null, pi.auth.consumerKey, pi.auth.consumerSecret, '1.0', null, 'HMAC-SHA1', null, {'Accept': '*/*', 'Connection': 'close'});
    OA.get(url, pi.auth.token, pi.auth.tokenSecret, function(err, body){
      if(err) return cbFinal(err);
      var js;
      try{ js = JSON.parse(body); }catch(E){ return cbFinal(err); }
      cbData(pi, js, cbFinal);
    });
  };
};

exports.generateAuthString = function(pi) {
  var buf = new Buffer("user=" + pi.auth.username + "\1auth=Bearer " + pi.auth.token + "\1\1");
  return buf.toString("base64");
}

