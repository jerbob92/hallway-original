var OAlib = require('oauth').OAuth;
var querystring = require('querystring');

var lutil = require('lutil');

exports.proxy = function(auth, req, res, flag) {
  var tokenUrl = 'https://api.bodymedia.com/oauth/access_token?api_key=' +
                 auth.consumerKey;
  var OA = new OAlib(
    null, tokenUrl,
    auth.consumerKey, auth.consumerSecret,
    '1.0', null, 'HMAC-SHA1', null,
    {'Accept': '*/*', 'Connection': 'close'}
  );

  var url = 'http://api.bodymedia.com/v2' + req.url +
            '?api_key=' + auth.consumerKey;
  var qs = querystring.stringify(req.query);
  if (qs) url += '&' + qs;

  // only supporting GET at the moment
  OA.get(url, auth.token, auth.tokenSecret, function(err, data, response){
    if(err && err.statusCode === 401 && !flag) {
      return refreshToken(OA, auth, req, res);
    }
    Object.keys(response.headers).forEach(function(header) {
      res.header(header, response.headers[header]);
    });
    res.send(data, response.statusCode);
  });
};

// update token and retry just once
function refreshToken(oauth, auth, req, res) {
  oauth.getOAuthAccessToken(
    auth.token,
    auth.tokenSecret,
    function (error, oauth_token, oauth_token_secret, additionalParameters) {
      if (error || !oauth_token) {
        var err = "oauth failed to refresh expired token: " + error;
        return res.json(lutil.jsonErr(err), 403);
      }

      auth.token = oauth_token;
      auth.tokenSecret = oauth_token_secret;
      exports.proxy(auth, req, res, true);
    }
  );
}
