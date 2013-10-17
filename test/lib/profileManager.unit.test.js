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

    });

  });
});
