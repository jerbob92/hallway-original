require('chai').should();

var lconfig = require('lconfig');

lconfig.apikeysPath = 'test/resources/apikeys.json';

var apiKeys = require('apiKeys');

describe('apiKeys', function () {
  describe('#getDefaultKeys', function () {
    it('should get the default keys', function () {
      var keys = apiKeys.getDefaultKeys('facebook');

      keys.should.eql({
        appKey: 'fb-appkey',
        appSecret: 'fb-appsecret'
      });
    });
  });

  describe('#getKeys', function () {

  });

  describe('#hasOwnKeys', function () {
    it('should return true if the app has its own keys', function () {
      var hasOwnKeys = apiKeys.hasOwnKeys({
        apikeys: {
          facebook: {
            appKey: 'fb-app-appkey',
            appSecret: 'fb-app-appsecret'
          }
        }
      }, 'facebook');

      hasOwnKeys.should.equal(true);
    });

    it('should return false if the app has identical keys', function () {
      var hasOwnKeys = apiKeys.hasOwnKeys({
        apikeys: {
          facebook: {
            appKey: 'fb-appkey',
            appSecret: 'fb-appsecret'
          }
        }
      }, 'facebook');

      hasOwnKeys.should.equal(false);
    });

    it('should return false if neither has keys', function () {
      var hasOwnKeys = apiKeys.hasOwnKeys({
        apikeys: {}
      }, 'derp');

      hasOwnKeys.should.equal(false);
    });

    it('should return true if only the app has keys', function () {
      var hasOwnKeys = apiKeys.hasOwnKeys({
        apikeys: {
          derp: {
            appKey: 'derp-app-appkey',
            appSecret: 'derp-app-appsecret'
          }
        }
      }, 'derp');

      hasOwnKeys.should.equal(true);
    });

    it('should return false if the app has no keys', function () {
      var hasOwnKeys = apiKeys.hasOwnKeys({
        apikeys: {}
      }, 'facebook');

      hasOwnKeys.should.equal(false);
    });
  });
});
