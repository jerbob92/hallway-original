var fs      = require('fs');
var path    = require('path');
var request = require('request');

var TUMBLR_API_BASE = 'https://api.tumblr.com/v2';

function post(data, params, callback) {
  var blogName = data.profile;
  // Tumblogs can't include a dot, so if it does, assume a custom domain
  if (blogName.indexOf('.') === -1) blogName = blogName + '.tumblr.com';
  var url = TUMBLR_API_BASE + '/blog/' + blogName + '/post';

  params.oauth = {
    consumer_key: data.auth.consumerKey,
    consumer_secret: data.auth.consumerSecret,
    token: data.auth.token.oauth_token,
    token_secret: data.auth.token.oauth_token_secret
  };
  request.post(url, params, function(err, response, body) {
    return callback(null, body);
  });
}

function postStatus(data, callback) {
  var params = {
    type: 'text',
    body: data.body
  };
  if (data.title) params.title = data.title;
  post(data, { form: params }, callback);
}

module.exports = {
  statuses: postStatus
};
