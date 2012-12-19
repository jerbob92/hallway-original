require('chai').should();

var queenBee = require('queenBee');

describe('queenBee', function () {
  describe('#init', function () {
    it('should not crash', function (done) {
      queenBee.init(done);
    });
  });

  describe('#serviceCounts', function () {
    it('should return an object', function (done) {
      queenBee.serviceCounts(function (err, counts) {
        if (err) return done(err);

        counts.should.be.an('object');

        done();
      });
    });
  });
});
