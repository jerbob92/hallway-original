var path    = require('path');
var request = require('request');

var fb = require(path.join(__dirname, 'lib.js'));

function post(endpoint, data, params, callback) {
  var url = fb.apiUrl({
    accessToken: data.auth.accessToken
  }, '/me/' + endpoint, {});
  request.post(url, {
    qs: params
  }, function(err, response, body) {
    if (typeof(body) === 'string') body = JSON.parse(body);
    if (body.error) return callback(null, {error: body.error.message});
    callback(null, body);
  });
}


module.exports = {
  statuses: function(data, callback) {
    return post('feed', data, {
      message: data.body
    }, callback);
  },
  links: function(data, callback) {
    return post('links', data, {
      message: data.body,
      link: data.url
    }, callback);
  }
};
