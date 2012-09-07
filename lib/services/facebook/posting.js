var path    = require('path');
var request = require('request');

var fb = require(path.join(__dirname, 'lib.js'));

module.exports = {
  statuses: function(data, callback) {
    var url = fb.apiUrl({
      accessToken: data.auth.accessToken
    }, '/me/feed', {});
    request.post(url, {
      qs: {
        message: data.body
      }
    }, function(err, response, body) {
      if (typeof(body) === 'string') body = JSON.parse(body);
      if (body.error) return callback(null, {error: body.error.message});
      callback(null, body);
    });
  },
  links: function(data, callback) {
    var url = fb.apiUrl({
      accessToken: data.auth.accessToken
    }, '/me/links', {});
    request.post(url, {
      qs: {
        message: data.body,
        link: data.url
      }
    }, function(err, response, body) {
      if (typeof(body) === 'string') body = JSON.parse(body);
      if (body.error) return callback(null, {error: body.error.message});
      callback(null, body);
    });
  }
};
