var url = require('url');
var request = require('request');

exports.proxy = function(auth, req, res) {
  var uri = url.parse('https://www.googleapis.com' + req.url);
  uri.query = req.query;
  uri.query.access_token = auth.accessToken;
  // trying to mirror everything needed from orig req
  var arg = {method: req.method};
  arg.uri = url.format(uri);

  if (req.headers['content-type']) {
    arg.headers = { 'content-type': req.headers['content-type'] };

    if (arg.headers['content-type'].indexOf('json') > 0) {
      arg.json = req.body;
    } else {
      arg.body = new Buffer(req.rawBody, 'binary');
    }
  }

  request(arg).pipe(res);
};
