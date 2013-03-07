var request = require('supertest');
var _ = require('underscore');

var lconfig = require('lconfig');

// Set the authSecrets so that we can provide our own access token
lconfig.authSecrets.crypt = 'abc';
lconfig.authSecrets.sign = '123';

var dalFake = require('dal-fake');
var dal = require('dal');

var PROFILES = [
  { profile: '123.123@wordpress' },
  { profile: '123%40N01@flickr' },
  { profile: '123@dropbox' },
  { profile: '123@facebook' },
  { profile: '123@fitbit' },
  { profile: '123@foursquare' },
  { profile: '123@github' },
  { profile: '123@instagram' },
  { profile: '123@klout' },
  { profile: '123@linkedin' },
  { profile: '123@meetup' },
  { profile: '123@runkeeper' },
  { profile: '123@stocktwits' },
  { profile: '123@twitter' },
  { profile: '123@withings' },
  { profile: '123@zeo' },
  { profile: 's123@rdio' },
  { profile: 'test%40example.com@gcontacts' },
  { profile: 'test@tumblr' }
];

var PROFILE_RESPONSE = {
  id: 'test-account',
  wordpress: ['123.123'],
  flickr: ['123%40N01'],
  dropbox: ['123'],
  facebook: ['123'],
  fitbit: ['123'],
  foursquare: ['123'],
  github: ['123'],
  instagram: ['123'],
  klout: ['123'],
  linkedin: ['123'],
  meetup: ['123'],
  runkeeper: ['123'],
  stocktwits: ['123'],
  twitter: ['123'],
  withings: ['123'],
  zeo: ['123'],
  rdio: ['s123'],
  gcontacts: ['test%40example.com'],
  tumblr: ['test']
};

dalFake.reset();

dalFake.addFake(/SELECT TRUE/i, [{ TRUE: 1 }]);
dalFake.addFake(/SELECT conv/i, []);
dalFake.addFake(/SELECT path, offset, len/i, [{ path: 'abc', offset: 0, len: 1 }]);
dalFake.addFake('SELECT app, secret, apikeys, notes FROM Apps WHERE app = ? ' +
  'LIMIT 1',  [{ app: 'aaaabbbbccccdddd', secret: 'AAAABBBBCCCCDDDD' }]);
dalFake.addFake('SELECT profile FROM Accounts WHERE account = ?', PROFILES);
dalFake.addFake('SELECT Apps.app, Apps.secret, Apps.apikeys, Apps.notes ' +
  'FROM Apps, Owners WHERE Apps.app = Owners.app and Owners.account = ?', [{
  app: 'aaaabbbbccccdddd',
  secret: 'AAAABBBBCCCCDDDD',
  notes: '',
  apikeys: ''
}]);
dalFake.addFake(/INSERT into Profiles/i, []);
dalFake.addFake(/^UPDATE/i, []);

dal.setBackend('fake');

var acl = require('acl');
var dMap = require('dMap');
var ijod = require('ijod');
var profileManager = require('profileManager');
var servezas = require('servezas');
var tokenz = require('tokenz');

var webservice = require('webservice').api;

// Listen on an OS-specified port, this works around a hardcoded port in
// supertest (3456)
webservice.listen(0);

var BAD_ACCESS_TOKEN = 'abcdefghijklmnopqrstuvwxyz';
var GOOD_ACCESS_TOKEN = process.env.ACCESS_TOKEN || 'JrY54j9w8SToWDYFDPDykSZr' +
  'sR4.EKO8Xl-m96c3fbe6b28d240122e5858622d1afc7096bebdb0133ee03d334a3fa7d4bb6' +
  '804a76c76a26fa5697852b8dd07aa32fa65766f6a7d27746a5456fe357b8fa3017';

var SERVICE_GETS = [];

// We're going to generate tests based on all of the services and synclets we
// support
servezas.load();
dMap.load();

