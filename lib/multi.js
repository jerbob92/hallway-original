var urllib = require('url');

var request = require('request');
var async = require('async');

var lconfig = require('lconfig');

// issue multiple queries in one
module.exports.get = function(req, res) {
  var urls = req.param('urls');
  if (!urls) return res.jsonErr('missing required parameter urls', 400);
  urls = urls.split(',');
  if (!urls.length === 0) return res.jsonErr('invalid urls value:', 400);
  if (urls.length > lconfig.multiLimit) {
    return res.jsonErr('limited to ' + lconfig.multiCount + ' urls (want ' +
                       'more? email simon@singly.com)', 400);
  }

  // issue them all in parallel, and then collect the results, indexed by the
  // passed in url
  var response = {};
  async.forEach(urls, function(thisURL, cbEach) {
    // make sure all calls are to us!
    var localURL = 'http://localhost:' + lconfig.externalPort +
                   urllib.parse(thisURL).path;
    var start = Date.now();
    request.get({uri:localURL, json:true}, function(err, resp, body) {
      var et = Date.now() - start;
      var thisResp = {
        body: body,
        _elapsedTime: et
      };
      if (resp) thisResp.statusCode = resp.statusCode;
      if (err) thisResp.error = err;
      response[thisURL] = thisResp;
      cbEach();
    });
  }, function(err) {
    res.json(response);
  });
}
