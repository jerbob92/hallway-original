var lib = require('./lib');
var request = require('request');

exports.proxy = function(auth, req, res) {
  lib.apiCall({auth:auth, query: req.url, params: req.query}, function(err, body){
    if (err) res.send(err);
    res.send(body);
  });
}
