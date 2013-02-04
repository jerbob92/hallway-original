var OAuth = require('oauth').OAuth;
var url = require('url');
var querystring = require('querystring');

var API_BASE = 'https://api.myzeo.com:8443/zeows/api/v1/json/sleeperService';

function oauthClient(auth) {
  return new OAuth(
    null, null,
    auth.consumerKey, auth.consumerSecret, '1.0',
    null, 'HMAC-SHA1', null, {
      'Accept': '*/*',
      'Connection': 'close',
      'Referer': 'https://api.singly.com/'
    }
  );
}

exports.apiCall = function (arg, cb) {
  if (!arg.auth.callerKey) {
    return cb(new Error('API caller key required for Zeo.' +
      ' Check Config/apikeys.json.example'));
  }

  var client = oauthClient(arg.auth);

  arg.params = arg.params || {};
  arg.params.key = arg.auth.callerKey;

  var uri = url.parse(API_BASE + arg.query + '?' +
    querystring.stringify(arg.params));

  client._performSecureRequest(arg.auth.token, arg.auth.tokenSecret, "GET", uri,
    null, '', 'application/json', function (err, body, response) {
    if (err) {
      return cb(err);
    }

    if (!body) {
      return cb(new Error('Empty response'));
    }

    body = JSON.parse(body);

    cb(err, body, response);
  });
};

exports.getIDFromBedTime = function (data) {
  var time = data.bedTime;
  return [
    time.year, time.month, time.day,
    time.hour, time.minute, time.second
  ].join('');
};

exports.getTimeFromStartDate = function (data) {
  var date = data.startDate;
  return Date.parse([date.month, date.day, date.year].join('-'));
};
