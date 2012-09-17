var fs      = require('fs');
var mime    = require('mime');
var path    = require('path');
var request = require('request');

var fb = require(path.join(__dirname, 'lib.js'));

function post(endpoint, data, params, callback) {
  var url = fb.apiUrl({
    accessToken: data.auth.accessToken
  }, '/me/' + endpoint, {});
  request.post(url, params, function(err, response, body) {
    if (typeof(body) === 'string') body = JSON.parse(body);
    if (body.error) return callback(null, {error: body.error.message});
    callback(null, body);
  });
}

module.exports = {
  statuses: function(data, callback) {
    return post('feed', data, {
      qs: {
        message: data.body
      }
    }, callback);
  },
  links: function(data, callback) {
    return post('links', data, {
      qs: {
        message: data.body,
        link: data.url
      }
    }, callback);
  },
  photos: function(data, callback) {
    fs.readFile(data.photo.path, function(err, photo) {
      if (err) return callback(null, {
        error: 'There was a problem uploading your photo.'}
      );

      post('photos', data, {
        headers: { 'content-type': 'multipart/form-data' },
        multipart: [
          {
            'Content-Disposition': 'form-data; name="message"',
            body: data.body || ''
          },
          {
            'Content-Disposition':
              'form-data; name="source"; filename="' + data.photo.name + '"',
            'Content-Type':
              mime.lookup(data.photo.name),
            body: photo
          }
        ]
      }, callback);
    });
  }
};