servezas.serviceList().forEach(function (service) {
  dMap.endpoints(service).forEach(function (endpoint) {
    SERVICE_GETS.push('/services/' + service + '/' + endpoint);
  });
});

var TYPE_GETS = [
  '/types/photos',
  '/types/photos_feed',
  '/types/news',
  '/types/news_feed',
  '/types/videos',
  '/types/videos_feed',
  '/types/checkins',
  '/types/checkins_feed',
  '/types/statuses',
  '/types/statuses_feed',
  '/types/contacts',
  '/types/all',
  '/types/all_feed'
];

var PUBLIC_GETS = [
  '/enoch',
  '/resources/friends',
  '/resources.json',
  '/resources/profile',
  '/resources/profiles',
  '/resources/services',
  '/resources/types',
  '/services',
  '/state',
  '/types'
];

var SIMPLE_GETS = [
  '/apps',
  '/friends',
  '/logout',
  '/profile',
  '/profile?data=true',
  '/profile?verify=true',
  '/profile?data=true&verify=true',
  '/profiles',
  '/push',
  '/services/reset',
  '/types/contacts',
  '/types/photos',
  '/types/photos_feed',
  '/types/checkins',
  '/types/checkins_feed',
  '/types/news',
  '/types/news_feed',
  '/types/videos',
  '/types/videos_feed',
  '/types/statuses',
  '/types/statuses_feed'
];

var REQUEST;

before(function (done) {
  ijod.initDB(done);
});

before(function (done) {
  acl.setRole('nexus'); //XXX To make getApp work
  acl.init(function () {
    tokenz.init(function () {
      profileManager.init(function () {
        done();
      });
    });
  });

  REQUEST = request(webservice);
});

function failOnBadAccessToken(url) {
  it('should fail on a bad access token', function (done) {
    REQUEST.get(url)
      .query({
        access_token: BAD_ACCESS_TOKEN
      })
      .expect('Content-Type', /json/)
      .expect(400, /Invalid OAuth access token\./)
      .end(done);
  });
}

