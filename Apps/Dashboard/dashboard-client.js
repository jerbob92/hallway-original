/*
*
* Copyright (C) 2011, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

// Present a single page listing all the services discovered in this locker, scanning the
// /Apps /Collections /Contexts and /SourceSinks dirs
// enable start/stop on all (that you can)

var fs = require('fs'),
    path = require('path'),
    url = require('url'),
    sys = require('sys'),
    express = require('express'),
    connect = require('connect'),
    http = require('http'),
    request = require('request');
    

var map;

var rootHost;
var lockerPort;
var rootPort;
var externalBase;
var lockerBase;
var lockerRoot;

module.exports = function(passedLockerHost, passedLockerPort, passedPort, passedExternalBase) {
    rootHost = passedLockerHost;
    lockerPort = passedLockerPort;
    rootPort = passedPort;
    externalBase = passedExternalBase;
    lockerBase = 'http://' + rootHost + ':' + lockerPort + '/core/dashboard';
    lockerRoot = 'http://'+rootHost+':'+lockerPort;
    
    app.use(express.static(__dirname + '/static'));

    app.listen(rootPort);
}


var app = express.createServer();
app.use(connect.bodyParser());

var synclets;
app.get('/', function (req, res) {
    res.writeHead(200, { 'Content-Type': 'text/html','Access-Control-Allow-Origin' : '*' });
    request.get({uri:lockerRoot + '/synclets'}, function(err, resp, body) {
        synclets = JSON.parse(body);
        var connectorCount = 0; // should replace with collection count
        var path = __dirname + "/static/wizard/index.html";
                   
        for (app in synclets.installed) {
            path = __dirname + "/dashboard.html";
        }
        
        console.error('DEBUG: path', path);
        fs.readFile(path, function(err, data) {
            res.write(data, "binary");
            res.end();
        });
    });
});

app.get('/dashboard', function (req, res) {
    res.writeHead(200, { 'Content-Type': 'text/html','Access-Control-Allow-Origin' : '*' });
    request.get({uri:lockerRoot + '/map'}, function(err, resp, body) {
        map = JSON.parse(body);
        var path = "dashboard.html";
        fs.readFile(path, function(err, data) {
            res.write(data, "binary");
            res.end();
        });
    });
});

app.get('/config.js', function (req, res) {
    res.writeHead(200, { 'Content-Type': 'text/javascript','Access-Control-Allow-Origin' : '*' });
    //this might be a potential script injection attack, just sayin.
    var config = {lockerHost:rootHost,
                  lockerPort:rootPort,
                  lockerBase:lockerRoot,
                  externalBase:externalBase};
    res.end('lconfig = ' + JSON.stringify(config) + ';');
});

// doesn't this exist somewhere? was easier to write than find out, meh!
function intersect(a,b) {
    if(!a || !b) return false;
    for(var i=0;i<a.length;i++)
        for(var j=0;j<b.length;j++)
            if(a[i] == b[j]) return a[i];
    return false;
}

app.get('/install', function(req, res){
    ensureMap(function() {
        install(req, res);
    });
});

function install(req, res) {
    var id = req.param('id');
    var handle = req.param('handle');
    console.log(id);
    console.log(handle);
    var httpClient = http.createClient(lockerPort);
    var request = httpClient.request('POST', '/core/Dashboard/install', {'Content-Type':'application/json'});
    console.log("hi");
    if (id) var item = JSON.stringify(map.available[req.param('id')]);
    for (i in map.available) {
        if (map.available[i].handle == handle) {
            if (handle) var item = JSON.stringify(map.available[i]);
        }
    }
    console.log(item);
    request.write(item);
    request.end();
    request.on('response',
    function(response) {
        var data = '';
        response.on('data', function(chunk) {
            data += chunk;
        });
        response.on('end', function() {
            j = JSON.parse(data);
            if(j && j.id) {
                res.writeHead(200, { 'Content-Type': 'application/json','Access-Control-Allow-Origin' : '*'});
                res.end(JSON.stringify({success:j}));
            } else {
                res.writeHead(200, { 'Content-Type': 'application/json','Access-Control-Allow-Origin' : '*'});
                res.end(JSON.stringify({error:j}));
            }
        });
    });
}

app.get('/uninstall', function(req, res) {
    stopService('uninstall', req, res);
});

app.get('/enable', function(req, res){
    stopService('enable', req, res);
});


app.get('/disable', function(req, res){
    stopService('disable', req, res);
});

function stopService(method, req, res) {
    var serviceId = req.query.serviceId;
    request.post({uri:lockerBase + '/' + method, json:{serviceId:serviceId}}, function(err, resp, body) {
        if(err) {
            res.writeHead(500, {'Content-Type': 'application/json'});
            console.error(method + ' err', err);
            res.end(JSON.stringify({error:true}));
        } else {
            res.writeHead(200, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({success:true}));
        }
    });
}

function ensureMap(callback) {
    if (!map || !map.available) {
        request.get({uri:lockerRoot + '/map'}, function(err, resp, body) {
            map = JSON.parse(body);
            callback();
        });
    } else {
        process.nextTick(callback);
    }
}


