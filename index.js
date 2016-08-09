var express = require('express');
var app = express();
var server = require('http').Server(app);

server.listen(9000);

app.use("/", express.static(__dirname + '/build'));

app.get('/', function (req, res) {
    res.sendFile('build/index.html', {root: __dirname });
});
