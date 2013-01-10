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

  request(options).pipe(res);
};
