var url = require('url');
var request = require('request');

exports.proxy = function(auth, req, res) {
  var uri = url.parse('https://api.instagram.com/v1' + req.url);
  uri.query = req.query;
  uri.query.access_token = auth.token.access_token;

  // trying to mirror everything needed from orig req
  var arg = {
    method: req.method,
    uri: url.format(uri)
  };

  if (req.headers['content-type']) {
    // post or put only?
    arg.body = req.body;
  }

  arg.json = true;

  request(arg).pipe(res);
};
