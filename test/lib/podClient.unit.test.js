var should = require('chai').should();

var fakeweb = require('node-fakeweb');
var url     = require('url');

var dalFake        = require('dal-fake');
var dal            = require('dal');
dal.setBackend('fake');
var ijod           = require('ijod');
var lconfig        = require('lconfig');
var profileManager = require('profileManager');
var podClient      = require('podClient');

describe('podClient', function() {
  beforeEach(function(done) {
    dalFake.reset();
    fakeweb.allowNetConnect = false;
    lconfig.taskman.store = {
      type: 'mem'
    };
    profileManager.init(done);
  });

  afterEach(function() {
    fakeweb.tearDown();
  });

  describe('getRange', function() {
    describe('when the base does not contain a pid', function() {
      it('errors', function(done) {
        podClient.getRange('bad:base/path', {}, function(item) {
          // Pass on each
        }, function(err) {
          err.message.should.eql('No PID in base bad:base/path');
          done();
        });
      });
    });

    describe('when the Profile does not exist', function() {
      beforeEach(function() {
        dalFake.addFake(/SELECT \* FROM Profiles/i, []);
      });

      it('errors', function(done) {
        podClient.getRange('thing:user@service/path', {}, function(item) {
          // Pass on each
        }, function(err) {
          err.message.should.eql('Profile does not exist: user@service');
          done();
        });
      });
    });

    describe('when there is no pod ID', function() {
      var origGetRange;

      beforeEach(function() {
        dalFake.addFake(/SELECT \* FROM Profiles/i, [{
          pod: null
        }]);
        origGetRange = ijod.getRange;
        ijod.getRange = function(basePath, range, cbEach, cbDone) {
          cbEach('Hello');
          return cbDone();
        };
      });

      afterEach(function() {
        ijod.getRange = origGetRange;
      });

      it('delegates to ijod', function(done) {
        var items = [];
        podClient.getRange('thing:user@service/path', {}, function(item) {
          items.push(item);
        }, function(err) {
          items.should.eql(['Hello']); // Our IJOD mock got called
          done();
        });
      });
    });

    describe('when there is a pod ID', function() {
      beforeEach(function() {
        dalFake.addFake(/SELECT \* FROM Profiles/i, [{
          pod: 1
        }]);
      });

      it('passes through the parameters', function(done) {
        fakeweb.registerUri({
          uri: url.format({
            protocol: 'http',
            hostname: 'pod1.localhost',
            port: lconfig.podService.port,
            pathname: '/range',
            query: {
              basePath: 'thing:user@service/path',
              range: JSON.stringify({
                my: 'range'
              })
            }
          }),
          method: 'GET',
          body: JSON.stringify({
            data: ['data']
          })
        });

        var items = [];
        podClient.getRange('thing:user@service/path', {
          my: 'range'
        }, function(item) {
          items.push(item);
        }, function(err) {
          items.should.eql(['data']);
          done();
        });
      });

      describe('when the pod service reports an error', function() {
        beforeEach(function() {
          fakeweb.registerUri({
            uri: url.format({
              protocol: 'http',
              hostname: 'pod1.localhost',
              port: lconfig.podService.port,
              pathname: '/range',
              query: {
                basePath: 'thing:user@service/path',
                range: '{}'
              }
            }),
            method: 'GET',
            body: JSON.stringify({
              error: 'Oh no!'
            })
          });
        });

        it('errors', function(done) {
          podClient.getRange('thing:user@service/path', {}, function(item) {
            // Pass on each
          }, function(err) {
            err.message.should.eql('Oh no!');
            done();
          });
        });
      });

      describe('when the pod service returns data', function() {
        beforeEach(function() {
          fakeweb.registerUri({
            uri: url.format({
              protocol: 'http',
              hostname: 'pod1.localhost',
              port: lconfig.podService.port,
              pathname: '/range',
              query: {
                basePath: 'thing:user@service/path',
                range: '{}'
              }
            }),
            method: 'GET',
            body: JSON.stringify({
              data: [
                'tweedledee',
                'tweedledumb'
              ]
            })
          });
        });

        it('calls cbEach for each item', function(done) {
          var items = [];
          podClient.getRange('thing:user@service/path', {}, function(item) {
            items.push(item);
          }, function(err) {
            items.should.eql(['tweedledee', 'tweedledumb']);
            done();
          });
        });

        it('calls cbDone without error', function(done) {
          podClient.getRange('thing:user@service/path', {}, function(item) {
            // Pass on each
          }, function(err) {
            should.not.exist(err);
            done();
          });
        });
      });
    });
  });
});

