/*
 * This file is part of twitter-js
 *
 * Copyright (c) 2010 masylum <masylum@gmail.com>
 *
 * Licensed under the terms of MIT License. For the full copyright and license
 * information, please see the LICENSE file in the root folder.
 */

var url = require('url');
var http = require('http');
var OAuth = require('oauth').OAuth;
var querystring = require('querystring');
var memoize = {};
var serializer = require('serializer');

function getCookie(serial, req) {
  var ret = {};
  if (req.cookies && req.cookies.twitter_client) {
    try {
      ret = serial.parse(req.cookies.twitter_client);
    }catch(E){}
  }
  return ret;
}

function setCookie(serial, res, js) {
  var opaque = serial.stringify(js);
  res.cookie('twitter_client', opaque, { path: '/', httpOnly: false });
}


module.exports = function (key, secret, callbackURI) {
  if (memoize[key + secret + callbackURI]) {
    return memoize[key + secret + callbackURI];
  }

  var CLIENT = {
    callbackURI: callbackURI,
    oauth: new OAuth(
      'https://twitter.com/oauth/request_token',
      'https://twitter.com/oauth/access_token',
      key,
      secret,
      '1.0',
      callbackURI,
      'HMAC-SHA1',
      null,
      {'Accept': '*/*', 'Connection': 'close'}
    ),
    serializer: serializer.createSecureSerializer(secret, secret)
  };
  var _rest_base = 'https://api.twitter.com/1';

  memoize[key + secret + callbackURI] = CLIENT;


  /* Does an API call to twitter and callbacks
   * when the result is available.
   *
   * @param {String} method
   * @param {String} path
   * @param {Object} params
   * @param {Function} callback
   * @return {Request}
   */
  CLIENT.apiCall = function (method, path, params, callback) {
    var token = params.token;
    var active = true;
    var req;

    delete params.token;

    function requestCallback(callback) {
      return function (error, data, response) {
        if (!active) return; // don't try to callback twice
        active = false;
        if (error) {
          callback(error, null);
        } else {
          try {
            callback(null, JSON.parse(data));
          } catch (exc) {
            callback(exc, null);
          }
        }
      };
    }

    if (method.toUpperCase() === 'GET') {
      req = CLIENT.oauth.get(
        _rest_base + path + '?' + querystring.stringify(params),
        token.oauth_token,
        token.oauth_token_secret,
        requestCallback(callback)
      );
    } else if (method.toUpperCase() === 'POST') {
      req = CLIENT.oauth.post(
        _rest_base + path,
        token.oauth_token,
        token.oauth_token_secret,
        params,
        'application/json; charset=UTF-8',
        requestCallback(callback)
      );
    }

    // req is apparently undefined here, meaning we have no way to abort it if
    // it times out, @#%$@#^!@#%$@!!!!
    setTimeout(function(){
      if (!active) return;
      active = false;
      callback("timed out");
    }, 60000);
    return req;
  };

  /* Redirects to twitter to retrieve the token
   * or callbacks with the proper token
   *
   * @param {Request} req
   * @param {Response} res
   * @param {Function} callback
   */
  CLIENT.getAccessToken = function (req, res, callback) {

    var parsed_url = url.parse(req.url, true);
    var protocol = req.socket.encrypted ? 'https' : 'http';
    var has_token = parsed_url.query && parsed_url.query.oauth_token;
    var sess = getCookie(CLIENT.serializer, req);
    var has_secret = sess && sess.twitter_oauth_token_secret;

    // Acces token
    if (has_token &&  has_secret) {

      CLIENT.oauth.getOAuthAccessToken(
        parsed_url.query.oauth_token,
        sess.twitter_oauth_token_secret,
        parsed_url.query.oauth_verifier,
        function (error, oauth_token, oauth_token_secret, additionalParameters) {
          if (error) {
            callback(error, null);
          } else {
            callback(null, {oauth_token: oauth_token, oauth_token_secret: oauth_token_secret});
          }
        }
      );

    // Request token
    } else {
      CLIENT.oauth.getOAuthRequestToken({
        oauth_callback: CLIENT.callbackURI
      }, function (error, oauth_token, oauth_token_secret, oauth_authorize_url, additionalParameters) {
          if (!error) {
            sess.twitter_redirect_url = req.url;
            sess.twitter_oauth_token_secret = oauth_token_secret;
            sess.twitter_oauth_token = oauth_token;
            setCookie(CLIENT.serializer, res, sess);
            var auth = (req.query.flag && req.query.flag === 'dm') ? 'authorize' : 'authenticate'; // Twitter DM perms require authorize: https://dev.twitter.com/discussions/1253
            var force = (req.query.force_login === 'true') ? '&force_login=true' : ''; // to connect another twitter account this is a great UX convenience
            res.redirect('https://api.twitter.com/oauth/'+auth+'?oauth_token=' + oauth_token + force);
          } else {
            callback(error, null);
          }
        }
      );
    }
  };

  return CLIENT;
};
