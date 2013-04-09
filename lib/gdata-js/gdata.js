var EventEmitter = require('events').EventEmitter;
var https = require('https');
var http = require('http');
var parse = require('url').parse;
var querystring = require('querystring');

var oauthBase = 'https://accounts.google.com/o/oauth2';

function doPost(body, callback) {
  var options = {
    host: 'accounts.google.com',
    port: 443,
    path: '/o/oauth2/token',
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  };

  var httpsReq = https.request(options, function (httpsRes) {
    if (httpsRes.statusCode === 200) {
      httpsRes.on('data', function (data) {
        callback(null, JSON.parse(data.toString()));
      });
    } else {
      httpsRes.on('data', function (data) {
        console.error("refreshing token -- statusCode !== 200, yoikes! data:",
          data.toString());

        callback(data.toString());
      });
    }
  });

  httpsReq.write(querystring.stringify(body));

  httpsReq.on('error', function (e) {
    callback(e, null);
  });

  httpsReq.end();
}

exports.clientFromAuth = function (auth) {
  var gdataClient = exports.client(
    auth.appKey || auth.clientID,
    auth.appSecret || auth.clientSecret,
    auth.redirectURI);

  gdataClient.setToken(auth.token);

  return gdataClient;
};

exports.client = function (client_id, client_secret, redirect_uri) {
  var clientID = client_id;
  var clientSecret = client_secret;
  var redirectURI = redirect_uri;
  var token;

  var client = new EventEmitter();

  client.getAccessToken = function (options, req, res, callback) {
    if (req.query.error) {
      callback(req.query.error);
    } else if (!req.query.code) {
      options.client_id = clientID;
      options.redirect_uri = options.redirect_uri || redirectURI;
      options.response_type = 'code';

      var height = 750;
      var width = 980;

      var resp = "<script type='text/javascript'>" +
        "var left= (screen.width / 2) - (" + width + " / 2);" +
        "var top = (screen.height / 2) - (" + height + " / 2);" +
        "window.open('" + oauthBase + '/auth?' +
        querystring.stringify(options) + "', 'auth', 'menubar=no,toolbar=no," +
        "status=no,width=" + width + ",height=" + height +
        ",toolbar=no,left=' + left + 'top=' + top);" +
        "</script>";

      res.end(resp + '<a target=_new href=\'' + oauthBase + '/auth?' +
        querystring.stringify(options) + '\'>Authenticate</a>');
    } else {
      doPost({
        grant_type: 'authorization_code',
        code: req.query.code,
        client_id: clientID,
        client_secret: clientSecret,
        redirect_uri: redirectURI
      }, function (err, tkn) {
        if (!err && tkn && !tkn.error) {
          token = tkn;
        }

        callback(err, tkn);
      });
    }
  };

  client.setToken = function (tkn) {
    token = tkn;
  };

  client.getFeed = function (url, params, callback, skipRefresh) {
    if (!callback && typeof params === 'function') {
      callback = params;
      params = {};
    }

    params.oauth_token = token.access_token;

    // Don't request profile photos as JSON
    if (!/photos\/media/.test(url)) {
      params.alt = 'json';
    }

    doRequest(url, params, function (err, body) {
      callback(err, body);
    }, skipRefresh);
  };

  function doRequest(url, params, callback, skipRefresh) {
    var parsedUrl = parse(url);
    var path = parsedUrl.pathname + '?' + querystring.stringify(params);

    var options = {
      host: parsedUrl.host || 'www.google.com',
      port: 443,
      path: path,
      method: 'GET'
    };

    // XXX: This was originally all https, but was changed to get around
    // https://github.com/joyent/node/issues/4771
    // should be changed back ASAP (node v0.10 upgrade)
    var httpClient;
    if (parsedUrl.protocol === 'http:') {
      httpClient = http;
      options.port = 80;
    } else {
      httpClient = https;
      options.port = 443;
    }

    var httpReq = httpClient.request(options, function (httpRes) {
      if (httpRes.statusCode === 401 || httpRes.statusCode === 403) {
        if (skipRefresh) return callback('Token could not be refreshed');
        refreshToken(function (err, result) {
          if (err) {
            return callback(err);
          }

          if (result && result.error) {
            return callback(result.error);
          }

          if (!err && result && !result.error && result.access_token) {
            token.access_token = result.access_token;
            token.refresh_token = result.refresh_token || token.refresh_token;

            client.emit('tokenRefresh');

            // next time don't try to refresh so we don't loop
            client.getFeed(url, params, callback, true);
          }
        });
      } else {
        var data = '';

        httpRes.on('data', function (moreData) {
          data += moreData;
        });

        httpRes.on('end', function () {
          // Don't try to parse profile pictures as JSON
          if (httpRes.headers['content-type'] &&
            httpRes.headers['content-type'].indexOf('image') === 0) {
            return callback(null, data);
          }

          try {
            callback(null, JSON.parse(data.toString()));
          } catch (err) {
            callback(err + ": " + data.toString(), null);
          }
        });
      }
    });

    httpReq.on('error', function (e) {
      callback(e, null);
    });

    httpReq.end();
  }

  function refreshToken(callback) {
    doPost({
      client_id: clientID,
      client_secret: clientSecret,
      refresh_token: token.refresh_token,
      grant_type: 'refresh_token'
    }, function (err, result) {
      if (err || !result || !result.access_token) {
        console.error('gdata-js refreshToken err', err);
        console.error('gdata-js refreshToken result', result);
      }

      callback(err, result);
    });
  }

  // for debugging
  client._refreshToken = refreshToken;

  return client;
};
