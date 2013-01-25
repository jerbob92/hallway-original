require('chai').should();

var lconfig = require('lconfig');

if (!lconfig.ec2 || !lconfig.ec2.accessKeyId || !lconfig.ec2.secretKey) {
  // Don't test if we don't have valid credentials to test with
  console.log('Skipping dawg-aws tests because of missing credentials.');
} else {
  var dawgAws = require('dawg-aws');

  // TODO: Use fakeweb to test against generated data
  describe('dawg-aws', function () {
    describe('#estimatedCharges', function () {
      it('should return valid data', function (done) {
        dawgAws.estimatedCharges(function (err, data) {
          if (err) return done(err);

          data.should.be.a('number');

          done();
        });
      });
    });

    describe('#instanceAddresses', function () {
      it('should return valid data', function (done) {
        dawgAws.instanceAddresses('workersup', function (err, data) {
          if (err) return done(err);

          data.should.be.an('array');

          data.forEach(function (instance) {
            instance.publicIp.should.be.a('string');
            instance.privateIp.should.be.a('string');
          });

          done();
        });
      });
    });

    describe('#instanceCounts', function () {
      it('should return valid data', function (done) {
        dawgAws.instanceCounts(function (err, data) {
          if (err) return done(err);

          data.should.be.an('array');

          data.forEach(function (instance) {
            instance.name.should.be.a('string');
            instance.count.should.be.an('number');
          });

          done();
        });
      });
    });
  });
}
