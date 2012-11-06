/**
 * index.js
 * OAuth 2.0 provider
 *
 * @author Amir Malik
 */

var EventEmitter = require('events').EventEmitter,
     querystring = require('querystring'),
      serializer = require('serializer'),
         connect = require('connect');
var lutil = require('lutil');
var logger = require('logger').logger('oauth2-provider');

function OAuth2Provider(crypt_key, sign_key, old_crypt, old_sign) {
  this.serializer = serializer.createSecureSerializer(crypt_key, sign_key);
  this.oldserializer = serializer.createSecureSerializer(old_crypt, old_sign);
  this.version = '42';
}

OAuth2Provider.prototype = new EventEmitter();

OAuth2Provider.prototype.generateAccessToken = function(user_id, client_id, template) {
  var out = template || {};
  out.access_token = this.serializer.stringify([user_id, client_id, +new Date()]).replace(/\=/g, '.'); // the equals is scary looking in a query arg value
  out.refresh_token = null;
  out.account = user_id;
  return out;
};

OAuth2Provider.prototype.parseAccessToken = function(atok) {
    var data = [];
    atok = (atok && atok.replace(/\./g, '=')); // above we escape equalzes, fix em up here

    try {
      data = this.serializer.parse(atok);
    } catch(e) {
      try {
        data = this.oldserializer.parse(atok);
      } catch(e) {
        logger.error(e);
        throw new Error('Invalid OAuth access token.');
      }
      logger.warn("depreciated token",atok,data);
    }
    return {
      user_id: data[0],
      client_id: data[1],
      grant_date: new Date(data[2])
    };
}

OAuth2Provider.prototype.login = function() {
  var self = this;

  return function(req, res, next) {
    var atok;

    if(req.param('access_token')) {
      atok = req.param('access_token');
    } else if((req.headers.authorization || '').indexOf('Bearer ') === 0) {
      atok = req.headers.authorization.replace('Bearer', '').trim();
    } else {
      return next();
    }

    try {
      atok = self.parseAccessToken(atok);
    } catch(e) {
      return res.json(lutil.jsonErr("Invalid OAuth access token."), 400);
    }

    self.emit('access_token', req, atok, next);
  };
};

OAuth2Provider.prototype.oauth = function() {
  var self = this;

  return connect.router(function(app) {
    app.get('/oauth/authorize', function(req, res, next) {
      var    client_id = req.query.client_id,
          redirect_uri = req.query.redirect_uri;

      if(!client_id || !redirect_uri) {
        res.writeHead(400);
        return res.end('client_id and redirect_uri required');
      }

      // authorization form will be POSTed to same URL, so we'll have all params
      var authorize_url = req.url;

      self.emit('enforce_login', req, res, authorize_url, function(user_id) {
        // store user_id in an HMAC-protected encrypted query param
        authorize_url += '&' + querystring.stringify({x_user_id: self.serializer.stringify(user_id)});

        // user is logged in, render approval page
        self.emit('authorize_form', req, res, client_id, authorize_url);
      });
    });

    app.post('/oauth/authorize', function(req, res, next) {
      var     client_id = req.query.client_id,
           redirect_uri = req.query.redirect_uri,
          response_type = req.query.response_type || 'code',
                  state = req.query.state,
              x_user_id = req.query.x_user_id;

      var url = redirect_uri;

      switch(response_type) {
        case 'code': url += (url.indexOf('?') > 0) ? '&' : '?'; break;
        case 'token': url += '#'; break;
        default:
          res.writeHead(400);
          return res.end('invalid response_type requested');
      }

      if('allow' in req.body) {
        if('token' === response_type) {
          var user_id;

          try {
            user_id = self.serializer.parse(x_user_id);
          } catch(e) {
            console.error('allow/token error', e.stack);

            res.writeHead(500);
            return res.end(e.message);
          }

          self.emit('create_access_token', user_id, client_id, function(template) {
            url += querystring.stringify(self.generateAccessToken(user_id, client_id, template));

            res.writeHead(303, {Location: url});
            res.end();
          });
        } else {
          var code = serializer.randomString(128);

          self.emit('save_grant', req, client_id, code, function() {
            var extras = {
              code: code
            };

            // pass back anti-CSRF opaque value
            if(state)
              extras.state = state;

            url += querystring.stringify(extras);

            res.writeHead(303, {Location: url});
            res.end();
          });
        }
      } else {
        url += querystring.stringify({error: 'access_denied'});

        res.writeHead(303, {Location: url});
        res.end();
      }
    });

    app.post('/oauth/access_token', function(req, res, next) {
      var     client_id = req.body.client_id,
          client_secret = req.body.client_secret,
           redirect_uri = req.body.redirect_uri,
                   code = req.body.code;

      self.emit('lookup_grant', client_id, client_secret, code, function(err, user_id) {
        if(err) {
          res.writeHead(400);
          return res.end(err.message);
        }

        res.writeHead(200, {'Content-type': 'application/json'});

        self.emit('create_access_token', user_id, client_id, function(template) {
          res.end(JSON.stringify(self.generateAccessToken(user_id, client_id, template)));
        });

        self.emit('remove_grant', user_id, client_id, code);
      });
    });
  });
};

exports.OAuth2Provider = OAuth2Provider;
