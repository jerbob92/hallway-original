require('chai').should();

var mc = require('mc');

function itShouldReturnNotStored(fn) {
  return function (done) {
    function test(err, value) {
      if (err) return done(err);

      value.should.equal('NOT_STORED');

      done();
    }

    // The callback is sometimes the 2nd and sometimes the 3rd parameter
    fn('test', test, test);
  };
}

describe('optional-memcache', function () {
  describe('with configuration set', function () {
    var lconfig = require('lconfig');

    lconfig.memcache = {
      host: 'localhost',
      port: 123
    };

    var memcache = require('optional-memcache').memcacheClient();

    it('should return a real memcache', function () {
      memcache.should.be.an.instanceOf(mc.Client);
    });
  });

  describe('without configuration set', function () {
    var lconfig = require('lconfig');

    lconfig.memcache = null;

    var memcache = require('optional-memcache').memcacheClient();

    it('should return a fake memcache', function () {
      memcache.should.not.be.an.instanceOf(mc.Client);
    });

    describe('#connect', function () {
      it('should not error', function (done) {
        memcache.connect(function (err) {
          if (err) return done(err);

          done();
        });
      });
    });

    var fns = ['get', 'replace', 'set', 'del'];

    fns.forEach(function (fn) {
      describe('#' + fn, function () {
        it('should return NOT_STORED', itShouldReturnNotStored(memcache[fn]));
      });
    });
  });
});
