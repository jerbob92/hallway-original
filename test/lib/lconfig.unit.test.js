require('chai').should();

var lconfig = require('lconfig');

describe('lconfig', function () {
  it('should load configuration data from defaults.json', function () {
    lconfig.lockerHost.should.equal('localhost');
    lconfig.lockerPort.should.equal(8042);

    lconfig.externalHost.should.equal('localhost');
    lconfig.externalPort.should.equal(8042);
  });

  it('should set externalBase', function () {
    lconfig.externalBase.should.equal('http://localhost:8042');
  });
});
