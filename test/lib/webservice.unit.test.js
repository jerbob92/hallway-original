var path = require('path');
var browser = require('supertest');

var dalFake = require('dal-fake');
var dal = require('dal');

dalFake.addFake(/SELECT TRUE/i, [{ TRUE: '1' }]);

dal.setBackend('fake');

var helper = require(path.join(__dirname, '..', 'support', 'locker-helper'));

helper.configurate();

var webservice = require('webservice').api;

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

describe('API host', function () {
  describe('private endpoints', function () {
    SIMPLE_GETS.forEach(function (url) {
      it(url + ' requires an access token', function (done) {
        browser(webservice)
          .get(url)
          .expect('Content-Type', /json/)
          .expect(401, /access_token/)
          .end(done);
      });
    });
  });

  describe('public endpoints', function () {
    PUBLIC_GETS.forEach(function (url) {
      it(url + ' doesn\'t require an access token', function (done) {
        browser(webservice)
          .get(url)
          .expect('Content-Type', /json/)
          .expect(200, /.*/)
          .end(done);
      });
    });
  });

  describe('/auth/merge', function () {
    it('should return a 500 with no arguments', function (done) {
      browser(webservice)
        .get('/auth/merge')
        .expect('Content-Type', /json/)
        .expect(500, /.*/)
        .end(done);
    });
  });

  describe('/multi', function () {
    it('should return a 400 with no arguments', function (done) {
      browser(webservice)
        .get('/multi')
        .expect('Content-Type', /json/)
        .expect(400, /.*/)
        .end(done);
    });
  });

  describe('/resources.json', function () {
    it('should return a valid resource description', function (done) {
      browser(webservice)
        .get('/resources.json')
        .expect('Content-Type', /json/)
        .expect(200, /apiVersion/)
        .end(done);
    });
  });
});
