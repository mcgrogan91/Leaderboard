var http = require('http');
 
var server = http.createServer(function(req, res) {
    res.writeHead(200);
    res.write('<p>This site does not have a web portion.</p>');
    res.end();
});
 
var port = 10001;
server.listen(port, function() {
    console.log('server listening on port ' + port);
});