describe('API host', function () {
  describe('applying auth', function () {
    it('should throttle when necessary', function (done) {
      lconfig.backlogThresholds = {
        aaaabbbbccccdddd: -1
      };

      REQUEST.get('/auth/facebook/apply')
        .query({
          client_id: 'aaaabbbbccccdddd',
          client_secret: 'AAAABBBBCCCCDDDD',
          token: '1111222233334444',
          token_secret: '5555666677778888'
        })
        .expect(503, /Throttling in effect/)
        .end(done);
    });

    it('should not throttle when unnecessary', function (done) {
      lconfig.backlogThresholds = {};

      REQUEST.get('/auth/facebook/apply')
        .query({
          client_id: 'aaaabbbbccccddd',
          client_secret: 'AAAABBBBCCCCDDDD',
          token: '1111222233334444',
          token_secret: '5555666677778888'
        })
        .expect(404)
        .end(done);
    });
  });

  describe('endpoints without their own OPTIONS', function () {
    var paths = [];

    Object.keys(webservice.routes).forEach(function (verb) {
      webservice.routes[verb].forEach(function (route) {
        if (webservice.routes.options &&
          webservice.routes.options.some(function (optionsRoute) {
          return optionsRoute.path === route.path;
        })) {
          return;
        }

        paths.push(route.path);
      });
    });

    paths = _.uniq(paths);

    paths.forEach(function (path) {
      it(path + ' should respond to OPTIONS', function (done) {
        REQUEST.options(path)
          .expect('Allow', /GET|PUT|POST|DELETE/)
          .expect(200)
          .end(done);
      });
    });
  });

  describe('endpoints that provide their own OPTIONS', function () {
    var paths = webservice.routes.options.map(function (route) {
      return route.path;
    });

    paths.forEach(function (path) {
      it(path + ' should require authentication', function (done) {
        REQUEST.options(path)
          .expect('Content-Type', /json/)
          .expect(401, /access_token/)
          .end(done);
      });
    });
  });

  describe('private endpoints', function () {
    SIMPLE_GETS.forEach(function (url) {
      it(url + ' requires an access token', function (done) {
        REQUEST.get(url)
          .expect('Content-Type', /json/)
          .expect(401, /access_token/)
          .end(done);
      });
    });

    SIMPLE_GETS.filter(function (url) {
      // push needs a fake IJOD backend before it's testable
      // logout redirects
      return url !== '/push' &&
        url !== '/logout';
    }).forEach(function (url) {
      it(url + ' should not error with a good access token', function (done) {
        REQUEST.get(url)
          .query({
            access_token: GOOD_ACCESS_TOKEN
          })
          .expect('Content-Type', /json/)
          .expect(200)
          .end(done);
      });
    });

    describe('/logout', function () {
      it('should redirect', function (done) {
        REQUEST.get('/logout')
          .query({
            access_token: GOOD_ACCESS_TOKEN
          })
          .expect(302)
          .end(done);
      });
    });

    describe('/profile', function () {
      it('should return data from the access token',
        function (done) {
        REQUEST.get('/profile')
          .query({
            access_token: GOOD_ACCESS_TOKEN
          })
          .expect('Content-Type', /json/)
          .expect({ id: 'test-account', services: {} })
          .end(done);
      });
    });

    describe('/profiles', function () {
      it('should return data from the fake profiles',
        function (done) {
        REQUEST.get('/profiles')
          .query({
            access_token: GOOD_ACCESS_TOKEN
          })
          .expect('Content-Type', /json/)
          .expect(PROFILE_RESPONSE)
          .end(done);
      });
    });

    TYPE_GETS.forEach(function (url) {
      describe(url, function () {
        failOnBadAccessToken(url);

        it('should return an empty array', function (done) {
          REQUEST.get(url)
            .query({
              access_token: GOOD_ACCESS_TOKEN
            })
            .expect('Content-Type', /json/)
            .expect([])
            .end(done);
        });
      });
    });

    SERVICE_GETS.forEach(function (url) {
      describe(url, function () {
        failOnBadAccessToken(url);

        // XXX: Ideally we'd return one or the other all the time!
        it('should return an empty array or an error', function (done) {
          REQUEST.get(url)
            .query({
              access_token: GOOD_ACCESS_TOKEN
            })
            .expect('Content-Type', /json/)
            .end(function (err, res) {
              if (_.isEqual(res.body, []) && res.statusCode === 200) {
                return done();
              }

              if (_.isEqual(res.body, { error: 'No data or profile found' }) &&
                res.statusCode === 404) {
                return done();
              }

              throw new Error('body must be an empty array or a JSON error');
            });
        });
      });
    });
  });

  describe('public endpoints', function () {
    PUBLIC_GETS.forEach(function (url) {
      it(url + ' doesn\'t require an access token', function (done) {
        REQUEST.get(url)
          .expect('Content-Type', /json/)
          .expect(200, /.*/)
          .end(done);
      });
    });

    describe('/types', function () {
      // XXX: Add additional checking here? Should this even be public?
      it('should return an object',
        function (done) {
        REQUEST.get('/types')
          .expect('Content-Type', /json/)
          .end(done);
      });
    });
  });

  describe('/auth/merge', function () {
    it('should return a 500 with no arguments', function (done) {
      REQUEST.get('/auth/merge')
        .expect('Content-Type', /json/)
        .expect(500, /.*/)
        .end(done);
    });
  });

  describe('/multi', function () {
    it('should return a 400 with no arguments', function (done) {
      REQUEST.get('/multi')
        .expect('Content-Type', /json/)
        .expect(400, /.*/)
        .end(done);
    });
  });

  describe('/resources.json', function () {
    it('should return a valid resource description', function (done) {
      REQUEST.get('/resources.json')
        .expect('Content-Type', /json/)
        .expect(200, /apiVersion/)
        .end(done);
    });
  });
});
