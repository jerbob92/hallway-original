require('chai').should();

var fakeweb = require('node-fakeweb');
var lconfig = require('lconfig');
var dalFake = require('dal-fake');
var dal = require('dal');

dalFake.reset();

dalFake.addFake(/SELECT hex\(idr\) as idr, hash FROM/i, []);

dal.setBackend('fake');

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
      lconfig.anubis = {
        allowedApps : ["def"]
      };
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
