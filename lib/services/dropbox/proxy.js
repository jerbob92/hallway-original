var querystring = require('querystring');
var request = require('request');

exports.proxy = function (auth, req, res) {
  // Mirror everything needed from the original requesdt
  var arg = {
    oauth: {
      consumer_key: auth.consumerKey,
      consumer_secret: auth.consumerSecret,
      token: auth.token,
      token_secret: auth.tokenSecret
    },
    method: req.method
  };

  var api = (req.url.indexOf("/files") === 0 ||
    req.url.indexOf('/thumbnails') === 0) ? "api-content" : "api";

  arg.url = 'https://' + api + '.dropbox.com/1' +
    req.url.split("/").map(encodeURIComponent).join('/');

  if (req.headers['content-type']) {
    arg.headers = { 'content-type': req.headers['content-type'] };

    if (arg.headers['content-type'].indexOf('form') > 0) {
      arg.form = req.body;
    } else if (arg.headers['content-type'].indexOf('json') > 0) {
      arg.json = req.body;
    } else {
      arg.body = req.rawBody;
    }
  }

  if (req.query && Object.keys(req.query).length > 0) {
    arg.url += '?' + querystring.stringify(req.query);
  }

  request(arg).pipe(res);
};
