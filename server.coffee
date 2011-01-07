HOST = null # localhost
PORT = 8001

# when the daemon started
starttime = ( new Date() ).getTime()

mem = process.memoryUsage()
# every 10 seconds poll for the memory.
setInterval( ( -> mem = process.memoryUsage(); return ), 10 * 1000 )

fu  = require './fu'
sys = require 'sys'
url = require 'url'
qs  = require 'querystring'

MESSAGE_BACKLOG = 200
SESSION_TIMEOUT = 60 * 1000

channel = new ->
    messages  = []
    callbacks = []

    @appendMessage = (nick, type, text) ->
        m =
            nick      : nick
            type      : type     # 'msg', 'join', 'part'
            text      : text
            timestamp : ( new Date() ).getTime()

        switch type
            when 'msg'  then sys.puts "<#{nick}> #{text}"
            when 'join' then sys.puts "#{nick} join"
            when 'part' then sys.puts "#{nick} part"

        messages.push m
        callbacks.shift().callback( [m] ) while callbacks.length > 0
        messages.shift() while messages.length > MESSAGE_BACKLOG
        return

    @query = (since, callback) ->
        matching = []
        for message in messages
            matching.push(message) if message.timestamp > since
        if matching.length != 0
            callback matching
        else
            callbacks.push
                timestamp : new Date()
                callback  : callback
        return

    # clear old callbacks
    # they can hang around for at most 30 seconds.
    setInterval( ->
        now = new Date()
        while callbacks.length > 0 and now - callbacks[0].timestamp > 30 * 1000
            callbacks.shift().callback( [] )
        return
    , 3000)
    return

sessions = {}

randomString = ->
    return "User" + Math.floor(Math.random() * 99999999999).toString()

createSession = (nick) ->
    return null if nick.length > 50
    return null if /[^\w_\-^!]/.exec nick

    for session in sessions
        return null if session and session.nick is nick

    session =
        nick      : nick
        id        : Math.floor(Math.random() * 99999999999).toString()
        timestamp : new Date()
        poke      : -> session.timestamp = new Date(); return
        destroy   : ->
            channel.appendMessage session.nick, 'part'
            delete sessions[session.id]
            return
    sessions[session.id] = session

# interval to kill off old sessions
setInterval( ->
    now = new Date()
    for id, session of sessions
        continue unless sessions.hasOwnProperty id
        session.destroy() if now - session.timestamp > SESSION_TIMEOUT
    return
, 1000)

fu.listen Number(process.env.PORT or PORT), HOST

fu.get '/', fu.staticHandler 'index.html'
fu.get("/#{asset}", fu.staticHandler asset) for asset in [
    'style.css', 'client.js'
]

fu.get '/who', (req, res) ->
    nicks = (session.nick for session in sessions)
    res.simpleJSON 200, {nicks: nicks, rss: mem.rss}
    return

fu.get '/join', (req, res) ->
    nick = qs.parse(url.parse(req.url).query).nick
    if nick is null or nick.length is 0
        #res.simpleJSON 400, {error: 'Bad nick.'}
        #return
        nick = randomString()
        sys.puts("Picked random nick " + nick)

    session = createSession nick
    if session is null
        res.simpleJSON 400, {error: 'Nick in use'}
        return

    channel.appendMessage session.nick, 'join'
    res.simpleJSON 200
        id        : session.id
        nick      : session.nick
        rss       : mem.rss
        starttime : starttime
    return

fu.get '/part', (req, res) ->
    id = qs.parse(url.parse(req.url).query).id
    if id and sessions[id]
        session = sessions[id]
        session.destroy()

    res.simpleJSON 200, {rss: mem.rss}
    return

fu.get '/recv', (req, res) ->
    if not qs.parse(url.parse(req.url).query).since
        res.simpleJSON 400, {error: 'Must supply since parameter'}
        return

    id = qs.parse(url.parse(req.url).query).id
    if id and sessions[id]
        session = sessions[id]
        session.poke()

    since = parseInt qs.parse(url.parse(req.url).query).since, 10
    channel.query since, (messages) ->
        session.poke() if session
        res.simpleJSON 200
            messages : messages
            rss      : mem.rss
        return
    return

fu.get '/send', (req, res) ->
    id      = qs.parse(url.parse(req.url).query).id
    text    = qs.parse(url.parse(req.url).query).text
    session = sessions[id]

    if !session or !text
        res.simpleJSON 400, {error: 'No such session id'}
        return

    session.poke()
    channel.appendMessage session.nick, 'msg', text
    res.simpleJSON 200, {rss: mem.rss}
    return
