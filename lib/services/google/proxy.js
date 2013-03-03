var url = require('url');
var lib = require('./lib');

exports.proxy = function(auth, req, res) {
  function auther(auth) {
    console.log('using auth', auth);
    var arg = {
      uri: 'https://www.googleapis.com' + req.url,
      method: req.method,
      qs: req.query
    };
    arg.qs.access_token = auth.token.access_token;

    if (req.headers['content-type']) {
      arg.headers = { 'content-type': req.headers['content-type'] };

      if (arg.headers['content-type'].indexOf('json') > 0) {
        arg.json = req.body;
      } else {
        arg.body = new Buffer(req.rawBody, 'binary');
      }
    }
    return arg;
  }
  lib.getRequest(auther, auth, function(proxyReq, newAuth) {
    proxyReq.pipe(res);
  });
};
