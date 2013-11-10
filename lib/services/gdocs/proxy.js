var lib = require('./lib');
var querystring = require('querystring');

exports.proxy = function(auth, req, res) {
    var arg = {
      uri: 'https://www.googleapis.com' + req.url,
      json: true,
      qs: req.query
    };
    arg.qs.access_token = auth.token.access_token;
  lib.get(auth, arg, function(err, resp, js){
    if(err) res.send(err, 500);
    res.send(js, resp.statusCode);
  });
};
