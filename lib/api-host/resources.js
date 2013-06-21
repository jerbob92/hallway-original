var ejsLocals = require('ejs-locals');
var express = require('express');
var _ = require('underscore');

var dMap = require('dMap');
var lconfig = require('lconfig');
var servezas = require('servezas');

function listEndpoints(service) {
  return dMap.endpoints(service).map(function (endpoint) {
    return '"' + endpoint + '"';
  }).join(',');
}

function listServices() {
  return servezas.serviceList().sort().map(function (service) {
    return '"' + service + '"';
  }).join(',');
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

app.get('/profile', function (req, res) {
  res.render('profile', {
    host: lconfig.externalBase
  });
});

app.get('/profiles', function (req, res) {
  res.render('profiles', {
    serviceNames: servezas.serviceList().sort(),
    host: lconfig.externalBase
  });
});
