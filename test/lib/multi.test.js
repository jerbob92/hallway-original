var mocha   = require('mocha');
var should  = require('should');
var browser = require('supertest');
var assert = require('assert');
var qs = require('querystring');

var api = require('webservice').api;
var authManager = require('authManager');
var atok = authManager.provider.generateAccessToken(1, 1, {}).access_token;

var URLS = [
  'http://localhost:8041/v0/services/linkedin/connections?access_token=' + atok,
  'http://localhost:8041/v0/services?access_token=' + atok
];

var MULTI_MULTI = ['/multi', '/v0/multi', 'multi', 'v0/multi'];

var MULTI_SAFE = ['/v0/services/linkedin/multi'];

// TODO: Faking a user through auth with an account and profiles is hard
describe('Multi Requests', function() {
  var access_token;

  beforeEach(function(done) {
    require('node-fakeweb').tearDown();
    done();
  });

  describe('when you forget the urls parameter', function() {
    it('responds with HTTP 400', function(done) {
      browser(api).
        get('/multi').
        expect(400).
        end(function(err, res) {
          done();
        });
    });
  });

  describe('when you include a valid urls parameter', function() {
    it('responds with HTTP 200', function(done) {
      var url = '/multi?urls=' + encodeURIComponent(URLS.join(','));
      browser(api).
        get(url).
        expect(200).
        end(function(err, res) {
          for(var i in URLS) {
            should.exist(res.body[URLS[i]]);
          }
          done();
        });
    });
  });

  describe('when you include a urls parameter that is too long', function() {
    it('responds with HTTP 400', function(done) {
      var lots = [];
      for(var i = 0; i < 200; i++) {
        lots.push(URLS[i%2]);
      }
      var url = '/multi?urls=' + encodeURIComponent(lots.join(','));
      browser(api).
        get(url).
        expect(400).
        end(done);
    });
  });

  describe('when you include a call to the /multi endpoint', function() {
    it('doesn\'t allow it', function(done) {
      var url = '/multi?urls=' + encodeURIComponent(MULTI_MULTI.join(','));
      browser(api).
        get(url).
        expect(200).
        end(function(err, resp) {
          for (var i in MULTI_MULTI) {
            should.exist(resp.body[MULTI_MULTI[i]].error);
            should.not.exist(resp.body[MULTI_MULTI[i]].body);
          }
          done();
        });
    });
  });

  // this one isn't great, because in theory, the error could contain the
  // word error from somewhere else
  describe('when you call a URL containing the word multi', function() {
    it('does allow it', function(done) {
      var url = '/multi?urls=' + encodeURIComponent(MULTI_SAFE.join(','));
      browser(api).
        get(url).
        expect(200).
        end(function(err, resp) {
          for (var i in MULTI_SAFE) {
            console.error('resp.body', resp.body);
            console.error('MULTI_SAFE[i]', MULTI_SAFE[i]);
            var body = resp.body[MULTI_SAFE[i]].body;
            should.equal(body.error, 'This request requires a valid access_token.');
          }
          done();
        });
    });
  });

});
