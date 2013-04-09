var gdata = require('gdata-js');

exports.proxy = function (auth, req, res) {
  gdata.clientFromAuth(auth).getFeed('http://gdata.youtube.com/feeds/api' + req.url,
    req.query, function (err, result) {
    res.send(result);
  });
};
