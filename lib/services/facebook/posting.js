var fs      = require('fs');
var mime    = require('mime');
var path    = require('path');
var request = require('request');
var _       = require('underscore');

var fb = require(path.join(__dirname, 'lib.js'));

function post(endpoint, data, params, callback) {
  var url = fb.apiUrl({
    accessToken: data.auth.accessToken
  }, '/me/' + endpoint, {});
  _.extend(params.qs, data.facebook_params);
  request.post(url, params, function(err, response, body) {
    if (typeof(body) === 'string') try {
      body = JSON.parse(body);
    } catch(E) {}
    if (typeof body !== 'object') {
      return callback(null, {error: 'Result isnt an object: ' + body});
    }
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
    return post('feed', data, {
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
        qs: {
          message: data.body || ''
        },
        multipart: [
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
