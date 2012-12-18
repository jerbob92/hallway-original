var Fitbit = require('fitbit-js');
var util = require('util');

exports.proxy = function(auth, req, res) {
  var fb = Fitbit(auth.consumerKey, auth.consumerSecret);
  req.query.token = {
    oauth_token: auth.token,
    oauth_token_secret: auth.tokenSecret
  };
  fb.apiCall(req.method, req.url, req.query, function(err, resp, data) {
    if(err) return res.json(err, 500);
    res.json(data);
  });
}
