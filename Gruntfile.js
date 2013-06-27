module.exports = function (grunt) {
  'use strict';

  grunt.initConfig({
    reduce: {
      root: 'public',
      outRoot: 'dist',
      less: false
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
    }
  });

  grunt.loadNpmTasks('grunt-reduce');
  grunt.loadNpmTasks('grunt-contrib-handlebars');

  grunt.registerTask('default', ['handlebars', 'reduce']);
};
