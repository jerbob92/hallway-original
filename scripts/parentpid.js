var cp = require('child_process');

var n = cp.fork(__dirname + '/../hallwayd.js', ["workerchild"], {env: process.env});

n.on('message', function(m) {
  if(m.pid) console.log('got back', m);
  if(m.ready) n.send({ pid: process.argv[2] });
});


