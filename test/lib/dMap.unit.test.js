var should = require('chai').should();

var lconfig = require('lconfig');
if (!lconfig.database) lconfig.database = {};
lconfig.database.maxConnections = 1;

var dMap = require('dMap');
var servezas = require('servezas');

dMap.load();
servezas.load();

var EXAMPLE_ENTRY = {
  idr: 'photo:1576860066@facebook/photos#2825109438331',
  data: {
    updated_time: 1,
    created_time: 5,
    source: 'http://www.somedomain.com',
    link: 'http://www.otherdomain.com',
    picture: 'http://www.thumbnails.com',
    height: 800,
    width: 600,
    name: 'http://instagr.am/p/123456',
    place: {
      location: {
        latitude: -27.5,
        longitude: 31.2
      }
    }
  }
};

var EXAMPLE_MAP = {
  "oembed": {
    "type": "photo",
    "title": "http://instagr.am/p/123456",
    "height": 800,
    "width": 600,
    "url": "http://www.somedomain.com",
    "thumbnail_url": "http://www.thumbnails.com",
    "provider_name": "facebook",
    "provider_url": "http://www.otherdomain.com"
  },
  "media": "http://www.somedomain.com",
  "ll": [-27.5, 31.2],
  "earliest": 5000
};

describe('dMap', function () {
  describe('#endpoints()', function () {
    it('should load a service\'s dMap', function () {
      servezas.serviceList().forEach(function (service) {
        var endpoints = dMap.endpoints(service);

        endpoints.should.be.an('array');
        endpoints.length.should.be.above(0);
      });
    });
  });

  describe('#defaults()', function () {
    it('should return defaults', function () {
      dMap.defaults('facebook', 'friends').should.equal('contact');
    });

    it('should return undefined when no default exists', function () {
      should.not.exist(dMap.defaults('facebook', 'INVALID'));
    });
  });

  describe('#get()', function () {
    it('should be able to retrieve an entry field', function () {
      dMap.get('at', { updated_time: 1, created_time: 5 },
        'photo:1576860066@facebook/photos#2825109438331').should.equal(1000);

      dMap.get('at', { created_time: 5 },
        'photo:1576860066@facebook/photos#2825109438331').should.equal(5000);
    });
  });

  describe('#map()', function () {
    it('should map a valid entry', function () {
      var result = dMap.map(EXAMPLE_ENTRY);

      result.should.deep.equal(EXAMPLE_MAP);
    });
  });

  describe('#media()', function () {
    it('should return a media function when it exists', function () {
      var result = dMap.media({
        idr: 'contact:blodulv%40gmail.com@gcontacts/contacts#d59278c8f6ca246',
        data: {}
      });

      result.should.be.a('function');
    });
  });

  describe('#guid()', function () {
    it('should return a GUID if one exists', function () {
      var guid = dMap.guid(EXAMPLE_ENTRY);

      guid.should.equal('guid:instagram/#123456');
    });
  });

  describe('#typeOf()', function () {
    it('should return a type for a valid IDR', function () {
      var types = dMap.typeOf('photo:1576860066@facebook/photos#2825109438331');

      types.should.be.an('array');
      types.length.should.be.above(0);
      types[0].should.equal('photos');
    });
  });

  describe('#pump()', function () {});
  describe('#loadcheck()', function () {});
  describe('#defaultcheck()', function () {});

  describe('#partype()', function () {
    it('should return the correct type number', function () {
      dMap.partype('first').should.equal(1);
      dMap.partype('last').should.equal(2);
      dMap.partype('facebook').should.equal(100);

      dMap.partype(1).should.equal('first');
      dMap.partype(2).should.equal('last');
      dMap.partype(100).should.equal('facebook');
    });

    it('should return 0 when the type does not exist', function () {
      dMap.partype('INVALID').should.equal(0);
    });
  });

  describe('#types()', function () {
    it('should return bases', function () {
      var bases = dMap.types('photos', ['42@facebook', '42@instagram']);

      bases.length.should.equal(2);
      bases[0].should.equal('photo:42@facebook/photos');
    });
  });

  describe('#bases()', function () {
    it('return bases', function () {
      var bases = dMap.bases(['42@facebook', '42@instagram']);

      bases.indexOf('contact:42@facebook/self').should.be.above(-1);
      bases.indexOf('contact:42@instagram/self').should.be.above(-1);
    });
  });
});
