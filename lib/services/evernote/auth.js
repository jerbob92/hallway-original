var request = require('request');
var url = require('url');
var OAlib = require('oauth').OAuth;
var serializer = require('serializer');

module.exports = {
  handler : function (callback, apiKeys, done, req, res) {
    var OA = new OAlib('https://www.evernote.com/oauth',
      'https://www.evernote.com/oauth',
      apiKeys.appKey,
      apiKeys.appSecret,
      '1.0',
      callback,
      'HMAC-SHA1',
      null,
      {'Accept': '*/*', 'Connection': 'close'}
    );
    var qs = url.parse(req.url, true).query;
    var serialize = serializer.createSecureSerializer(
      apiKeys.appSecret,
      apiKeys.appSecret
    );

    // second phase, post-user-authorization
    var sess;
    if (req.cookies && req.cookies.evernote_client) {
      try {
        sess = serialize.parse(req.cookies.evernote_client);
      } catch (E) {}
    }

    if (qs && qs.oauth_token && sess && sess.token_secret) {
      OA.getOAuthAccessToken(
        qs.oauth_token,
        sess.token_secret,
        qs.oauth_verifier,
        function (error, oauth_token, oauth_token_secret, additionalParameters) {
          if (error || !oauth_token) {
            return done(new Error("oauth failed to get access token"));
          }
          done(null, {
            consumerKey : apiKeys.appKey,
            consumerSecret : apiKeys.appSecret,
            token : oauth_token,
            tokenSecret: oauth_token_secret,
            params: additionalParameters
          });
        }
      );
      return;
    }

    // first phase, initiate user authorization
    OA.getOAuthRequestToken({
      oauth_callback: callback
    }, function (error, oauth_token, oauth_token_secret, oauth_authorize_url, additionalParameters) {
      if (error) return res.end("failed to get request token from evernote: " + JSON.stringify(error));
      // stash the secret
      res.cookie('evernote_client',
        serialize.stringify({token_secret:oauth_token_secret}),
        {path: '/', httpOnly: false}
      );
      res.redirect('https://www.evernote.com/OAuth.action?' +
                   'oauth_token=' + oauth_token);
    });
  }
};
