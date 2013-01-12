var request = require('request');
var xml2js = require('xml2js');

var SHUTTERFLY_API_BASE = 'https://ws.shutterfly.com';

exports.url = function(path, userID) {
  if (userID) path = '/userid/' + userID + path;
  return SHUTTERFLY_API_BASE + path;
};

exports.addAuthHeader = function(auth, headers) {
  headers.authorization = 'SFLY user-auth=' + auth.accessToken;
};

exports.get = function(auth, path, options, callback) {
  exports.apiCall('GET', auth, path, options, callback);
};

exports.apiCall = function(method, auth, path, options, callback) {
  if (!callback && typeof(options) === 'function') {
    callback = options;
    options = null;
  }

  if (!options) options = {};
  if (!options.headers) options.headers = {};
  exports.addAuthHeader(auth, options.headers);

  options.method = method;
  options.uri = exports.url(path, auth.user);

  request(options, function (err, resp, xml) {
    if (err) return callback(err);

    if (resp.statusCode !== 200) {
      return callback('statusCode ' + resp.statusCode + ' ' + xml);
    }

    var parser = new xml2js.Parser();

    parser.parseString(xml, function (err, js) {
      if (err) return callback(err);
      if (!js || !js.feed) return callback('invalid response: ' + xml);
      return callback(null, js);
    });
  });
};
