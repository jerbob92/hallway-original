var OAlib = require('oauth').OAuth;

exports.refreshToken = function(f, pi, cb) {

  var OA = new OAlib(
      null,
      'https://api.login.yahoo.com/oauth/v2/get_token?oauth_session_handle=' + pi.auth.session_handle,
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
}