/*
*
* Copyright (C) 2011, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

var request = require('request');
var urllib = require('url');
var querystring = require('querystring');


// wrap so we can detect refresh token needed
exports.get = function(auth, arg, callback) {
  request.get(arg, function(err, res, js) {
    if (err || res.statusCode !== 401) return callback(err, res, js);
    tryRefresh(auth, function(err){
      if (err) return callback(err);
      var api = urllib.parse(arg.uri,true);
      api.query.access_token = auth.token.access_token;
      delete api.search; // node url format bug, ignores query!
      arg.uri = urllib.format(api);
      request.get(arg, callback); // try again once more
    });
  });
};

function tryRefresh(auth, callback) {
  var options = {
    uri: 'https://accounts.google.com/o/oauth2/token',
    method: 'POST',
    body: querystring.stringify({
      client_id     : auth.appKey,
      client_secret : auth.appSecret,
      refresh_token : auth.token.refresh_token,
      grant_type    : 'refresh_token'
    }),
    headers: {'Content-Type':'application/x-www-form-urlencoded'}
  };
  request(options, function(err, res, body){
    var js;
    try {
      if (err) throw err;
      js = JSON.parse(body);
    } catch(E) {
      return callback(E);
    }
    auth.token.access_token = js.access_token;
    return callback();
  });
}

