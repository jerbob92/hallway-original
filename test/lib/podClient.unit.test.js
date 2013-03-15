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

function noop() {}

function itFallsBackToNexusLookups(ijodFn, endpoint, cbEach) {
  describe('when the base does not contain a pid', function() {
    it('looks in the nexus', function(done) {
      fakeweb.registerUri({
        uri: url.format({
          protocol: 'http',
          hostname: lconfig.nexus.host,
          port: lconfig.nexus.port,
          pathname: endpoint,
          query: {
            basePath: 'thing:app/path',
            range: JSON.stringify({})
          }
        }),
        method: 'GET',
        body: JSON.stringify({
          result: 'result'
        })
      });

      function cbDone(err, result) {
        result.should.eql('result');
        done();
      }

      // If cbEach exists, we pass it in and the fn gets both.
      // Otherwise, the fn expects cbDone third and ignores number four
      if (cbEach) podClient[ijodFn]('thing:app/path', {}, cbEach, cbDone);
      else podClient[ijodFn]('thing:app/path', {}, cbDone);
    });
  });

  describe('when the Profile does not exist', function() {
    beforeEach(function() {
      dalFake.addFake(/SELECT \* FROM Profiles/i, []);
    });

    it('looks in the nexus', function(done) {
      fakeweb.registerUri({
        uri: url.format({
          protocol: 'http',
          hostname: lconfig.nexus.host,
          port: lconfig.nexus.port,
          pathname: endpoint,
          query: {
            basePath: 'thing:user@app/path',
            range: JSON.stringify({})
          }
        }),
        method: 'GET',
        body: JSON.stringify({
          result: 'result'
        })
      });

      function cbDone(err, result) {
        result.should.eql('result');
        done();
      }

      podClient[ijodFn]('thing:user@app/path', {}, cbEach || cbDone, cbDone);
    });
  });
}

