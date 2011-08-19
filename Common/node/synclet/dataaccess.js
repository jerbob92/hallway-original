var dataStore = require('./datastore')
  , lconfig = require('../lconfig')
  , lfs = require('../lfs')
  ;

module.exports = function(app) {
    dataStore.init(function() {});
    // In adherence with the contact/* provider API
    // Returns a list of the current set of friends or followers
    app.get('/synclets/:syncletId/getCurrent/:type', function(req, res) {
        var type = req.params.type;
        var options = {};
        if(req.query['limit']) options.limit = req.query['limit'];
        if(req.query['skip']) options.skip = req.query['skip'];

        dataStore.getAllCurrent(req.params.syncletId + "_" + req.params.type, function(err, objects) {
            if (err) {
                res.writeHead(500, {'content-type' : 'application/json'});
                res.end('{error : ' + err + '}')
            } else {
                res.writeHead(200, {'content-type' : 'application/json'});
                res.end(JSON.stringify(objects));
            }
        }, options);
    });

    app.get('/synclets/:syncletId/get_profile', function(req, res) {
        lfs.readObjectFromFile(path.join(lconfig.lockerDir, lconfig.me, req.params.syncletId, 'profile.json'), function(userInfo) {
            res.writeHead(200, {"Content-Type":"application/json"});
            res.end(JSON.stringify(userInfo));        
        });
    });

    app.get('/synclets/:syncletId/getPhoto/:id', function(req, res) {
        fs.readdir(path.join(lconfig.lockerDir, lconfig.me, req.params.syncletId, 'photos'), function(err, files) {
            var file;
            for (var i = 0; i < files.length; i++) {
                if (files[i].match(req.param('id'))) {
                    file = files[i];
                }
            }
            if (file) {
                var stream = fs.createReadStream(path.join(lconfig.lockerDir, lconfig.me, req.params.syncletId, 'photos', file));
                var head = false;
                stream.on('data', function(chunk) {
                    if(!head) {
                        head = true;
                        res.writeHead(200, {'Content-Disposition': 'attachment; filename=' + file});
                    }
                    res.write(chunk, "binary");
                });
                stream.on('error', function() {
                    res.writeHead(404);
                    res.end();
                });
                stream.on('end', function() {
                    res.end();
                });
            } else {
                res.writeHead(404);
                res.end();
            }
        });
    });
}
