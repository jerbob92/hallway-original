var dawg = require('dawg');

describe('dawg', function () {
  describe('#startService', function () {
    it('should start the service', function (done) {
      dawg.startService(0, '0.0.0.0', function () {
        done();
      });
    });
  });
});
