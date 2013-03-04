var expect = require("chai").expect;

var map = require("services/twitter/map");

var urls = [
  {
    name: "parentheticals and trailing parens",
    text: "GNOME Discusses Becoming a Linux-only Project http://bit.ly/jBrrAe (http://bit.ly/jO9Pfy) http://bit.ly/j09Pfty) #guru",
    results: [ 'http://bit.ly/jBrrAe', 'http://bit.ly/jO9Pfy', 'http://bit.ly/j09Pfty)' ]
  },
  {
    name: "exclamation points",
    text: "http://t.co/5D4M9c03.MUCH!!!!!!!!!!!!!!!!!!!!!!!!! \u2665\u2665\u2665",
    results:["http://t.co/5D4M9c03.MUCH!!!!!!!!!!!!!!!!!!!!!!!!!"]
  },
  {
    name: "odd parens and unicode",
    text: "contrived example: http://somethign.com http://more.com/6o9AEKAk”(",
    results: [ 'http://somethign.com/', 'http://more.com/6o9AEKAk”(' ]
  },
  {
    name: "tons of periods",
    text: "Some text with a http://link.to.............................................................. with periods after",
    results: [ 'http://link.to............................................................../' ]
  }
];

var data = {id_str:"test", user:{id:1}};

describe("twitter url regex", function() {
  urls.forEach(function(urlInfo) {
    it("handles known troublesome urls with " + urlInfo.name, function() {
      data.text = urlInfo.text;
      var results = map.tweet.urls(data);
      results.forEach(function(res) {
        var pos = urlInfo.results.indexOf(res);
        expect(pos).to.be.above(-1);
        urlInfo.results.splice(pos, 1);
      });
      expect(urlInfo.results).to.be.empty;
    });
  });
});
