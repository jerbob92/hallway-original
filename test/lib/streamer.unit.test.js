require('chai').should();

var streamer = require('streamer');

describe('streamer', function () {
  describe('#startService', function () {
    it('should start the service', function (done) {
      streamer.startService({ port: 0, listenIP: '0.0.0.0' }, function () {
        done();
      });
    });
  });
});
