module.exports = function (grunt) {
  'use strict';

  grunt.initConfig({
    },
    handlebars: {
      options: {
        namespace: 'Handlebars.templates',
        processName: function (filename) {
          var pieces = filename.split('/');
          return pieces[pieces.length - 1].replace(/\.handlebars$/, '');
        }
      },
      compile: {
        files: {
          'public/js/tweet.handlebars.js': 'templates/tweet.handlebars'
        }
      }
    },
    reduce: {
      root: 'public',
      outRoot: 'dist',
      less: false
    }
  });

  grunt.loadNpmTasks('grunt-contrib-handlebars');
  grunt.loadNpmTasks('grunt-reduce');

  grunt.registerTask('handlebars', ['handlebars']);
  grunt.registerTask('reduce', ['reduce']);
  grunt.registerTask('default', ['handlebars', 'reduce']);
};
