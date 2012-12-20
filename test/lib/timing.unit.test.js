require('chai').should();

var timing = require('timing');

describe('timing', function () {
  describe('#cleanPath', function () {
    it('should clean auth URLs', function () {
      var cleaned = timing.cleanPath('/auth/123456/client_id/789012');

      cleaned.should.be.a('string');
      cleaned.should.equal('auth.APP_ID.client_id.789012');
    });

    it('should clean proxy URLs', function () {
      var cleaned = timing.cleanPath('/proxy/facebook/herp/derp');

      cleaned.should.be.a('string');
      cleaned.should.equal('proxy.facebook');
    });

    it('should clean service URLs', function () {
      var cleaned = timing.cleanPath('/services/facebook/photos');

      cleaned.should.be.a('string');
      cleaned.should.equal('services.facebook.photos');
    });
  });
});
