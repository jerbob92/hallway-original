var should = require('chai').should();

var lconfig = require('lconfig');

lconfig.authSecrets.crypt = 'abc';
lconfig.authSecrets.sign = '123';

lconfig.minConnections = 1;
lconfig.maxConnections = 1;

var dalFake = require('dal-fake');
var dal = require('dal');

dalFake.reset();

var PROFILES = [
  { profile: '123@facebook' },
  { profile: '123@twitter' }
];

dalFake.addFake('SELECT true', []);
dalFake.addFake('SELECT app, secret, apikeys, notes FROM Apps WHERE app = ? ' +
  'LIMIT 1',  [{}]);
dalFake.addFake('SELECT profile FROM Accounts WHERE account = ?', PROFILES);

dal.setBackend('fake');

var acl = require('acl');
var tokenz = require('tokenz');
var nexusClient = require('nexusClient');

var GOOD_ACCESS_TOKEN = 'JrY54j9w8SToWDYFDPDykSZrsR4.EKO8Xl-m96c3fbe6b28d2401' +
  '22e5858622d1afc7096bebdb0133ee03d334a3fa7d4bb6804a76c76a26fa5697852b8dd07a' +
  'a32fa65766f6a7d27746a5456fe357b8fa3017';

before(acl.init);
before(tokenz.init);
before(nexusClient.init);

describe('tokenz', function () {
  describe('#init', function () {
    it('should set tokenz.serializer', function () {
      should.exist(tokenz.serializer);
    });
  });

  describe('#createAccessToken', function () {
    it('should create a valid access token', function (done) {
      tokenz.createAccessToken('test-account', 'test-app', {},
        function (err, token) {
        if (err) {
          return done(err);
        }

        should.exist(token);

        should.exist(token.account);
        should.exist(token.access_token);

        token.access_token.should.be.a('string');
        token.access_token.length.should.be.below(255);

        var parsed = tokenz.parseAccessToken(token.access_token);

        parsed.account.should.equal('test-account');
        parsed.app.should.equal('test-app');

        isNaN(parsed.at).should.equal(false);

        done();
      });
    });
  });

  describe('#parseAccessToken', function () {
    it('should parse a valid access token', function () {
      var parsed = tokenz.parseAccessToken(GOOD_ACCESS_TOKEN);

      parsed.account.should.equal('test-account');
      parsed.app.should.equal('test-app');

      should.exist(parsed.at);
    });
  });

  describe('#login', function () {
    it('should return data with a good access token', function (done) {
      var res = {
        json: function (json) {
          throw json;
        }
      };

      var req = {
        param: function (parameter) {
          var data = {
            access_token: GOOD_ACCESS_TOKEN
          };

          return data[parameter];
        }
      };

      tokenz.login(req, res, function () {
        var token = req._authsome;

        token.profiles.should.equal(PROFILES);
        token.account.should.equal('test-account');
        token.app.should.equal('test-app');

        done();
      });
    });
  });
});
