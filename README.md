# rest-socket.js

generic postgres db table > REST-style socket adaptor

## USAGE: 

````
// set up a sql table definition:
var sql = require('sql');  // https://www.npmjs.com/package/sql
var tableDefinition = sql.define({
	name: "topics",
	columns: ['id', 'forum_uuid', 'pinned', 'locked', 'question', 'answered', 'tags', 'title', 'content', 'published', 'modified', 'author'],
	pk: "id"
});

// get a postgres db connection:
var Client = require('pg').Client;
var pgclient = new Client("postgres://server");
pgclient.connect(function(err, client, done){});

// pass the table definition & db connection to a rest-socket require
var myrestsocket = require('rest-socket')(tableDefinition, pgclient);

// start your socket.io connection listener
io.on('connection', function(socket) {  
	// when socket connects, pass to the initSocketListeners method
	myrestsocket.initSocketListeners(socket);
	// after this you can emit('tablename:index') on the frontend,
	// and get back a response from the database over the same message.

});
````


## frontend implementation example:

````
// listening for changes
socket.on('topics:index', function(data){
	// every time you hear about an index of the topics table, do this:
	data.forEach(function(topic){
		renderTopic(topic);
	})
});

// requesting data:
socket.emit('topics:index');

// listening for new db rows
socket.on('topics:create', function(data){
	data.forEach(function(topic){
		renderTopic(topic);
	})
});
// creating a model:
socket.emit('topics:create', {name: "my topic", content: "my content"});
````
