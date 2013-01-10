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
    }
  };

  var api = (req.url.indexOf("/files") === 0 ||
    req.url.indexOf('/thumbnails') === 0) ? "api-content" : "api";

  arg.url = 'https://' + api + '.dropbox.com/1' +
    req.url.split("/").map(encodeURIComponent).join('/');

  if (req.headers['content-type']) {
    req.headers = { 'content-type': req.headers['content-type'] };

    if (req.headers['content-type'].indexOf('form') > 0) {
      arg.form = req.body;
    } else if (req.headers['content-type'].indexOf('json') > 0) {
      arg.json = req.body;
    } else {
      arg.body = req.body;
    }
  }

  if (req.query && Object.keys(req.query).length > 0) {
    arg.url += '?' + querystring.stringify(req.query);
  }

  request(arg).pipe(res);
};
