var ijod = require('ijod');

function ijodRequest(ijodFn, hasEach, req, res) {
  var response = {};

  var basePath = req.param('basePath');
  var range = req.param('range');
  if (range) {
    try {
      range = JSON.parse(range);
    } catch (E) {
      return res.jsonErr('Error parsing range. ' + E.message);
    }
  }

  function sendResponse(err, result) {
    if (err) response.error = err + ''; // Convert Error to string if needed
    if (result) response.result = result;
    res.json(response, (err ? 500 : 200));
  }

  if (hasEach) {
    response.data = [];

    return ijod[ijodFn](basePath, range, function(item) {
      response.data.push(item);
    }, sendResponse);
  } else {
    return ijod[ijodFn](basePath, range, sendResponse);
  }
}

exports.addRoutes = function(app) {
  app.get('/bounds', function(req, res) {
    return ijodRequest('getBounds', false, req, res);
  });

  app.get('/range', function(req, res) {
    return ijodRequest('getRange', true, req, res);
  });

  app.get('/tardis', function(req, res) {
    return ijodRequest('getTardis', false, req, res);
  });

  // ijod getOne support
  app.get("/getOne", function(req, res) {
    if (!req.param("idr")) return res.jsonErr("idr parameter not specified");
    ijod.getOne(req.param("idr"), function(err, data) {
      if (err) return res.jsonErr(err);
      return res.json(data);
    });
  });

  app.get("/getOnePars", function(req, res) {
    if (!req.param("idr") || !req.param("cat")) return res.jsonErr("idr or cat not specified");
    ijod.getOnePars(req.param("idr"), req.param("cat"), function(err, data) {
      if (err) return res.jsonErr(err);
      return res.josn(data);
    });
  });
};
