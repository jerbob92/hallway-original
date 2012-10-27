var assert = require('assert');

var lconfig = require('lconfig');
var lockman = require('lockman');

var pid = 'pid@service';

describe('lockman', function() {
  before(function(done) {
    lockman.init('localworker', false);
    done();
  });

  beforeEach(function(done) {
    lockman.clearLock(pid, done);
  });

  describe('requestLock()', function() {
    it('will grant a previously unclaimed lock, but not a claimed one',
      function(done){
      lockman.requestLock(pid, function(err, set) {
        assert(!err);
        assert(set);
        lockman.requestLock(pid, function(err, set) {
          assert(!err);
          assert(!set);
          done();
        });
      });
    });
  });

  describe('isLocked()', function() {
    it('returns false for an unlocked pid', function(done) {
      lockman.isLocked(pid, function(locked) {
        assert(!locked);
        done();
      });
    });

    it('returns true for a locked pid', function(done) {
      lockman.requestLock(pid, function(err, set) {
        assert(!err);
        assert(set);
        lockman.isLocked(pid, function(locked, bits) {
          assert(locked);
          done();
        });
      });
    });
  });

  describe('clearLock()', function() {
    it('can clear the lock for a pid', function(done) {
      lockman.isLocked(pid, function(locked) {
        assert(!locked);
        lockman.requestLock(pid, function(err, set) {
          assert(!err);
          assert(set);
          lockman.clearLock(pid, function(err, cleared) {
            assert(!err);
            assert(cleared);
            done();
          });
        });
      });
    });
  });

  describe('heartbeat()', function() {
    it('can renew a lock it holds', function(done) {
      lockman.requestLock(pid, function(err, set) {
        assert(!err);
        assert(set);
        lockman.heartbeat(pid, function(err, heartbeated) {
          assert(!err);
          done();
        });
      });
    });
  });
});
