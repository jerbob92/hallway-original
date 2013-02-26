require('chai').should();

var fakeweb = require('node-fakeweb');

var anubis = require('anubis');

describe('anubis', function () {
  beforeEach(function() {
    fakeweb.allowNetConnect = false;
    fakeweb.allowLocalConnect = false;
  });

  afterEach(function() {
    fakeweb.tearDown();
  });

  describe('#log', function () {
    this.timeout(1000);

    it('should log the request', function () {
      var req = {
        url: '/derp',
        connection: {
          remoteAddress: '127.0.0.1'
        },
        _authsome: {
          account: 'abc',
          app: 'def'
        }
      };

      anubis.log(req).should.equal(1);
    });

    it('should reap the request', function (done) {
      fakeweb.registerUri({
        uri: 'http://localhost:8060/batchSmartAdd',
        body: JSON.stringify({
          timings: 'timings'
        })
      });

      anubis.reap(function(err, result) {
        result.should.eql('timings');
        done();
      });
    });
  });
});