function itPassesTheRightParameters(ijodFn, endpoint, cbEach) {
  it('passes through the parameters', function(done) {
    fakeweb.registerUri({
      uri: url.format({
        protocol: 'http',
        hostname: 'lb.pod1.localhost',
        port: lconfig.pods.port,
        pathname: endpoint,
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

    // By virtue of reaching cbDone, we know we generated the right
    // URL, or else fakeweb would have yelled.
    podClient[ijodFn]('thing:user@service/path', {
      my: 'range'
    }, cbEach || done, done);
  });
}

function itHandlesRemoteErrors(ijodFn, endpoint, cbEach) {
  describe('when the pod service reports an error', function() {
    beforeEach(function() {
      fakeweb.registerUri({
        uri: url.format({
          protocol: 'http',
          hostname: 'lb.pod1.localhost',
          port: lconfig.pods.port,
          pathname: endpoint,
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
      function cbDone(err, result) {
        err.message.should.eql('Oh no!');
        done();
      }

      podClient[ijodFn]('thing:user@service/path', {}, cbEach || cbDone, cbDone);
    });
  });
}

describe('podClient', function() {
  beforeEach(function(done) {
    dalFake.reset();
    fakeweb.allowNetConnect = false;
    fakeweb.allowLocalConnect = false;
    lconfig.taskman.store = {
      type: 'mem'
    };
    profileManager.init(done);
  });

  afterEach(function() {
    fakeweb.tearDown();
  });

  describe('getBounds', function() {
    itFallsBackToNexusLookups('getBounds', '/bounds');

    describe('when there is no pod ID', function() {
      var origGetBounds;

      beforeEach(function() {
        dalFake.addFake(/SELECT \* FROM Profiles/i, [{
          pod: null
        }]);
        origGetBounds = ijod.getBounds;
        ijod.getBounds = function(basePath, range, cbDone) {
          return cbDone(null, 'result');
        };
      });

      afterEach(function() {
        ijod.getBounds = origGetBounds;
      });

      it('delegates to ijod', function(done) {
        var items = [];
        podClient.getBounds('thing:user@service/path', {}, function(err, result) {
          result.should.eql('result');
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

      itPassesTheRightParameters('getBounds', '/bounds');
      itHandlesRemoteErrors('getBounds', '/bounds');

      describe('when the pod service returns data', function() {
        beforeEach(function() {
          fakeweb.registerUri({
            uri: url.format({
              protocol: 'http',
              hostname: 'lb.pod1.localhost',
              port: lconfig.pods.port,
              pathname: '/bounds',
              query: {
                basePath: 'thing:user@service/path',
                range: '{}'
              }
            }),
            method: 'GET',
            body: JSON.stringify({result: 'result'})
          });
        });

        it('calls cbDone with the result', function(done) {
          podClient.getBounds('thing:user@service/path', {}, function(err, result) {
            should.not.exist(err);
            result.should.eql('result');
            done();
          });
        });
      });
    });
  });

  describe('getRange', function() {
    itFallsBackToNexusLookups('getRange', '/range', noop);

    describe('when there is no pod ID', function() {
      var origGetRange;

      beforeEach(function() {
        dalFake.addFake(/SELECT \* FROM Profiles/i, [{
          pod: null
        }]);
        origGetRange = ijod.getRange;
        ijod.getRange = function(basePath, range, cbEach, cbDone) {
          cbEach('Hello');
          return cbDone(null, 'result');
        };
      });

      afterEach(function() {
        ijod.getRange = origGetRange;
      });

      it('delegates to ijod', function(done) {
        var items = [];
        podClient.getRange('thing:user@service/path', {}, function(item) {
          items.push(item);
        }, function(err, result) {
          items.should.eql(['Hello']); // Our IJOD mock got called
          result.should.eql('result');
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

      itPassesTheRightParameters('getRange', '/range', noop);
      itHandlesRemoteErrors('getRange', '/range', noop);


      describe('when the pod service returns data', function() {
        beforeEach(function() {
          fakeweb.registerUri({
            uri: url.format({
              protocol: 'http',
              hostname: 'lb.pod1.localhost',
              port: lconfig.pods.port,
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
              ],
              result: 'result'
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

        it('calls cbDone with the result', function(done) {
          podClient.getRange('thing:user@service/path', {}, function(item) {
            // Pass on each
          }, function(err, result) {
            should.not.exist(err);
            result.should.eql('result');
            done();
          });
        });
      });
    });
  });

  describe('getTardis', function() {
    itFallsBackToNexusLookups('getTardis', '/tardis');

    describe('when there is no pod ID', function() {
      var origGetTardis;

      beforeEach(function() {
        dalFake.addFake(/SELECT \* FROM Profiles/i, [{
          pod: null
        }]);
        origGetTardis = ijod.getTardis;
        ijod.getTardis = function(basePath, range, cbDone) {
          return cbDone(null, 'result');
        };
      });

      afterEach(function() {
        ijod.getTardis = origGetTardis;
      });

      it('delegates to ijod', function(done) {
        var items = [];
        podClient.getTardis('thing:user@service/path', {}, function(err, result) {
          result.should.eql('result');
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

      itPassesTheRightParameters('getTardis', '/tardis');
      itHandlesRemoteErrors('getTardis', '/tardis');

      describe('when the pod service returns data', function() {
        beforeEach(function() {
          fakeweb.registerUri({
            uri: url.format({
              protocol: 'http',
              hostname: 'lb.pod1.localhost',
              port: lconfig.pods.port,
              pathname: '/tardis',
              query: {
                basePath: 'thing:user@service/path',
                range: '{}'
              }
            }),
            method: 'GET',
            body: JSON.stringify({result: 'result'})
          });
        });

        it('calls cbDone with the result', function(done) {
          podClient.getTardis('thing:user@service/path', {}, function(err, result) {
            should.not.exist(err);
            result.should.eql('result');
            done();
          });
        });
      });
    });
  });

});

