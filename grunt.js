function lintFiles(grunt) {
  var filesToLint = [];
  grunt.file.expand(
    'lib/**/*.js'
    // To ignore a subdirectory you'd do this:
    //'!lib/services/zeo/oauth/**/*.js'
  ).forEach(function (file) {
    // And this:
    //if (file.indexOf('zeo/oauth') === -1)
    filesToLint.push(file);
  });
  return filesToLint;
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
      src: lintFiles(grunt),
      scripts: 'scripts/**/*.js',
      grunt: 'grunt.js',
      tests: 'test/**/*.js'
    },
    watch: {
      files: '<config:lint.src>',
      tasks: 'default'
    },
    jshint: {
      options: {
        curly: false,
        strict: false,
        eqeqeq: true,
        immed: true,
        latedef: false,
        newcap: true,
        noarg: true,
        sub: true,
        undef: true,
        boss: true,
        eqnull: true,
        node: true
      },
      globals: {
        exports: true,
        console: true,
        module: true,
        process: true,
        require: true,

        $: true,
        _: true,
        async: true,
        moment: true,
        google: true,
        request: true,
        sprintf: true,

        __dirname: true,

        btoa: true,

        document: true,
        window: true,

        clearTimeout: true,
        setTimeout: true,

        setInterval: true,
        clearInterval: true,

        should: true,

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
  grunt.registerTask('default', 'lint:src simplemocha');
};
