// Copyright (c) 2015-2020 SmileOnMyMac, LLC dba Smile. All rights reserved
/* API Version Changes:
1 -
2 -
3 -
4 -
5 -
6 - Server returns groupURL in the addSnippet callback
7 - Added user flags for canEdit, canExpand, showDemoBanner, nagEveryNExpansions, canRunScripts
    Added passing deviceId to connectWithSessionTokenAndRevisions
8 - Added subscribeToSnippetGroup call
    Added serverAPIVersionFailed callback
9 - Server returns lastRevisionId to add/update/remove snippet to help sync figure out if it missed updates while offline
10 - GroupPrefix support
*/

var TenetAPIVersion = 10;
var syncDelegate = null;

authStateEnum = {
  AuthStateNoAuth: 0,
  AuthStateLoggingIn: 1,
  AuthStateLoggedIn: 2,
  AuthStateLoggedOut: 3
};

var TenetSync = function(serverAddress) {
  console.log("created sync with server address: " + serverAddress);
  this.ddp = undefined;
  this.authState = authStateEnum.AuthStateNoAuth;
  this.serverAddress = serverAddress;
  this.revisions = undefined;
  this.initialLoad = true;
  this.initialServerGroups = [];
  this.initialClientGroups = [];
  this.sessionToken = undefined;
  this.deviceId = undefined;
  this.connected = false;
  this.snippetGroupTimers = {};
  this.loginCallback = undefined;
  this.wkWebView = false;
  this.retryInterval = 5;
  this.retryTimer = undefined;
  this.sleeping = false;
};

var realConsole = console;
if(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.tenetlog) {
  window.console = {};
  console.log = function(message) {
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.tenetlog) {
      window.webkit.messageHandlers.tenetlog.postMessage(message);
    } else {
      realConsole.log(message);
    }
  }
}

TenetSync.prototype.makeCall = function(methodName, parameters, callback) {
  var self = this;
  console.log("makeCall " + methodName);
  if (self.connected) {
    var methodCall = self.ddp.call(methodName, parameters);
    methodCall.fail(function(result) {
      console.log("call failed: " + methodName);
      if (callback) {
        // We want to make sure the id is passed back as well
        var id;
        if (parameters.length > 0) {
          var obj = parameters[0];
          id = obj._id;
        }
        if (id) {
          result._id = id;
        }
        callback(false, result);
      }
    });
    methodCall.done(function(result) {
      self.handleMakeCallResponse(methodName, parameters, result);
      if (callback) {
        callback(true, result);
      }
    });
  }
  else if (callback) {  // not connected so cannot possibly succeed
    var disconnResult = {'error': 'connectionClosed'};
    if (parameters.length > 0) {	// We want to make sure the id is passed back as well
      var obj = parameters[0];
      id = obj._id;
      if (id) {
        disconnResult._id = id;
      }
    }
    callback(false, disconnResult);
  }
};

TenetSync.prototype.handleMakeCallResponse = function(methodName, parameters, result) {
  var self = this;
  switch (methodName) {
    case 'addSnippet':
    case 'updateSnippet':
      console.log('handling ' + methodName);
      var lastServerSnippetsRevisionId = result.lastRevisionId;
      var groupId = parameters[0].groupId;
      var clientSnippetsRevisionId = self.clientSnippetsRevisionIdForGroup(groupId);
      if (lastServerSnippetsRevisionId !== clientSnippetsRevisionId) {
          // Okay, so an updated snippet group was received before the updateSnippet
          // call was responded to. This means that we were up-to-date before handling this
          // response, so there is nothing further to do.
          console.log('updateSnippet response snippetsRevisionId mismatch for group: ' + groupId + ' - client: ' + clientSnippetsRevisionId + ' - server: ' + lastServerSnippetsRevisionId);
      } else {
        self.updateRevisions(groupId, null, result.dateUpdated);
      }
      break;
    case 'addSnippetGroup':
    case 'updateSnippetGroup':
      console.log('handling ' + methodName);
      var snippetGroupRevisionId = result.dateUpdated;
      var groupId = parameters[0]._id;
      self.updateRevisions(groupId, snippetGroupRevisionId);
      break;
    default:
      break;
  }
};

