var worker = require('worker');

describe('worker', function () {
  describe('#startService', function () {
    it('starts the service', function (done) {
      worker.startService(0, '0.0.0.0', function () {
        done();
      });
    });
  });
});
