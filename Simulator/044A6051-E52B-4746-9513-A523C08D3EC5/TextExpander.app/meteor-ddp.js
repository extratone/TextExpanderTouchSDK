/* MeteorDdp - a client for DDP version pre1 */

/* We think this is based on https://github.com/EddieFloresLive/meteor-ddp 
 *
 * February 23, 2017 - BB - changed to handle the WebSocket's onclose event 'locally'
 * and pass the event on to the DDP's "owner" in the form of a didclose(event, ddpObject) callback.
 * Also added a heartbeat timer and _longIdle to handle observed cases where connection
 * is dropped, but onclose does not get called.
 */

var MeteorDdp = function(wsUri) {
  this.VERSIONS = ["1", "pre2", "pre1"];

	this.wsUri = wsUri;
	this.sock = undefined;
	this.defs = {}; // { deferred_id => deferred_object }
	this.subs = {}; // { pub_name => deferred_id }
	this.watchers = {}; // { coll_name => [cb1, cb2, ...] }
	this.collections = {}; // { coll_name => {docId => {doc}, docId => {doc}, ...} }
	this.heartbeatTimerID = undefined;
	this.didclose = undefined;
};

MeteorDdp.prototype._Ids = function() {
	var count = 0;
	return {
		next: function() {
			return ++count + '';
		}
	};
}();

MeteorDdp.prototype.connect = function() {
	var self = this;
	
	var conn = new $.Deferred();

	if (self.sock !== undefined) {
		console.log('Anomaly: ddp trying to connect socket when already have one');
	}
	else {
		self.sock = new WebSocket(self.wsUri);
	}

	self.sock.onopen = function() {
		self.send({
			msg: 'connect',
			version: self.VERSIONS[0],
			support: self.VERSIONS
		});
	};

	self.sock.onerror = function(err) {
		console.log('ddp sock onerror' + err);
		self.sock.close();
	};

	self.sock.onmessage = function(msg) {
		var data = JSON.parse(msg.data);
		if (data.msg !== undefined) {
			if (self.heartbeatTimerID !== undefined) {
				// Any message received counts as a heartbeat -- cancel any existing timer and restart
				clearTimeout(self.heartbeatTimerID);
			}
			self.heartbeatTimerID = setTimeout(function() { self._longIdle(); }, 125 * 1000);
		}

		switch (data.msg) {
			case 'connected':
				conn.resolve(data);
				break;
			case 'result':
				self._resolveCall(data);
				break;
			case 'updated':
				// TODO method call was acked
				break;
			case 'changed':
				self._changeDoc(data);
				break;
			case 'added':
				self._addDoc(data);
				break;
			case 'removed':
				self._removeDoc(data);
				break;
			case 'ready':
				self._resolveSubs(data);
				break;
			case 'nosub':
				self._resolveNoSub(data);
				break;
			case 'addedBefore':
				self._addDoc(data);
				break;
			case 'movedBefore':
				// TODO
				break;
			case 'ping':
				self._resolvePing(data);
				break;
			case 'pong':
				console.log('ddp pong');
				break;
		}
	};

	self.sock.onclose = function(evt) {
		console.log('ddp sock onclose' + evt);
		if (self.heartbeatTimerID !== undefined) {
			clearTimeout(self.heartbeatTimerID);
			self.heartbeatTimerID = undefined;
		}
		if (self.didclose !== undefined) {
			self.didclose(evt, self);
		}
		self.sock = undefined;
	};
	
	return conn.promise();
};

MeteorDdp.prototype._resolvePing = function(data) {
    var pong = {msg: 'pong'};
    if (data.hasOwnProperty('id')) {
        pong.id = data.id;
    }
//	console.log('ping');// no logging of ping for release versions
    this.send(pong);
};

MeteorDdp.prototype._longIdle = function() {
	// Ideally we do not reach this in normal operations unless connection has been lost
	var self = this;
	var ping = {msg: 'ping', id: this._Ids.next()};
	console.log('ddp long idle');
	this.heartbeatTimerID = setTimeout(function() { self._pingFailed(); }, 45 * 1000);
	this.send(ping);
};

MeteorDdp.prototype._pingFailed = function() {
	// Pretty sure connection has been lost
	console.log('ddp no server response');
	this.close();
};