TenetSync.prototype.connectWithSessionTokenAndRevisions = function(token, deviceId, revisions, callback) {
  var self = this;
  console.log("connectWithSessionTokenAndRevisions, token: " + ((token) ? "****" : "falsey"));
  if (revisions && typeof (revisions) === "object") {
    self.revisions = revisions;
    self.initialClientGroups = Object.keys(self.revisions);
  } else {
    self.revisions = {};
  }
  self.sessionToken = token;
  self.deviceId = deviceId;
  self.loginCallback = callback;
  console.log("calling connect");
  self.connect();
};

TenetSync.prototype.connect = function() {
  var self = this;
  console.log("in connect");
  if (self.ddp !== undefined) {
    if (self.connected) {
      console.log("Anomaly: already connected in connect!");
      return;
    }
    console.log("Anomaly:  we may be making additional socket while one is open!");
  }
  self.ddp = new MeteorDdp(self.serverAddress);
  self.ddp.connect()
    .done(function() {
      console.log("connect success");
      self.retryInterval = 5;
      self.setConnected(true);
      self.loginWithToken(self.sessionToken, self.deviceId);
    });
  self.ddp.didclose = function(evt, theDDP) {
    if (self.ddp == theDDP) {
      console.log("connect failed (socket closed), evt: " + JSON.stringify(evt));
      self.handleDisconnect();
      if (self.loginCallback) {
        self.loginCallback(false, {});
	    self.loginCallback = undefined;
      }
    }
    else {
      console.log("Anomaly: didclose from some other socket. " + (self.ddp === undefined ? "No current ddp." : "Different ddp."));
    }
  };
};

TenetSync.prototype.handleDisconnect = function() {
  if (this.ddp === undefined) {
    // already handled disconnection, don't need to do anything here.
    return;
  }

  var self = this;
  self.setConnected(false);

  var keys = Object.keys(self.ddp.defs);
  var keyLength = keys.length;
  var toBeClosed = [];
  for (var i = 0; i < keyLength; i++) {
    var key = keys[i];
    toBeClosed.push(self.ddp.defs[key]);

    delete self.ddp.defs[key];
  }

  self.ddp = undefined;

  while (toBeClosed.length) {
    var deferred = toBeClosed.shift();
    deferred.reject({
      "error": "connectionClosed",
      "message": "The connection was closed while making this remote call."
    });
  }

  if (!self.sleeping && self.retryTimer === undefined) {
    console.log('Will retry connect in ' + self.retryInterval);
    // Keep backing off by 5 seconds to a 60 second max
    self.retryTimer = setTimeout(function() {
        self.retryTimer = undefined;
        self.connect();
      }, self.retryInterval * 1000);
    self.retryInterval = Math.min(60, (self.retryInterval + 5));
  }

  if(this.onDisconnectedCallback) {
    this.onDisconnectedCallback();
    this.onDisconnectedCallback = null;
  }
};

TenetSync.prototype.setAuthState = function(state) {
  var self = this;
  this.authState = state;
  if (syncDelegate) {
    syncDelegate.serverAuthStateChanged(state);
  }
};

TenetSync.prototype.setConnected = function(connected) {
  var self = this;
  if (connected === self.connected) {
    return;
  }
  self.connected = connected;
  if (connected === false) {
    self.setAuthState(authStateEnum.AuthStateNoAuth);
  }
  if (syncDelegate) {
    if (connected) {
      syncDelegate.serverConnected();
    } else {
      syncDelegate.serverDisconnected();
    }
  }

};

