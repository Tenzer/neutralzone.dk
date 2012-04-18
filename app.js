
/**
 * Module dependencies.
 */

var express = require('express');

var app = module.exports = express.createServer();

// Configuration

app.configure(function(){
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(app.router);
  app.use(express.static(__dirname + '/public'));
});

app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

app.configure('production', function(){
  app.use(express.errorHandler());
});

// Routes

app.get('/', function (req, res) {
  res.render('index', { layout: false, title: 'Live tweets from Danish American Football teams' });
});

app.listen(3000, function(){
  console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);
});

var clients = 0;
var io = require('socket.io').listen(app);
io.enable('browser client minification');

io.sockets.on('connection', function (socket) {
  clients++;
  socket.emit('users', { count: clients });
  socket.broadcast.emit('users', { count: clients });

  socket.on('disconnect', function () {
    clients--;
    socket.broadcast.emit('users', { count: clients });
  });
});

setInterval(function () {
  io.sockets.emit('tweet', { time: new Date() });
}, 5000);
