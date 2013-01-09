var gdata = require('gdata-js');

exports.proxy = function (auth, req, res) {
  gdata.clientFromAuth(auth).getFeed('https://www.google.com/m8/feeds' + req.url,
    req.query, function (err, result) {
    res.send(result);
  });
};
