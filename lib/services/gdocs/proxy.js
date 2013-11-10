var lib = require('./lib');
var querystring = require('querystring');

exports.proxy = function(auth, req, res) {
  var url = 'https://docs.google.com/feeds' + req.url +
            '?alt=json&v=3&access_token=' + auth.token.access_token;
  var qs = querystring.stringify(req.query);
  if (qs) url += '&' + qs;
  lib.get(auth, {
    uri  : url,
    json : true
  }, function(err, resp, js){
    if(err) res.send(err, 500);
    res.send(js, resp.statusCode);
  });
};
