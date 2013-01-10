var request = require('request');
var xml2js = require('xml2js');

var SHUTTERFLY_API_BASE = 'https://ws.shutterfly.com/';

exports.url = function(path, userID) {
  if (userID) path = '/userid/' + userID + path;
  return SHUTTERFLY_API_BASE + path;
};

exports.get = function(pi, path, options, callback) {
  if (!callback && typeof(options) === 'function') {
    callback = options;
    options = null;
  }

  if (!options) options = {};
  if (!options.headers) options.headers = {};
  options.headers.authorization = 'SFLY user-auth=' + pi.auth.accessToken;
  options.json = true;

  var url = exports.url(path, pi.auth.user);
  request.get(url, options, function (err, resp, xml) {
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
