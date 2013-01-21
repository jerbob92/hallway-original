require('chai').should();

var logger = require('logger');

function hook(callback) {
  var oldWrite = process.stdout.write;

  process.stdout.write = (function (write) {
    return function (string, encoding, fd) {
      write.apply(process.stdout, arguments);

      callback(string, encoding, fd);
    };
  })(process.stdout.write);

  return function () {
    process.stdout.write = oldWrite;
  };
}

describe('logger', function () {
  describe('#logger', function () {
    this.timeout(5000);

    it('creates a working logger', function (done) {
      var topicLogger = logger.logger('topic');

      var unhook = hook(function (string) {
        string.should.contain('topic');
        string.should.contain('a message');

        unhook();

        done();
      });

      topicLogger.info('a message');
    });
  });
});
