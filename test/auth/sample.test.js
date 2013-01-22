var should = require('chai').should();

var querystring = require('querystring');
var express = require('express');
var request = require('request');
var path = require('path');
var helper = require(path.join(__dirname, '..', 'support', 'locker-helper.js'));

helper.configurate();

var dal = require('dal');

dal.setBackend('fake');

var fakeDB = dal.getBackendModule();

describe('when creating an OAuth flow', function () {
  var app;
  var curAccessToken;
  var hostUrl = 'http://localhost:8043';
  var clientId = 1;
  var clientSecret = '1secret';
  var port = 8083;

  before(function () {
    fakeDB.addNoOp(/INSERT INTO Profiles \(id, service, worker\) VALUES/);

    app = express();

    app.get('/', function (req, res) {
      var tw = querystring.stringify({
        client_id    : clientId,
        redirect_uri : 'http://localhost:' + port + '/callback',
        service      : 'twitter'
      });

      var fb = querystring.stringify({
        client_id    : clientId,
        redirect_uri : 'http://localhost:' + port + '/callback',
        service      : 'facebook'
      });

      res.send('<html><a href="' + hostUrl + '/oauth/authorize?' + tw +
        '">auth twitter</a>' + ' or <a href="' + hostUrl + '/oauth/authorize?' +
        fb + '">auth facebook</a></html>');
    });

    app.get('/callback', function (req, res) {
      // would normally do the regular OAuth 2 code --> access token exchange
      // here.
      var data = {
        client_id     : clientId,
        client_secret : clientSecret,
        code          : req.param('code')
      };

      request.post({
        uri: hostUrl + '/oauth/access_token',
        body: querystring.stringify(data),
        headers: {'Content-Type' : 'application/x-www-form-urlencoded'}
      }, function (err, resp, body) {
        try {
          body = JSON.parse(body);
        }
        catch (err) {
          console.error('Error authing against cakebeak:', err);
          return res.send(err, 500);
        }

        /*
         * AOOOGA CLOSURE VIOLATION ERROR!
         * This only works because tests are local.
         */
        curAccessToken = body.access_token;

        return res.send('wahoo! <a href="' + hostUrl +
          '/awesome?access_token=' + body.access_token + '">tokenized test</a>');
      });
    });

    app.listen(port);
  });

  it('should be able to start Twitter auth flow', function (done) {
    var authUrl = 'http://localhost:8043/oauth/authorize?client_id=1' +
      '&redirect_uri=http%3A%2F%2Flocalhost%3A8083%2Fcallback&service=twitter';

    request.get('http://localhost:8083/', function (err, response, body) {
      response.statusCode.should.equal(200);
      should.exist(body);
      body.should.include(authUrl);
      done();
      /*
       * push button, receive bacon:
       *
       * request.get(authUrl, function (err, response, body) {
       *    console.error('body:', body);
       *    response.statusCode.should.equal(200);
       *    should.exist(body);
       *    body.should.include(curAccessToken);
       *
       *    return done();
       * });
       */
    });
  });

  // TODO: do that
  it('should be able to authenticate Twitter via Hallway');

  it('should be able to start Facebook auth flow', function (done) {
    var authUrl = 'http://localhost:8043/oauth/authorize?client_id=1' +
      '&redirect_uri=http%3A%2F%2Flocalhost%3A8083%2Fcallback&service=facebook';

    request.get('http://localhost:8083/', function (err, response, body) {
      response.statusCode.should.equal(200);
      should.exist(body);
      body.should.include(authUrl);
      done();
      /*
       * http://i1.kym-cdn.com/entries/icons/original/000/000/652/pushbutton.jpg
       *
       * request.get(authUrl, function (err, response, body) {
       *   console.error('body:', body);
       *   response.statusCode.should.equal(200);
       *   should.exist(body);
       *   body.should.include(curAccessToken);
       *
       *   return done();
       * });
       */
    });

    // TODO: do that
    it('should be able to authenticate Facebook via Hallway');
  });
});
