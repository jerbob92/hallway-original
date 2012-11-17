var qs = require('querystring');
var request = require('request');
var url = require('url');
var OAuth = require('oauth').OAuth;

module.exports = {
  handler : function (callbackURL, apiKeys, done, req, res) {
    var oa = new OAuth(
      'http://api.rdio.com/oauth/request_token',
      'http://api.rdio.com/oauth/access_token',
      apiKeys.appKey,
      apiKeys.appSecret,
      '1.0',
      callbackURL,
      'HMAC-SHA1',
      null, {
        'Accept': '*/*',
        'Connection': 'close'
      }
    );
    var qs = url.parse(req.url, true).query;
    var serializer = require('serializer').createSecureSerializer(apiKeys.appSecret, apiKeys.appSecret);

    // second phase, post-user-authorization
    var sess;
    if (req.cookies && req.cookies.rdio_client) try {
      sess = serializer.parse(req.cookies.rdio_client);
    } catch(E) {}
    if (qs && qs.oauth_token && sess && sess.token_secret) {
      oa.getOAuthAccessToken(
        qs.oauth_token, sess.token_secret, qs.oauth_verifier,
        function (error, oauth_token, oauth_token_secret, additionalParameters) {
        if (error || !oauth_token) return done(new Error("OAuth failed to get access token"));
        done(error, {
          consumerKey : apiKeys.appKey,
          consumerSecret : apiKeys.appSecret,
          token : oauth_token,
          tokenSecret : oauth_token_secret
        });
      });
      return;
    }

    // first phase, initiate user authorization
    oa.getOAuthRequestToken({
      oauth_callback : callbackURL
    }, function (error, oauth_token, oauth_token_secret, oauth_authorize_url, additionalParameters) {
      if (error) return res.end("failed to get token: " + error);
      res.cookie(
        'rdio_client',
        serializer.stringify({
          token_secret:oauth_token_secret
        }), {
        path: '/',
        httpOnly: false
        }
      ); // stash the secret
      res.redirect('https://www.rdio.com/oauth/authorize?oauth_token=' + oauth_token);
    });
  }
};