TenetSync.prototype.loginWithToken = function(token, deviceId) {
  var self = this;
  self.makeCall("checkAPIVersion", [TenetAPIVersion], function(success, result) {
    if (success) {
      self.setAuthState(authStateEnum.AuthStateLoggingIn);
      // Set up this subscription early
      self.ddp.subscribe("clientUserData");
      var login = self.ddp.call("login", [{
        resume: token,
        deviceId: deviceId
      }]);
      login.fail(function(result) {
        console.log("login failed: " + JSON.stringify(result));
        self.setAuthState(authStateEnum.AuthStateLoggedOut);
        if (self.loginCallback) {
          self.loginCallback(false, result);
          self.loginCallback = undefined;
        }
      });
      login.done(function(result) {
        console.log("logged in");
        self.setAuthState(authStateEnum.AuthStateLoggedIn);
        self.watchUserChanges();
        self.getSnippetGroups();
        var users = self.ddp.getCollection("users");
        if (self.loginCallback) {
          self.loginCallback(true, users);
          self.loginCallback = undefined;
        } else if (syncDelegate && Object.keys(users).length === 1) {
          var currentUserId = Object.keys(users)[0];
          // break identity with the collection, just
          // in case we mess something up.
          var currentUser = JSON.parse(JSON.stringify(users[currentUserId]));
          currentUser._id = currentUserId;
          // might be connecting after launching with no internet -- let the client know about the user
          // since the only loginCallback would have been loginCallback(false,nothing)
          syncDelegate.serverUpdatedUser(currentUser);
        }
      });
    } else {
      if (self.loginCallback) {
        self.loginCallback(false, result);
        self.loginCallback = undefined;
      } else {
        // Previously logged in and now getting an API version failure message
        console.log("login failed at reconnect: " + JSON.stringify(result));
        // See what kind of error we got
        var theError = result['error'];
        if ((theError === "clientAPIVersionTooOld" || theError === "clientAPIVersionTooNew") && syncDelegate) {
          syncDelegate.serverAPIVersionFailed();
        } else if (syncDelegate) {
          // unexpected error -- try to connect again
          self.handleDisconnect();
        }
      }
    }
  });
};

TenetSync.prototype.logout = function(logoutCallback) {
  var self = this;
  // Remove all subscriptions
  var successHandler = function(result) {
    console.log("unsubscribed from " + subName);
  };
  var failHandler = function(result) {
    console.log("failed to unsubscribe " + result);
  };
  for (var subName in self.subs) {
    var unsub = self.unsubscribe(subName);
    unsub.done(successHandler);
    unsub.fail(failHandler);
  }
  self.makeCall("logout", [], function(success, result) {
    if (success) {
      console.log("logged out");
    } else {
      console.log("error logging out");
    }
    if(logoutCallback) {
      logoutCallback(success);
    }
  });
  self.revisions = undefined;
  self.initialLoad = true;
  self.initialServerGroups = [];
  self.sessionToken = undefined;
  self.setAuthState(authStateEnum.AuthStateLoggedOut);
};

TenetSync.prototype.deviceStateChange = function(wakeVsSleep) {
  console.log('deviceStateChange ' + wakeVsSleep);
  if (wakeVsSleep === !this.sleeping) {
    return; // already in this state.
  }
	if (wakeVsSleep) {
		this.sleeping = false;
		if (!this.connected) {
			this.connect();
		}
	}
	else {
    this.disconnect();
  }
}

TenetSync.prototype.disconnect = function(callback) {
  this.sleeping = true;
  var fireCallback = true;
  if (this.connected) {
    fireCallback = false;
    this.onDisconnectedCallback = callback;
    this.ddp.close();
  }

  if(this.retryTimer) {
    window.clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
  }

  if(fireCallback && callback) {
    callback();
  }
}

