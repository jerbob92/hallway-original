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
    describe('when the Profile exists', function() {
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

      describe('when there is no pod ID', function() {
        it('fetches from the local KV store', function(done) {
          profileManager.allGet('id@service', function(err, profile) {
            profile.should.deep.equal({
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

      xdescribe('when there is a pod ID', function() {
        it('fetches from the remote DB', function(done) {
        });
      });
    });

    describe('when the Profile does not exist', function() {
      beforeEach(function() {
        dalFake.addFake(/SELECT \* FROM Profiles/i, []);
      });

      xdescribe('on an apihost', function() {
        beforeEach(function() {
          profileManager.setRole('apihost');
        });

        xit('creates a new Profile on a remote pod', function(done) {
        });
      });

      describe('on a pod', function() {
        beforeEach(function() {
          profileManager.setRole('pod');
          dalFake.addFake(/INSERT INTO Profiles \(id,service\)/i, []);
        });

        it('creates a new Profile in the local DB', function(done) {
          profileManager.allGet('id@service', function(err, profile) {
            profile.should.deep.equal({
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
