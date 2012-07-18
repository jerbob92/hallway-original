var mocha   = require('mocha');
var should  = require('should');
var browser = require('supertest');

var api = require('webservice').api;

describe('Posting Out', function() {
  beforeEach(function(done) {
    require('node-fakeweb').tearDown();
    done();
  });

  function itValidatesServices(params) {
    it('responds with HTTP 400', function(done) {
      browser(api).
        post('/types/statuses', params).
        expect(400).
        end(done);
    });

    it('gives you an error message', function(done) {
      browser(api).
        post('/types/statuses', params).
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