TenetSync.prototype.getSnippetGroups = function() {
  var self = this;
  self.ddp.watch('snippetGroups', function(changedDoc, message) {
    if (syncDelegate === undefined) {
      console.log("no sync delegate");
      return;
    }
    if (self.authState !== authStateEnum.AuthStateLoggedIn) {
      // Ignore this message if not logged in
      return;
    }

    var cleaned = cleanDocument(changedDoc);
    var deleted = cleaned.deleted;
    var groupId = cleaned._id;
    if (message === 'added') {
      if (deleted) {
        // An 'add' of a delete is only important if the client has this group
        if (cleaned.snippetsRevisionId) {
          self.deleteGroup(cleaned);
        }
      } else {
        if (self.initialLoad) {
          // If we're just starting up, just record the added groups for later
          self.initialServerGroups[groupId] = cleaned;
        } else {
          var clientSnippetsRevisionId = self.clientSnippetsRevisionIdForGroup(groupId);
          var clientGroupRevisionId = self.clientGroupRevisionIdForGroup(groupId);
          if (clientSnippetsRevisionId !== cleaned.snippetsRevisionId) {
            // Changed snippetRev - needs fetch
            self.enqueueFetch(cleaned);
          } else if (clientGroupRevisionId !== cleaned.dateUpdated) {
            // changed groupRev - just tell client
            self.updateRevisions(groupId, cleaned.dateUpdated, null);
            syncDelegate.serverUpdatedSnippetGroup(cleaned);
          }
        }
      }
    } else if (message === 'changed') {
      if (deleted) {
        self.deleteGroup(cleaned);
      } else {
        self.enqueueFetch(cleaned);
      }
    } else if (message === 'removed') {
      self.deleteGroup(cleaned);
    } else {
      console.log("Unsupported message for snippetGroup monitoring: " + message);
    }
  });
  self.ddp.subscribe("nativeSnippetGroups").done(function() {
    console.log("subscribed to snippetGroups");
    self.processinitialServerGroups();
  });
};

TenetSync.prototype.enqueueFetch = function(group) {
  var self = this;
  var timer = self.snippetGroupTimers[group._id];
  var skip = false;
  if (timer) {
    clearTimeout(timer);
  } else {
    // If there is no timer (no current operations) and the snippetsRevisionId didn't change, just
    // call update immediately without queuing
    var serverSnippetsRevisionId = group.snippetsRevisionId;
    var clientSnippetsRevisionId = self.clientSnippetsRevisionIdForGroup(group._id);
    if (serverSnippetsRevisionId <= clientSnippetsRevisionId) {
      skip = true;
      self.updateRevisions(group._id, group.dateUpdated);
      syncDelegate.serverUpdatedSnippetGroup(group);
    }
  }
  if (skip === false) {
    timer = setTimeout(function() {
      self.fetchUpdatedSnippetsForGroup(group);
    }, 2000);
    self.snippetGroupTimers[group._id] = timer;
  }
};

TenetSync.prototype.clearFetch = function(groupId) {
  var self = this;
  // Clear out any queued timer for this group
  var timer = self.snippetGroupTimers[groupId];
  if (timer) {
    console.log('clearing queued timer for ' + groupId);
    clearTimeout(timer);
  }
};

TenetSync.prototype.fetchUpdatedSnippetsForGroup = function(snippetGroup, completion) {
  var self = this;

  // Clear any timer for this group
  var timer = self.snippetGroupTimers[snippetGroup._id];
  if (timer) {
    clearTimeout(timer);
    delete self.snippetGroupTimers[snippetGroup._id];
  }

  var groupId = snippetGroup._id;
  var serverGroupRevisionId = snippetGroup.dateUpdated;
  var serverSnippetsRevisionId = snippetGroup.snippetsRevisionId;
  var clientSnippetsRevisionId = self.clientSnippetsRevisionIdForGroup(groupId);
  if (serverSnippetsRevisionId > clientSnippetsRevisionId) {
    console.log("fetching new snippets for " + groupId + " from " + clientSnippetsRevisionId);
    if (clientSnippetsRevisionId === 0) {
      // Client does not know about this group; send it an add message with a fake revision ID
      var groupCopy = $.extend({}, snippetGroup);
      groupCopy.snippetsRevisionId = 0;
      syncDelegate.serverUpdatedSnippetGroup(groupCopy);
    }
    self.makeCall("newSnippetsForGroup", [groupId, clientSnippetsRevisionId], function(success, result) {
      if (success) {
        result.forEach(function(snippet) {
          var cleaned = cleanDocument(snippet);
          var deleted = cleaned.deleted;
          if (deleted) {
            syncDelegate.serverDeletedSnippet(cleaned);
          } else {
            syncDelegate.serverUpdatedSnippet(cleaned);
          }
        });
        self.updateRevisions(groupId, serverGroupRevisionId, serverSnippetsRevisionId);
        syncDelegate.serverUpdatedSnippetGroup(snippetGroup);
      } else {
        console.log("FAILED - " + JSON.stringify(result));
      }

      if (completion) {
        completion();
      }
    });
  } else {
    var serverGroupRevisionId = snippetGroup.dateUpdated;
    var clientGroupRevisionId = self.clientGroupRevisionIdForGroup(groupId);
    if (serverGroupRevisionId && serverGroupRevisionId !== clientGroupRevisionId) {
      // The snippets were up to date, but the snippet group's properties have changed
      self.updateRevisions(groupId, serverGroupRevisionId);
      syncDelegate.serverUpdatedSnippetGroup(snippetGroup);
    } else {
      console.log("already up to date: existing for group " + groupId + " = " + clientSnippetsRevisionId);
    }
    if (completion) {
      completion();
    }
    return;
  }
};

