var lconfig = require('lconfig');

lconfig.ec2 = {
  accessKeyId: 'abc',
  secretKey: '123'
};

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
