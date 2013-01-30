(function() {
  var HOST, MESSAGE_BACKLOG, PORT, SESSION_TIMEOUT, asset, channel, createSession, fu, mem, qs, randomUserNick, sessions, starttime, sys, url, _i, _len, _ref;
  HOST = null;
  PORT = 8001;
  starttime = (new Date()).getTime();
  mem = process.memoryUsage();
  setInterval((function() {
    mem = process.memoryUsage();
    return;
  }), 10 * 1000);
  fu = require('./fu');
  sys = require('sys');
  url = require('url');
  qs = require('querystring');
  MESSAGE_BACKLOG = 200;
  SESSION_TIMEOUT = 60 * 1000;
  channel = new function() {
    var callbacks, messages;
    messages = [];
    callbacks = [];
    this.appendMessage = function(nick, type, text) {
      var m;
      m = {
        nick: nick,
        type: type,
        text: text,
        timestamp: (new Date()).getTime()
      };
      switch (type) {
        case 'msg':
          sys.puts("<" + nick + "> " + text);
          break;
        case 'join':
          sys.puts("" + nick + " join");
          break;
        case 'part':
          sys.puts("" + nick + " part");
      }
      messages.push(m);
      while (callbacks.length > 0) {
        callbacks.shift().callback([m]);
      }
      while (messages.length > MESSAGE_BACKLOG) {
        messages.shift();
      }
      return;
    };
    this.query = function(since, callback) {
      var matching, message, _i, _len;
      matching = [];
      for (_i = 0, _len = messages.length; _i < _len; _i++) {
        message = messages[_i];
        if (message.timestamp > since) {
          matching.push(message);
        }
      }
      if (matching.length !== 0) {
        callback(matching);
      } else {
        callbacks.push({
          timestamp: new Date(),
          callback: callback
        });
      }
      return;
    };
    setInterval(function() {
      var now;
      now = new Date();
      while (callbacks.length > 0 && now - callbacks[0].timestamp > 30 * 1000) {
        callbacks.shift().callback([]);
      }
      return;
    }, 3000);
    return;
  };
  sessions = {};
  randomUserNick = function() {
    return "User" + Math.floor(Math.random() * 99999999999).toString();
  };
  createSession = function(nick) {
    var id, session;
    if (nick.length > 50) {
      return null;
    }
    if (nick.length === 0) {
      return null;
    }
    if (/[^\w_\-^!]/.exec(nick)) {
      return null;
    }
    for (id in sessions) {
      session = sessions[id];
      if (session && session.nick === nick) {
        return null;
      }
    }
    session = {
      nick: nick,
      id: Math.floor(Math.random() * 99999999999).toString(),
      timestamp: new Date(),
      poke: function() {
        session.timestamp = new Date();
        return;
      },
      destroy: function() {
        channel.appendMessage(session.nick, 'part');
        delete sessions[session.id];
        return;
      }
    };
    return sessions[session.id] = session;
  };
  setInterval(function() {
    var id, now, session;
    now = new Date();
    for (id in sessions) {
      session = sessions[id];
      if (!sessions.hasOwnProperty(id)) {
        continue;
      }
      if (now - session.timestamp > SESSION_TIMEOUT) {
        session.destroy();
      }
    }
    return;
  }, 1000);
  fu.listen(Number(process.env.PORT || PORT), HOST);
  fu.get('/', fu.staticHandler('index.html'));
  _ref = ['style.css', 'client.js'];
  for (_i = 0, _len = _ref.length; _i < _len; _i++) {
    asset = _ref[_i];
    fu.get("/" + asset, fu.staticHandler(asset));
  }
  fu.get('/who', function(req, res) {
    var id, nicks, session;
    nicks = (function() {
      var _results;
      _results = [];
      for (id in sessions) {
        session = sessions[id];
        _results.push(session.nick);
      }
      return _results;
    })();
    res.simpleJSON(200, {
      nicks: nicks,
      rss: mem.rss
    });
    return;
  });
  fu.get('/join', function(req, res) {
    var nick, session;
    nick = qs.parse(url.parse(req.url).query).nick;
    session = createSession(nick);
    while (session === null) {
      nick = randomUserNick();
      sys.puts("No or bad nick given, picked random nick " + nick);
      session = createSession(nick);
    }
    channel.appendMessage(session.nick, 'join');
    res.simpleJSON(200, {
      id: session.id,
      nick: session.nick,
      rss: mem.rss,
      starttime: starttime
    });
    return;
  });
  fu.get('/part', function(req, res) {
    var id, session;
    id = qs.parse(url.parse(req.url).query).id;
    if (id && sessions[id]) {
      session = sessions[id];
      session.destroy();
    }
    res.simpleJSON(200, {
      rss: mem.rss
    });
    return;
  });
  fu.get('/recv', function(req, res) {
    var id, session, since;
    if (!qs.parse(url.parse(req.url).query).since) {
      res.simpleJSON(400, {
        error: 'Must supply since parameter'
      });
      return;
    }
    id = qs.parse(url.parse(req.url).query).id;
    if (id && sessions[id]) {
      session = sessions[id];
      session.poke();
    }
    since = parseInt(qs.parse(url.parse(req.url).query).since, 10);
    channel.query(since, function(messages) {
      if (session) {
        session.poke();
      }
      res.simpleJSON(200, {
        messages: messages,
        rss: mem.rss
      });
      return;
    });
    return;
  });
  fu.get('/send', function(req, res) {
    var id, session, text;
    id = qs.parse(url.parse(req.url).query).id;
    text = qs.parse(url.parse(req.url).query).text;
    session = sessions[id];
    if (!session || !text) {
      res.simpleJSON(400, {
        error: 'No such session id'
      });
      return;
    }
    session.poke();
    channel.appendMessage(session.nick, 'msg', text);
    res.simpleJSON(200, {
      rss: mem.rss
    });
    return;
  });
}).call(this);
