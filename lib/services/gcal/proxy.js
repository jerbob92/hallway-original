var lib = require('./lib');
var querystring = require('querystring');

exports.proxy = function(auth, req, res) {
  var url = "https://www.googleapis.com/calendar/v3" + req.url +
            "?key=" + auth.appKey;
  var qs = querystring.stringify(req.query);
  if (qs) url += '&' + qs;
  lib.get(auth, {uri: url}, function(err, resp, js){
    if(err) res.send(err, 500);
    res.send(js, resp.statusCode);
  });
};
