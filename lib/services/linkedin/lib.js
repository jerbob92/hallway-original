var OAuth = require('oauth').OAuth;

var API_BASE = 'http://api.linkedin.com/v1/';

function oauthClient(auth) {
  return new OAuth(
    null, null,
    auth.consumerKey, auth.consumerSecret, '1.0',
    null, 'HMAC-SHA1', null, {
     'Accept': '*/*', 'Connection': 'close'
    }
  );
}

exports.genericSync = function(pather, cbProcessData) {
  return function(pi, cbTaskMan) {
    var client = oauthClient(pi.auth);
    var path = pather(pi);
    if(!path) return cbTaskMan(null, {data:{}}); // nothing to do
    var url = API_BASE + path;
    client.get(url, pi.auth.token, pi.auth.tokenSecret, function(err, body){
      if(err) return cbTaskMan(err);
      var js;
      try{ js = JSON.parse(body); }catch(E){ return cbTaskMan(err); }
      cbProcessData(pi, js, cbTaskMan);
    });
  };
};

exports.post = function(path, data, cbDone) {
  var auth = data.auth;
  var client = oauthClient(auth);
  delete data.auth;

  if (typeof(data) === 'object') data = JSON.stringify(data);
  if (path.indexOf('format') === -1) {
    path += (path.indexOf('?') === -1) ? '?' : '&';
    path += 'format=json';
  }

  client.post(
    API_BASE + path, auth.token, auth.tokenSecret, data, 'application/json',
    function(err, body, response) {
      try {
        if (typeof(body) === 'string') body = JSON.parse(body);
      } catch(E) {
        // Well, we tried
      }
      cbDone(err, body, response);
    }
  );
};
