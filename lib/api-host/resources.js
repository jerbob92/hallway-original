var ejsLocals = require('ejs-locals');
var express = require('express');

var dMap = require('dMap');
var lconfig = require('lconfig');
var servezas = require('servezas');

//For filtering out synclets that aren't actually endpoints
var FILTERS = [
  'facebook/likes',
  'stocktwits/users',
  'twitter/sent_messages',
  'twitter/received_messages'
];

function listEndpoints(service, synclets) {
  var endpoints = dMap.endpoints(service).map(function(endpoint) {
    return '"' + endpoint + '"';
  });
  return endpoints.join(',');
}

var app = module.exports = express();

app.engine('ejs', ejsLocals);

app.set('views', __dirname + '/../../resources');
app.set('view engine', 'ejs');

// Always return JSON
app.all('*', function (req, res, next) {
  res.set('Content-Type', 'application/json');

  next();
});

app.get('/services', function (req, res) {
  var services = servezas.services();

  res.render('services', {
    services: services,
    host: lconfig.externalBase,
    listEndpoints: listEndpoints
  });
});

// need to document the endpoints that are POST enabled since not consistent
var swagger_post = {
  statuses: {
    body: ['query', 'The text of the status to share']
  },
  news: {
    body: ['query', 'Text describing the link'],
    url: ['query', 'The link']
  },
  photos: {
    photo: ['body', 'The photo you wish to upload']
  }
};

app.get('/types', function (req, res) {
  var types = dMap.types(false, false);

  res.render('types', {
    types: types,
    post: swagger_post,
    host: lconfig.externalBase
  });
});

app.get('/profile', function (req, res) {
  res.render('profile', {
    host: lconfig.externalBase
  });
});

app.get('/friends', function (req, res) {
  res.render('friends', {
    host: lconfig.externalBase
  });
});

app.get('/profiles', function (req, res) {
  res.render('profiles', {
    serviceNames: Object.keys(servezas.services()),
    host: lconfig.externalBase
  });
});
