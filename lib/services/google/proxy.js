var lib = require('./lib');
var profileManager = require('profileManager');
var logger = require('logger');

exports.proxy = function(auth, req, res) {
  function auther(auth) {
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
    if (newAuth) {
      profileManager.authSet(auth.pid, req._authsome.app, newAuth, function() {
        logger.debug('Google token refreshed and auth updated.');
      });
    }

    proxyReq.pipe(res);
  });
};
