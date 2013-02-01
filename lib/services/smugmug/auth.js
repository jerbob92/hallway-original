var OAlib = require('oauth').OAuth;
var request = require('request');
var serializer = require('serializer');
var url = require('url');
var util = require('util');
var path = require('path');
var lib = require(path.join(__dirname, 'lib'));

module.exports = {

  handler: function(callback, apiKeys, done, req, res) {

    var qs = url.parse(req.url, true).query;
    var serialize = serializer.createSecureSerializer(apiKeys.appSecret,
      apiKeys.appSecret);

    // second phase, post-user-authorization
    var sess;
    if(req.cookies && req.cookies.smugmug_client) {
      try {
        sess = serialize.parse(req.cookies.smugmug_client);
      } catch(E) {
        // catch error, do nothing
      }
    }

    if(qs && qs.oauth_token && sess && sess.token_secret) {

      var authObj = {
        consumerKey : apiKeys.appKey,
        consumerSecret : apiKeys.appSecret,
        token : qs.oauth_token,
        tokenSecret : sess.token_secret
      };

      var authParams = {
        'method' : 'smugmug.auth.getAccessToken'
      };
      lib.apiCall('GET', authObj, authParams, true, function(error, body) {

        if(error) {
          return done(new Error("oauth failed to get access token"));
        }

        done(null, {
          consumerKey: apiKeys.appKey,
          consumerSecret: apiKeys.appSecret,
          token: data.Auth.Token.id,
          tokenSecret: data.Auth.Token.Secret,
          id: data.Auth.User.id,
          nickname: data.Auth.User.NickName
        });
      });

      return;
    }

    // first phase, initiate user authorization
    var reqTokenUrlObj = url.parse(
      'https://api.smugmug.com/services/oauth/getRequestToken.mg', true);
    reqTokenUrlObj.query['oauth_callback'] = callback;
    var reqTokenUrl = url.format(reqTokenUrlObj);

    var OA = new OAlib(
      reqTokenUrl,
      null,
      apiKeys.appKey,
      apiKeys.appSecret,
      '1.0',
      callback,
      'HMAC-SHA1',
      null,
      { 'Accept': '*/*', 'Connection': 'close'}
    );

    OA.getOAuthRequestToken({
      oauth_callback: callback
    },
    function(error, oauth_token, oauth_token_secret, oauth_authorize_url,
      additionalParameters) {

      if(error) {
        return res.end("failed to get token:" + error);
      }

      res.cookie('smugmug_client', serialize.stringify({
        token_secret: oauth_token_secret
      }), {
        path: '/',
        httpOnly: false
      });

      // get the service user authorization url
      var authReqUrlObj = url.parse(
        'https://api.smugmug.com/services/oauth/authorize.mg', true);
      authReqUrlObj.query['oauth_token'] = oauth_token;

      // redirect to the service user authorization page
      res.redirect(url.format(authReqUrlObj));
    });
  }
};