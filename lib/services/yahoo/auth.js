var OAlib = require('oauth').OAuth;
var request = require('request');
var serializer = require('serializer');
var url = require('url');
var util = require('util');

module.exports = {

  handler: function(callback, apiKeys, done, req, res) {

    var reqTokenUrlObj = url.parse(
      'https://api.login.yahoo.com/oauth/v2/get_request_token', true);
    reqTokenUrlObj.query['oauth_callback'] = callback;
    var reqTokenUrl = url.format(reqTokenUrlObj);
    var accessTokenUrl = 'https://api.login.yahoo.com/oauth/v2/get_token';

    var OA = new OAlib(
      reqTokenUrl,
      accessTokenUrl,
      apiKeys.appKey,
      apiKeys.appSecret,
      '1.0',
      callback,
      'HMAC-SHA1',
      null,
      { 'Accept': '*/*', 'Connection': 'close'}
    );

    var qs = url.parse(req.url, true).query;
    var serialize = serializer.createSecureSerializer(apiKeys.appSecret,
      apiKeys.appSecret);

    // second phase, post-user-authorization
    var sess;
    if(req.cookies && req.cookies.yahoo_client) {
      try {
        sess = serialize.parse(req.cookies.yahoo_client);
      } catch(E) {
        // catch error, do nothing
      }
    }

    if(qs && qs.oauth_token && sess && sess.token_secret) {

      OA.getOAuthAccessToken(
      qs.oauth_token, sess.token_secret, qs.oauth_verifier, function(error,
        oauth_token, oauth_token_secret, additionalParameters) {
        if(error || !oauth_token) {
          return done(new Error("oauth failed to get access token"));
        }
        done(null, {
          consumerKey: apiKeys.appKey,
          consumerSecret: apiKeys.appSecret,
          token: oauth_token,
          tokenSecret: oauth_token_secret,
          guid: additionalParameters.xoauth_yahoo_guid,
          session_handle: additionalParameters.oauth_session_handle
        });
      });
      return;
    }

    // first phase, initiate user authorization
    OA.getOAuthRequestToken({
      oauth_callback: callback
    },
    function(error, oauth_token, oauth_token_secret, oauth_authorize_url,
      additionalParameters) {

      if(error) return res.end("failed to get token:" + error);

      res.cookie('yahoo_client', serialize.stringify({
        token_secret: oauth_token_secret
      }), {
        path: '/',
        httpOnly: false
      });

      // get the service user authorization url
      var authReqUrlObj = url.parse(
      'https://api.login.yahoo.com/oauth/v2/request_auth', true);
      authReqUrlObj.query['oauth_callback'] = callback;
      authReqUrlObj.query['oauth_token'] = oauth_token;

      // redirect to the service user authorization page
      res.redirect(url.format(authReqUrlObj));
    });
  }
};