TenetSync.prototype.watchUserChanges = function() {
  var self = this;
  self.ddp.watch('users', function(changedDoc, message) {
    if (syncDelegate === undefined) {
      console.log("no sync delegate");
      return;
    }
    if (self.authState !== authStateEnum.AuthStateLoggedIn) {
      // Ignore this message if not logged in
      return;
    }

    var cleaned = cleanDocument(changedDoc);
    if (message === 'added' || message === 'changed') {
      syncDelegate.serverUpdatedUser(cleaned);
    } else {
      console.log("Unsupported message for user monitoring: " + message);
    }
  });
};

// initialServerGroups now holds the whole cleaned object
// Stash a copy of revisions as orginalClient and remove from that as we process
TenetSync.prototype.processinitialServerGroups = function() {
  var self = this;
  // Grab the first group and process it
  var groups = Object.keys(self.initialServerGroups);
  if (groups.length > 0) {
    var groupId = groups[0];
    var cleaned = self.initialServerGroups[groupId];
    delete self.initialServerGroups[groupId];
    var index = self.initialClientGroups.indexOf(groupId);
    if (index > -1) {
      self.initialClientGroups.splice(index, 1);
    }
    self.fetchUpdatedSnippetsForGroup(cleaned, function() {
      self.processinitialServerGroups();
    });
  } else {
    self.initialLoad = false;
    //    console.log(JSON.stringify(self.revisions, null, 2));
    self.initialClientGroups.forEach(function(groupId) {
      // Pass in a dummy group record
      syncDelegate.serverDeletedSnippetGroup({
        _id: groupId
      });
    });
    console.log("---SNIPPETS READY---");
    if (syncDelegate) {
      syncDelegate.syncServiceIsReady();
    }
  }
};

/* Revisions Handling */

TenetSync.prototype.updateRevisions = function(groupId, groupRevisionId, snippetsRevisionId) {
  var self = this;
  if (groupId) {
    if (self.revisions[groupId] === undefined) {
      self.revisions[groupId] = {};
    }
    if (groupRevisionId) {
      self.revisions[groupId].dateUpdated = groupRevisionId;
    }
    if (snippetsRevisionId) {
      self.revisions[groupId].snippetsRevisionId = snippetsRevisionId;
    }
    console.log("updated revisions table for " + groupId + " to " + JSON.stringify(self.revisions[groupId]));
  }
};

TenetSync.prototype.deleteGroup = function(group) {
  var self = this;
  var groupId = group._id;
  if (self.revisions[groupId]) {
    // Stop tracking it
    delete self.revisions[groupId];
    self.clearFetch(groupId);
    // Notify client
    syncDelegate.serverDeletedSnippetGroup(group);
  }
}

TenetSync.prototype.clientGroupRevisionIdForGroup = function(groupId) {
  var self = this;
  var result = 0;
  if (self.revisions[groupId]) {
    result = self.revisions[groupId].dateUpdated || 0;
  }
  return result
};

TenetSync.prototype.clientSnippetsRevisionIdForGroup = function(groupId) {
  var self = this;
  var result = 0;
  if (self.revisions[groupId]) {
    result = self.revisions[groupId].snippetsRevisionId || 0;
  }
  return result
};

