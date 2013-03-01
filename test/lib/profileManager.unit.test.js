require('chai').should();

var fakeweb = require('node-fakeweb');
var _ = require('underscore');

var dalFake = require('dal-fake');
var dal = require('dal');
dal.setBackend('fake');
var lconfig = require('lconfig');
var profileManager = require('profileManager');

describe('profileManager', function() {
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

  describe('genGet', function() {
    var CAT = new Date().toISOString();

    describe('when the Profile exists', function() {
      describe('when there is no pod ID', function() {
        beforeEach(function(done) {
          dalFake.addFake(/SELECT \* FROM Profiles/i, [{
            id: 'id@service',
            service: 'service',
            pod: null
          }]);

          profileManager._kvstore().put('profiles', 'id@service', {
            auth: 'authinfo',
            config: 'configinfo'
          }, done);
        });

        it('fetches from the local KV store', function(done) {
          profileManager.allGet('id@service', function(err, profile) {
            profile.should.eql({
              id: 'id@service',
              service: 'service',
              pod: null,
              auth: 'authinfo',
              config: 'configinfo'
            });
            return done();
          });
        });
      });

      describe('when there is a pod ID', function() {
        beforeEach(function() {
          dalFake.addFake(/SELECT \* FROM Profiles/i, [{
            id: 'id@service',
            service: 'service',
            pod: 1
          }]);
          fakeweb.registerUri({
            uri: 'http://lb.pod1.localhost:8070/profile?pid=id%40service',
            method: 'GET',
            body: JSON.stringify({
              id: 'id@service',
              service: 'service',
              pod: null,
              cat: CAT,
              auth: 'authinfo',
              config: 'configinfo'
            })
          });
        });

        it('fetches from the remote pod', function(done) {
          profileManager.allGet('id@service', function(err, profile) {
            profile.should.eql({
              id: 'id@service',
              service: 'service',
              pod: 1,
              auth: 'authinfo',
              config: 'configinfo',
              cat: CAT
            });
            return done();
          });
        });
      });
    });

    describe('when the Profile does not exist', function() {
      beforeEach(function() {
        dalFake.addFake(/SELECT \* FROM Profiles/i, []);
      });

      describe('on an apihost', function() {
        beforeEach(function() {
          profileManager.setRole('apihost');
          dalFake.addFake(/INSERT INTO Profiles \(id,service,pod\)/i, []);
          fakeweb.registerUri({
            uri: 'http://lb.pod1.localhost:8070/profile?pid=id%40service',
            method: 'POST',
            body: JSON.stringify({
              id: 'id@service',
              service: 'service',
              pod: null,
              cat: CAT,
              auth: {},
              config: {}
            })
          });
        });

        it('creates a new Profile on a remote pod', function(done) {
          profileManager.allGet('id@service', function(err, profile) {
            profile.should.eql({
              id: 'id@service',
              service: 'service',
              pod: 1,
              auth: {},
              config: {}
            });
            return done();
          });
        });
      });

      describe('on a pod', function() {
        beforeEach(function() {
          profileManager.setRole('pod');
          dalFake.addFake(/INSERT INTO Profiles \(id,service\)/i, []);
        });

        it('creates a new Profile in the local DB', function(done) {
          profileManager.allGet('id@service', function(err, profile) {
            profile.should.eql({
              id: 'id@service',
              service: 'service',
              auth: {},
              config: {}
            });
            return done();
          });
        });
      });
    });
  });
});
