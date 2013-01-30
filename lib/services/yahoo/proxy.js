var querystring = require('querystring');
var OAlib = require('oauth').OAuth;
var lutil = require('lutil');
var url = require('url');

exports.proxy = function(auth, req, res, flag) {

  var OA = new OAlib(
    null,
    null,
    auth.consumerKey,
    auth.consumerSecret,
    '1.0',
    null,
    'HMAC-SHA1',
    null,
    {'Accept': '*/*', 'Connection': 'close'}
  );

  // get the api from the query string
  var queryParams = req.query;
  var api = queryParams.api || 'social';
  delete queryParams.api;

  // setup the return format, default to json
  if (!queryParams.format) {
    queryParams.format = 'json';
  }

  // create the api url
  var apiUrlObj = url.parse(
      'http://' + api + '.yahooapis.com/v1' + req.url, true);
  apiUrlObj.query = queryParams;
  var apiUrl = url.format(apiUrlObj);

  OA.get(apiUrl, auth.token, auth.tokenSecret, function(err, data, response){

    // if error is the expired error from yahoo
    if (err && err.statusCode === 401 && !flag) {
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

  var refreshTokenUrlObj = url.parse(
    'https://api.login.yahoo.com/oauth/v2/get_token', true);
  refreshTokenUrlObj.query['oauth_session_handle'] = auth.session_handle;
  var refreshTokenUrl = url.format(refreshTokenUrlObj);

  var OA = new OAlib(
      null,
      refreshTokenUrl,
      auth.consumerKey,
      auth.consumerSecret,
      '1.0',
      null,
      'HMAC-SHA1',
      null,
      {'Accept': '*/*', 'Connection': 'close'}
    );

  OA.getOAuthAccessToken(
    auth.token,
    auth.tokenSecret,
    function (error, oauth_token, oauth_token_secret, additionalParameters) {
      if (error || !oauth_token) {
        console.log(error);
        var err = "oauth failed to refresh expired token: " + error;
        return res.json(lutil.jsonErr(err), 403);
      }
      auth.token = oauth_token;
      auth.tokenSecret = oauth_token_secret;
      exports.proxy(auth, req, res, true);
    }
  );
}