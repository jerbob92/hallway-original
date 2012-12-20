require('chai').should();

var taskmaster = require('taskmaster');

describe('taskmaster', function () {
  describe('#init', function () {
    it('should initialize', function (done) {
      taskmaster.init(done);
    });
  });

  describe('#stats', function () {
    it('should return an object', function () {
      var stats = taskmaster.stats();

      stats.should.be.an('object');
    });
  });

  describe('#stop', function () {
    it('should stop', function (done) {
      taskmaster.stop(function () {
        var stats = taskmaster.stats();

        stats.stopped.should.equal(true);

        done();
      });
    });
  });
});
