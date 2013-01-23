var _ = require('underscore');

function filterFiles(grunt, pattern, blacklist) {
  var files = grunt.file.expand(pattern);
  return _.reject(files, function (file) {
    return _.any(blacklist, function (ignored) {
      return file === ignored || file.match(ignored);
    });
  });
}

function testFiles(grunt) {
  return filterFiles(grunt, 'test/**/*.js', [
    'test/fixtures/synclets/twitter/related.js'
  ]);
}

function libFiles(grunt) {
  return filterFiles(grunt, 'lib/**/*.js', [
    /services/,
    'lib/firebase-auth-server.js',
    'lib/firebase-token-generator-node.js'
  ]);
}

function serviceFiles(grunt) {
  return filterFiles(grunt, 'lib/services/**/*.js', [
    'lib/services/gmail/imap/xregexp.js'
  ]);
}

module.exports = function (grunt) {
  // Project configuration.
  grunt.initConfig({
    pkg: '<json:package.json>',
    simplemocha: {
      all: {
        src: 'test/**/*.test.js',
        options: {
          globals: ['should'],
          timeout: 10000,
          ignoreLeaks: false
        }
      }
    },
    lint: {
      grunt    : 'grunt.js',
      lib      : libFiles(grunt),
      services : serviceFiles(grunt),
      tests    : testFiles(grunt),
      scripts  : 'scripts/**/*.js'
    },
    watch: {
      files: '<config:lint.lib>',
      tasks: 'default'
    },
    jshint: {
      options: {
        curly: false,
        latedef: false,
        strict: false,

        boss: true,
        eqeqeq: true,
        eqnull: true,
        immed: true,
        newcap: true,
        noarg: true,
        node: true,
        sub: true,
        undef: true
      },
      globals: {
        exports: true,
        console: true,
        module: true,
        process: true,
        require: true,

        __dirname: true,

        btoa: true,

        document: true,
        window: true,

        clearTimeout: true,
        setTimeout: true,

        setInterval: true,
        clearInterval: true,

        it: true,
        xit: true,
        describe: true,
        xdescribe: true,
        before: true,
        beforeEach: true,
        afterEach: true,
        after: true
      }
    }
  });

  grunt.loadNpmTasks('grunt-simple-mocha');

  // Default task.
  grunt.registerTask('default', 'lint:lib lint:services simplemocha');
};
