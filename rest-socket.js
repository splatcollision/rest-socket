// rest-socket.js

// generic postgres db table > REST-style socket adaptor

// USAGE: 

/*
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

*/

/*

// frontend implementation example:

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

*/

module.exports = function(table, db) {
	// table expects to be sql.define'd from https://www.npmjs.com/package/sql package
	// db should be a connected new Client(credentials.uri); postgres client connection https://github.com/brianc/node-postgres
	// will automatically set up socket listeners according to the table name for index + CRUD operations over websockets.
	var debug = require('debug')('livechat:rest-socket:' + table._name);

	debug('set up table:', table._name, table.pk);

	var pk = table.pk || 'id'; // use a default primary key column name of 'id'

	// This module should be responsible for setting up socket listeners

	// This is convenience for named socket routes - this generates the pattern of listeners
	// based on tablename:operation
	var routes = {
		index: table._name + ':index',
		create: table._name + ':create',
		read: table._name + ':read',
		update: table._name + ':update',
		dleet: table._name + ':dleet',
	}
	
	// reference for our socket
	var sock;

	// emit wrapper
	function emit() {

		if (sock) sock.emit.apply(sock, arguments);
	}
	
	// broadcast wrapper
	function broadcast() {
		// debug('trying broadcast.emit:', typeof sock.broadcast.emit);
		
		emit.apply(sock, arguments); // for simplicity, broadcast should also emit
		if (sock) sock.broadcast.emit.apply(sock, arguments);

	}

	// why is init a separate call? bc you'll probably be initializing a database connection + a websocket instance
	// at application startup - this allows them to be set up separately & passed in here when ready.
	function init(socket) {
		// when the socket is available pass it for setup listeners
		sock = socket; // cache our socket plz
		// actual route db CRUD listeners
		debug('socket init routes:', routes);
		socket.on(routes.index, index);
		socket.on(routes.create, create);
		socket.on(routes.read, read);
		socket.on(routes.update, update);
		socket.on(routes.dleet, dleet);
	}

	// normalize incoming data to proper table.columns
	// TODO type checking & error reporting
	function normalize(data) {
		var ret = {};
		// iterate table columns and only include in the return object data matching those columns
		// avoids db errors if extra data fields are passed
		for (var param in table.columns) {
			var pname = table.columns[param].name;
			ret[pname] = data[pname];
		}
		return ret;
	}

	// socket broadcast name will be table:method

	// will emit tables:index
	function index() {
		debug('index request');
		// query here plz
		var query = table.select(table.star()).from(table).toQuery();
		db.query(query.text, query.values, function(err, resp){
			debug('index resp:', err);
			if (err) {
				emit(routes.index, {"error": "db error"}); // TODO better specific error reporting
			} else {
				debug(resp.rows);
				emit(routes.index, resp.rows);
			}
		});
	}


	// create should broadcast tables:create
	function create(data) {
		debug('create request', data);
		data = normalize(data);
		delete data[pk]; // deleting any passed pk field because databases get to choose
		var query = table.insert(data).returning("*").toQuery();
		
		debug(query.text, query.values, typeof query.values[0]);
		db.query(query.text, query.values, function(err, resp){
			debug('create resp:', err);
			if (err) {
				emit(routes.create, {"error": "db error"}); // TODO better specific error reporting
			} else {
				debug(resp.rows);
				broadcast(routes.create, resp.rows);
			}
		});
	}

	// emit tables:read
	function read(data) {
		debug('read request', data);
		if (!data[pk]) return emit(routes.read, {"error": "no id attribute in passed data for " + routes.read});
		var query = table.select().where(table[pk].equals(data[pk])).toQuery();
		db.query(query.text, query.values, function(err, resp){
			debug('read resp:', err);
			if (err) {
				emit(routes.read, {"error": "db error"}); // TODO better specific error reporting
			} else {
				debug(resp.rows);
				emit(routes.read, resp.rows);
			}
		});
	}


	// broadcast tables:read:id -- response to an update should be a read
	function update(data) {
		debug('update request', data);
		if (!data[pk]) return emit(routes.read, {"error": "no id attribute in update data for " + routes.read});
		var id = data[pk];
		delete data[pk]; // ok
		data = normalize(data);
		var query = table.update(data).where(
			table[pk].equals(id)
		).returning("*").toQuery();
		db.query(query.text, query.values, function(err, resp){
			debug('update resp:', err);
			if (err) {
				emit(routes.update, {"error": "db error"}); // TODO better specific error reporting
			} else {
				debug(resp.rows);
				broadcast(routes.update, resp.rows);
			}
		});
	}

	// dleet = delete but it's a reserved word so there.
	// broadcast tables:dleet so we know it's been deleted
	function dleet(data) {
		debug('dleet request', data);
		if (!data[pk]) return emit(routes.read, {"error": "no id attribute in passed data for " + routes.read});
		var query = table.delete().where(table[pk].equals(data[pk])).returning("*").toQuery();
		db.query(query.text, query.values, function(err, resp){
			debug('dleet resp:', err);
			if (err) {
				emit(routes.dleet, {"error": "db error"}); // TODO better specific error reporting
			} else {
				debug(resp.rows);
				broadcast(routes.dleet, resp.rows); //
			}
		});
	}

	debug('initialized');


	return {
		initSocketListeners: init,
		index: index,
		create: create,
		read: read,
		update: update,
		dleet: dleet
	};


}