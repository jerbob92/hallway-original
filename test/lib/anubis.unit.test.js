require('chai').should();

var dalFake = require('dal-fake');
var dal = require('dal');

dalFake.reset();

dalFake.addFake(/SELECT hex\(idr\) as idr, hash FROM/i, []);

dal.setBackend('fake');

var anubis = require('anubis');
var ijod = require('ijod');

before(function (done) {
  ijod.initDB(done);
});

describe('anubis', function () {
  describe('#log', function () {
    this.timeout(60000);

    it('should log the request', function () {
      var req = {
        url: '/derp',
        connection: {
          remoteAddress: '127.0.0.1'
        },
        _authsome: {
          account: 'abc',
          app: 'def'
        }
      };

      anubis.log(req).should.equal(1);
    });

    it('should reap the request', function (done) {
      var ran = false;

      dalFake.addFake(/INSERT INTO .* \(base, idr, path, hash, offset, len, lat, lng, q0, q1, q2, q3, par\) VALUES/i, function (binds) {
        binds.should.be.an('array');

        ran = true;
      });

      anubis.reap();

      setTimeout(function () {
        ran.should.equal(true);

        done();
      }, 250);
    });
  });
});
