function getClient(auth) {
  var gdataClient = require('gdata-js')(auth.appKey || auth.clientID,
    auth.appSecret || auth.clientSecret,
    auth.redirectURI);

  gdataClient.setToken(auth.token);

  return gdataClient;
}

exports.proxy = function(auth, req, res) {
  getClient(auth).getFeed('https://gdata.youtube.com/feeds/api' + req.url,
    req.query, function(err, result) {
    res.send(result);
  });
};
