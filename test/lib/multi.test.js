var mocha   = require('mocha');
var should  = require('should');
var browser = require('supertest');
var assert = require('assert');
var qs = require('querystring');

var api = require('webservice').api;
var authManager = require('authManager');

var urls = [
  'http://localhost:8041/v0/services/linkedin/connections?access_token=',
  'http://localhost:8041/v0/services?access_token='
]

// TODO: Faking a user through auth with an account and profiles is hard
describe('Multi Requests', function() {
  var access_token;

  beforeEach(function(done) {
    require('node-fakeweb').tearDown();
    access_token = authManager.provider.generateAccessToken(1, 1, {}).access_token;
    done();
  });

  function itValidatesUrls(params) {
    it('responds with HTTP 400', function(done) {
      browser(api).
        get('/multi').
        expect(400).
        end(function(err, res) {
          done();
        });
    });
  }

  function itAcceptsAFewURLs(urls) {
    it('responds with HTTP 200', function(done) {
      for(var i in urls) { urls[i] += access_token; }
      var url = '/multi?urls=' + encodeURIComponent(urls.join(','));
      browser(api).
        get(url).
        expect(200).
        end(function(err, res) {
          for(var i in urls) {
            should.exist(res.body[urls[i]]);
          }
          done();
        });
    });
  }

  function itDoesntAcceptALotOfUrl() {
    it('responds with HTTP 400', function(done) {
      var lots = [];
      for(var i = 0; i < 200; i++) {
        lots.push(urls[i%2]);
      }
      for(var i in urls) { urls[i] += access_token; }
      var url = '/multi?urls=' + encodeURIComponent(lots.join(','));
      browser(api).
        get(url).
        expect(400).
        end(done);
    });
  }

  describe('when you forget the urls parameter', function() {
    itValidatesUrls({});
  });

  describe('when you include a valid urls parameter', function() {
    itAcceptsAFewURLs(urls);
  });

  describe('when you include a urls parameter that is too long', function() {
    itDoesntAcceptALotOfUrl(urls);
  });

});
