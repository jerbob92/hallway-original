var fs      = require('fs');
var mime    = require('mime');
var path    = require('path');
var request = require('request');
var _       = require('underscore');


var podClient = require('podClient');
var fb = require(path.join(__dirname, 'lib.js'));

function actingAsUser(data) {
  return _.isEmpty(data.from.profile) ||
         data.from.profile === data.auth.profile.id;
}

function selectToken(data, callback) {
  if (actingAsUser(data)) return callback(null, data.auth.accessToken);

  var base = 'page:' + data.auth.pid + '/pages';
  var accessToken;

  podClient.getRange(base, {}, function(page) {
    if (page.data.id === data.from.profile) {
      accessToken = page.data.access_token;
    }
  }, function(err, flags) {
    if (err) return callback('Singly error: ' + err + '. ' +
                             'Please let us know at support@singly.com');
    if (_.isEmpty(accessToken)) {
      var pid = [data.from.profile, data.from.service].join('@');
      return callback(
        'No token available for ' + pid + '. ' +
        'It is likely that the ID is wrong, ' +
        'your user does not administer that page, ' +
        'or your application has not requested the "manage_pages" permission.'
      );
    }
    return callback(null, accessToken);
  });
}

function post(endpoint, data, params, callback) {
  selectToken(data, function(err, token) {
    if (err) return callback(null, {error: err});
    var url = fb.apiUrl({
      accessToken: token
    }, ['', data.to.profile || 'me', endpoint].join('/'), {});
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
  news: function(data, callback) {
    return post('feed', data, {
      qs: {
        message: data.body,
        link: data.url
      }
    }, callback);
  },
  links: function(data, callback) {
    // Technically not the correct name, but leaving it for
    // compatibility and friendliness
    return this.news(data, callback);
  },
  og: function(data, callback) {
    var ogParams = {};
    _.forEach(data.httpParams, function(value, key) {
      var match = key.match(/og_(.+)/);
      if (match) ogParams[match[1]] = value;
    });
    return post(data.httpParams.action, data, {
      qs: ogParams
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
