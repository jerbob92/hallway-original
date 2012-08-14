var API_BASE = 'https://api.myzeo.com:8443/zeows/api/v1/json/sleeperService';
var API_KEY = '2CF58F31B83B9E1CE63C6C6FDCF4253B';//'CC0E4AA1D260B2658BA02DE070CF2B8E';
var CALLER_DOMAIN = 'http://localhost:8042';//https://api.singly.com'

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
  var client = oauthClient(arg.auth);
  arg.params = arg.params || {};
  arg.params.key = API_KEY; 
  var uri = url.parse(API_BASE + arg.query +'?' + querystring.stringify(arg.params));
  client.get(uri, arg.auth.token, arg.auth.tokenSecret, null, 
                          'application/json', function(err, body, response){
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
    if (err) callback(err);
    callback(null, id);
  });
}
