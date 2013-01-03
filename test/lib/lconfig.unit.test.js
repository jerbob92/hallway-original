require('chai').should();

var lconfig = require('lconfig');

describe('lconfig', function () {
  it('should load configuration data', function () {
    lconfig.lockerHost.should.be.a('string');
    lconfig.lockerPort.should.be.a('number');

    lconfig.externalHost.should.be.a('string');
    lconfig.externalPort.should.be.a('number');
  });

  it('should set externalBase', function () {
    lconfig.externalBase.should.be.a('string');
  });
});