MeteorDdp.prototype._resolveNoSub = function(data) {
	if (data.error) {
		var error = data.error;
		this.defs[data.id].reject(error.reason || 'Subscription not found');
	} else {
		this.defs[data.id].resolve();
	}
};

MeteorDdp.prototype._resolveCall = function(data) {
	if (data.error) {
		this.defs[data.id].reject(data.error);
	} else {
		this.defs[data.id].resolve(data.result);
	}
	delete this.defs[data.id];
};

MeteorDdp.prototype._resolveSubs = function(data) {
	var subIds = data.subs;
	for (var i = 0; i < subIds.length; i++) {
		if (this.defs[subIds[i]]) {
			this.defs[subIds[i]].resolve();
			delete this.defs[subIds[i]];
		}
	}
};

MeteorDdp.prototype._changeDoc = function(msg) {
	var collName = msg.collection;
	var id = msg.id;
	var fields = msg.fields;
	var cleared = msg.cleared;
	var coll = this.collections[collName];

	if (fields) {
		for (var k in fields) {
			coll[id][k] = fields[k];
		}
	}
    if (cleared) {
		for (var i = 0; i < cleared.length; i++) {
			var fieldName = cleared[i];
			delete coll[id][fieldName];
		}
	}

	var changedDoc = coll[id];
	this._notifyWatchers(collName, changedDoc, id, msg.msg);
};

MeteorDdp.prototype._addDoc = function(msg) {
	var collName = msg.collection;
	var id = msg.id;
	if (!this.collections[collName]) {
		this.collections[collName] = {};
	}
	/* NOTE: Ordered docs will have a 'before' field containing the id of
	 * the doc after it. If it is the last doc, it will be null.
	 */
	this.collections[collName][id] = msg.fields;

	var changedDoc = this.collections[collName][id];
	this._notifyWatchers(collName, changedDoc, id, msg.msg);
};

MeteorDdp.prototype._removeDoc = function(msg) {
	var collName = msg.collection;
	var id = msg.id;
	var doc = this.collections[collName][id];

	var docCopy = JSON.parse(JSON.stringify(doc));
	delete this.collections[collName][id];
	this._notifyWatchers(collName, docCopy, id, msg.msg);
};

MeteorDdp.prototype._notifyWatchers = function(collName, changedDoc, docId, message) {
	changedDoc = JSON.parse(JSON.stringify(changedDoc)); // make a copy
	changedDoc._id = docId; // id might be useful to watchers, attach it.

	if (!this.watchers[collName]) {
		this.watchers[collName] = [];
	} else {
		for (var i = 0; i < this.watchers[collName].length; i++) {
			this.watchers[collName][i](changedDoc, message);
		}
	}
};

MeteorDdp.prototype._deferredSend = function(actionType, name, params) {
	var id = this._Ids.next();
	this.defs[id] = new $.Deferred();

	var args = params || [];

	var o = {
		msg: actionType,
		params: args,
		id: id
	};

	if (actionType === 'method') {
		o.method = name;
	} else if (actionType === 'sub') {
		o.name = name;
		this.subs[name] = id;
	}

	this.send(o);
	return this.defs[id].promise();
};

MeteorDdp.prototype.call = function(methodName, params) {
	return this._deferredSend('method', methodName, params);
};

MeteorDdp.prototype.subscribe = function(pubName, params) {
	return this._deferredSend('sub', pubName, params);
};

MeteorDdp.prototype.unsubscribe = function(pubName) {
	var id = this.subs[pubName];
	this.defs[id] = new $.Deferred();
	if (!this.subs[pubName]) {
		this.defs[id].reject(pubName + " was never subscribed");
	} else {
		var o = {
			msg: 'unsub',
			id: id
		};
		this.send(o);
	}
	return this.defs[id].promise();
};

MeteorDdp.prototype.watch = function(collectionName, cb) {
	if (!this.watchers[collectionName]) {
		this.watchers[collectionName] = [];
	}
	this.watchers[collectionName].push(cb);
};

MeteorDdp.prototype.getCollection = function(collectionName) {
	return this.collections[collectionName] || null;
};

MeteorDdp.prototype.getDocument = function(collectionName, docId) {
	return this.collections[collectionName][docId] || null;
};

MeteorDdp.prototype.send = function(msg) {
	this.sock.send(JSON.stringify(msg));
};

MeteorDdp.prototype.close = function() {
	this.sock.close();
};
