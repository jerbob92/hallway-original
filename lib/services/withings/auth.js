module.exports = {
  handler: function(callback, apiKeys, done, req, res) {
    var qs = require('querystring');
    var request = require('request');
    var url = require('url');
    var OAlib = require('oauth').OAuth;
    var serializer = require('serializer').createSecureSerializer(apiKeys.appSecret, apiKeys.appSecret);

    var OA = new OAlib('https://oauth.withings.com/account/request_token',
      'https://oauth.withings.com/account/access_token',
      apiKeys.appKey,
      apiKeys.appSecret,
      '1.0',
      callback,
      'HMAC-SHA1',
      null,
      { Accept: '*/*', Connection: 'close' });

    var qs = url.parse(req.url, true).query;

    // Second phase, after user authorization
    var sess;
    if(req.cookies && req.cookies["withings_client"]) try { sess = serializer.parse(req.cookies["withings_client"]); }catch(E){}
    if(qs && qs.oauth_token && sess && sess.token_secret) {
      OA.getOAuthAccessToken(qs.oauth_token, sess.token_secret, qs.oauth_verifier,
        function(error, oauth_token, oauth_token_secret) {
        if (error || !oauth_token) {
          return done(new Error("oauth failed to get access token"));
        }

        // Note that we're also grabbing and storing
        // the user ID from the queryString
        done(null, {
          consumerKey: apiKeys.appKey,
          consumerSecret: apiKeys.appSecret,
          token: oauth_token,
          tokenSecret: oauth_token_secret,
          userId: qs.userid
        });
      });

      return;
    }

    // First phase, initiate user authorization
    OA.getOAuthRequestToken({ oauth_callback: callback },
      function(error, oauth_token, oauth_token_secret, oauth_authorize_url) {
      if (error) {
        return res.end("failed to get token: " + error);
      }

      // Stash the secret
      res.cookie('withings_client', serializer.stringify({token_secret:oauth_token_secret}), { path: '/', httpOnly: false }); // stash the secret

      res.redirect('https://oauth.withings.com/account/authorize?oauth_token=' + oauth_token + '&oauth_callback=' + callback);
    });
  }
};