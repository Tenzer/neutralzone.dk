module.exports = function (grunt) {
	'use strict';

	grunt.initConfig({
		reduce: {
			root: 'public',
			outRoot: 'dist',
			less: false,
			asyncScripts: false
		},
		handlebars: {
			options: {
				namespace: false
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
