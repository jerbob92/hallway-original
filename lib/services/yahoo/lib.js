var OAlib = require('oauth').OAuth;
var url = require('url');

exports.refreshToken = function(f, pi, cb) {

  var refreshTokenUrlObj = url.parse(
    'https://api.login.yahoo.com/oauth/v2/get_token', true);
  refreshTokenUrlObj.query['oauth_session_handle'] = pi.auth.session_handle;
  var refreshTokenUrl = url.format(refreshTokenUrlObj);

  var OA = new OAlib(
      null,
      refreshTokenUrl,
      pi.auth.consumerKey,
      pi.auth.consumerSecret,
      '1.0',
      null,
      'HMAC-SHA1',
      null,
      {'Accept': '*/*', 'Connection': 'close'}
    );

  OA.getOAuthAccessToken(
    pi.auth.token,
    pi.auth.tokenSecret,
    function (error, oauth_token, oauth_token_secret, additionalParameters) {
      if (error || !oauth_token) {
        console.log(error);
        return cb("oauth failed to refresh expired token: " + error);
      }
      pi.auth.token = oauth_token;
      pi.auth.tokenSecret = oauth_token_secret;
      f(pi, cb);
    }
  );
};