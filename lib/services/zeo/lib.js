var API_BASE = 'https://api.myzeo.com:8443/zeows/api/v1/json/sleeperService';
var CALLER_DOMAIN = 'https://localhost:8042';

var OAuth = require('./oauth').OAuth;
var request = require('request');
var url = require('url');
var querystring = require('querystring');
var async = require('async');

function oauthClient(auth) {
  return new OAuth(
    null, null,
    auth.consumerKey, auth.consumerSecret, '1.0',
    null, 'HMAC-SHA1', null, {
      'Accept': '*/*', 'Connection': 'close'
    }
  );
}

exports.apiCall = function(arg, cb) {
  if (!arg.auth.callerKey) return cb(new Error('API caller key required for Zeo.'
                                     + ' Check Config/apikeys.json.example'));
  var client = oauthClient(arg.auth);
  arg.params = arg.params || {};
  arg.params.key = arg.auth.callerKey;; 
  var uri = url.parse(API_BASE + arg.query +'?' + querystring.stringify(arg.params));
  client.get(uri, arg.auth.token, arg.auth.tokenSecret, null, 
                          'application/json', function(err, body, response){
    if (err || !body) return cb(err);
    body = JSON.parse(body);
    cb(err, body, response);
  });
}

exports.datetimeToID = function(datetime, callback) {
  var id = '';
  async.forEach(Object.keys(datetime), function(key, cb){
    id += datetime[key];
    cb(null);
  }, function(err) {
    if (err) return callback(err);
    callback(null, id);
  });
}
