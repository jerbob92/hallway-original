var path = require('path');
var request = require('request');

var lib = require(path.join(__dirname, 'lib'));

exports.proxy = function(auth, req, res) {
  var options = {
    uri: lib.url(req.path),
    method: req.method,
    headers: {}
  };

  lib.addAuthHeader(auth, options.headers);

  if (req.method.toLowerCase() !== 'get') {
    options.headers.oflyAppId = auth.clientID;
  }

  if (req.rawBody) {
    options.headers['content-type'] = 'application/xml';
    options.body = req.rawBody;
  }

  request(options).pipe(res);
};
