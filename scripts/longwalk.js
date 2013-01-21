var lconfig = require('lconfig');
var dal = require('dal');
var async = require('async');
var ijod = require('ijod');
var knox = require("knox");
var s3 = knox.createClient({
  key: lconfig.s3.key,
  secret: lconfig.s3.secret,
  bucket: lconfig.s3.bucket
});

var start = process.argv[2] || "0";
var limit = parseInt(process.argv[3], 10) || 1000;

function step(arg) {
  console.log(arg);
  dal.query("select hex(base) as base, hex(idr) as idr, path from Entries where base > unhex(?) limit ?", [arg.base, limit], function (err, rows) {
    if (err) return console.error(err, arg);
    if (rows.length === 0) return console.log("done", arg);
    arg.total += rows.length;
    arg.base = rows[rows.length - 1].base;
    async.forEachLimit(rows, 100, function (row, cbRow) {
      if (!row.path || row.path.indexOf('/') === -1) {
        return process.nextTick(cbRow);
      }
      s3.head(row.path).on('response', function (res) {
//        console.log(row.path,res.statusCode);
        if (res.statusCode !== 200) arg.del++;
        cbRow();
      }).end();
//      ijod.getOne(row.idr, function(err, entry){
//        if (err || !entry) arg.del++;
//        cbRow();
//      });
    }, function () {
      step(arg);
    });
/* old code
    var dels = [];
    async.forEach(dups, function(dup, cb){
      var ids = dup.split(" ");
      ijod.getOne(ids[0], function(err, entry){
        var bad;
        if (entry.id.indexOf(ids[0]) == -1) bad = ids[0];
        if (entry.id.indexOf(ids[1]) == -1) bad = ids[1];
        if (bad && deleteme) dels.push("'"+bad+"'");
        cb();
      })
    }, function(){
      if (dels.length == 0) return step(arg);
      dal.query("delete from ijod where idr in ("+dels.join(',')+") limit",[dels.length],function(err){
        if (err) return console.error(err);
        step(arg);
      });
    });
*/
  });
}

ijod.initDB(function () {
  step({ base: start, total: 0, del: 0 });
});
