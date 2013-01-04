#!/usr/bin/env node

var fs = require('fs');
var glob = require('glob');

var resolutions = [
  16, 24, 32, 48, 64, 128, 256, 512, 1024
];

var specialCases = {
  gdocs: 'google',
  gplus: 'google'
};

glob("**/synclets.json", null, function (err, files) {
  files.forEach(function (file) {
    var name = /^.*\/(.*?)\/synclets\.json/.exec(file)[1];

    if (specialCases[name]) {
      console.log(name + ' → ' + specialCases[name]);

      name = specialCases[name];
    } else {
      console.log(name);
    }

    fs.readFile(file, function (err, data) {
      if (err) throw err;

      data = JSON.parse(data);

      data.icons = [];

      resolutions.forEach(function (res) {
        data.icons.push({
          height: res,
          width: res,
          source: 'http://assets.singly.com/service-icons/' + res + 'px/' +
            name + '.png'
        });
      });

      data = JSON.stringify(data, null, 2);

      fs.writeFile(file, data, function (err) {
        if (err) throw err;
      });
    });
  });
});
