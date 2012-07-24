var mocha   = require('mocha');
var should  = require('should');
var browser = require('supertest');

var api = require('webservice').api;
var authManager = require('authManager');

describe('Posting Out', function() {
  var access_token;

  beforeEach(function(done) {
    require('node-fakeweb').tearDown();
    access_token = authManager.provider.generateAccessToken(1, 1, {}).access_token;
    done();
  });

  function itValidatesServices(params) {
    it('responds with HTTP 400', function(done) {
      params.access_token = access_token;
      browser(api).
        post('/types/statuses').
        send(params).
        expect(400).
        end(done);
    });

    it('gives you an error message', function(done) {
      params.access_token = access_token;
      browser(api).
        post('/types/statuses').
        send(params).
        end(function(err, res) {
          if (err) return done(err);
          res.body.error.should.equal('Must include "services" parameter.');
          should.exist(res.body.error);
          done();
        });
    });
  }

  describe('when you forget the services parameter', function() {
    itValidatesServices({});
  });

  describe('when you pass an empty services paramter', function() {
    itValidatesServices({services: null});
    itValidatesServices({services: ''});
  });
});
