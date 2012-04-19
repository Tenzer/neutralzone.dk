/*jshint
  node: true,
  globalstrict: true,
  laxcomma: true
 */

'use strict';

/* Module dependencies */

var express = require('express');
var https = require('https');

var app = module.exports = express.createServer();


/* Configuration */

app.configure(function () {
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(app.router);
  app.use(express.static(__dirname + '/public'));
});

app.configure('development', function () {
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

app.configure('production', function () {
  app.use(express.errorHandler());
});


/* Routes */

app.get('/', function (req, res) {
  res.render('index', { layout: false, title: 'Live tweets from Danish American Football teams' });
});

app.listen(3000, function () {
  console.log('Express server listening on port %d in %s mode', app.address().port, app.settings.env);
});


/* Socket.IO */

var clients = 0;
var io = require('socket.io').listen(app);
io.enable('browser client minification');
io.set('log level', 2);

io.sockets.on('connection', function (socket) {
  clients++;
  socket.emit('users', { count: clients });
  socket.broadcast.emit('users', { count: clients });

  // Sends out the latest tweets to new users
  for (var i = 0; i < latest_tweets.length; i++) {
    socket.emit('tweet', latest_tweets[i]);
  }

  socket.on('disconnect', function () {
    clients--;
    socket.broadcast.emit('users', { count: clients });
  });
});


/* Twitter */

var twitter_options = JSON.parse(require('fs').readFileSync('twitter_options.json'));

var latest_tweets = [];
var Twitter = require('./twitter_streaming.js');
var t = new Twitter(twitter_options);

t.on('tweet', function (tweet) {
  io.sockets.emit('tweet', tweet);

  if (latest_tweets.push(tweet) > 20) {
    latest_tweets.shift();
  }
});

t.on('error', function (e) {
  console.error('ERROR: Received following error message from Twitter handler:');
  console.error(e.message);
  console.error('Quitting now!');
  require('process').exit(1);
});

t.getTweets();