function cleanDocument(doc) {
  // We only want to return the fields
  var newDoc = doc;
  // Scan the fields for dates
  for (var key in newDoc) {
    var value = newDoc[key];
    if (typeof (value) === "object") {
      var dateValue = value.$date;
      if (dateValue !== undefined) {
        newDoc[key] = dateValue;
      }
    }
  }
  return newDoc;
}

function connectWebViewJavascriptBridge(callback) {
  if (window.WebViewJavascriptBridge) {
    callback(WebViewJavascriptBridge);
  } else {
    document.addEventListener('WebViewJavascriptBridgeReady', function() {
      callback(WebViewJavascriptBridge);
    }, false);
  }
}

connectWebViewJavascriptBridge(function(bridge) {

  bridge.init(function(message, responseCallback) {
    console.log('Bridge recevied unexpected message: ' + message);
    if (responseCallback) {
      responseCallback('Calling back from unexpected message: ' + message);
    }
  });

  bridge.registerHandler('connectWithSessionTokenAndRevisions', function(data, responseCallback) {
    console.log('In connectWithSessionTokenAndRevisions handler');
    // transforms the javascript multiple parameters callback into a callback with a single parameters obj
    var callbackWrapper = function(success, result) {
      responseCallback({
        'success': success,
        'result': result
      });
    };

    gTenet.connectWithSessionTokenAndRevisions(data.token, data.deviceId, data.revisions, callbackWrapper);
  });

  bridge.registerHandler('makeCall', function(data, responseCallback) {
    console.log('In makeCall handler');
    // transforms the javascript multiple parameters callback into a callback with a single parameters obj
    var callbackWrapper = function(success, result) {
      responseCallback({
        'success': success,
        'result': result
      });
    };
    gTenet.makeCall(data.methodName, data.parameters, callbackWrapper);
  });

  bridge.registerHandler('deviceStateChange', function(data, responseCallback) {
    gTenet.deviceStateChange(data.wakeVsSleep);
  });
});

var BridgeSyncDelegate = function() {
  window.webkit.messageHandlers.tenetlog.postMessage('Created BridgeSyncDelegate');
}

BridgeSyncDelegate.prototype.serverUpdatedSnippetGroup = function(parameter) {
  window.WebViewJavascriptBridge.callHandler('serverUpdatedSnippetGroup', parameter, null);
};

BridgeSyncDelegate.prototype.serverUpdatedSnippet = function(parameter) {
  window.WebViewJavascriptBridge.callHandler('serverUpdatedSnippet', parameter, null);
};

BridgeSyncDelegate.prototype.serverDeletedSnippet = function(parameter) {
  window.WebViewJavascriptBridge.callHandler('serverDeletedSnippet', parameter, null);
};

BridgeSyncDelegate.prototype.serverDeletedSnippetGroup = function(parameter) {
  window.WebViewJavascriptBridge.callHandler('serverDeletedSnippetGroup', parameter, null);
};

BridgeSyncDelegate.prototype.serverUpdatedUser = function(parameter) {
  window.WebViewJavascriptBridge.callHandler('serverUpdatedUser', parameter, null);
};

BridgeSyncDelegate.prototype.serverConnected = function(parameter) {
  window.WebViewJavascriptBridge.callHandler('serverConnected', parameter, null);
};

BridgeSyncDelegate.prototype.serverDisconnected = function(parameter) {
  window.WebViewJavascriptBridge.callHandler('serverDisconnected', parameter, null);
};

BridgeSyncDelegate.prototype.serverAuthStateChanged = function(parameter) {
  window.WebViewJavascriptBridge.callHandler('serverAuthStateChanged', parameter, null);
};

BridgeSyncDelegate.prototype.serverAPIVersionFailed = function(parameter) {
  window.WebViewJavascriptBridge.callHandler('serverAPIVersionFailed', parameter, null);
};

BridgeSyncDelegate.prototype.syncServiceIsReady = function(parameter) {
  window.WebViewJavascriptBridge.callHandler('syncServiceIsReady', parameter, null);
};
