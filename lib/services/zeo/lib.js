var API_BASE = 'https://api.myzeo.com:8443/zeows/api/v1/json/sleeperService/';
var API_KEY = 'CC0E4AA1D260B2658BA02DE070CF2B8E';
var OAuth = require('oauth').OAuth;
var request = require('request');
var url = require('url');

function oauthClient(auth) {
  return new OAuth(
    null, null,
    auth.consumerKey, auth.consumerSecret, '1.0',
    null, 'HMAC-SHA1', null, {
      'Accept': '*/*', 'Connection': 'close'
    }
  );
}

exports.getData = function(arg, cbDone) {
  var client = oauthClient(arg.auth);
  var uri = url.parse(API_BASE + arg.query +'?key='+API_KEY);
console.log(uri);    
  client.get(uri, arg.auth.token, arg.auth.tokenSecret, null, 'application/json', function(err, body, response){
console.log(err);
console.log(body);
  });
}
