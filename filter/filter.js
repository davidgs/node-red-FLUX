'use strict'

var request = require('request')
var mustache = require('mustache')

module.exports = function(RED) {
  function filter(n) {
    RED.nodes.createNode(this, n)
    var node = this
    var nodeUrl =
      'http://localhost:8888/chronograf/v1/sources/235/services/235/proxy?path=%2Fquery%3Forganization%3Ddefaultorgname'
    var nodeFollowRedirects = n['follow-redirects'] || true
    var nodeMethod = 'POST'
    if (n.tls) {
      var tlsNode = RED.nodes.getNode(n.tls)
    }
    this.ret = n.ret || 'txt'
    if (RED.settings.httpRequestTimeout) {
      this.reqTimeout = parseInt(RED.settings.httpRequestTimeout) || 120000
    } else {
      this.reqTimeout = 120000
    }
    this.on('input', function(msg) {
      var query = {}
      if (msg.query) {
        query = {
          query: `${msg.query.query} |> filter(fn: (r) => r.${n.key} == "${
            n.value
          }")`,
          dialect: {annotations: ['group', 'datatype', 'default']},
        }
      } else {
        query = {
          query: `filter(fn: (r) => r.{n.key} == "${n.value}")`,
          dialect: {annotations: ['group', 'datatype', 'default']},
        }
      }

      var preRequestTimestamp = process.hrtime()
      node.status({
        fill: 'blue',
        shape: 'dot',
        text: 'httpin.status.requesting',
      })

      var url = nodeUrl || msg.url
      if (msg.url && nodeUrl && nodeUrl !== msg.url) {
        // revert change below when warning is finally removed
        node.warn(RED._('common.errors.nooverride'))
      }

      var method = 'POST'
      if (msg.method && n.method && n.method !== 'use') {
        // warn if override option not set
        node.warn(RED._('common.errors.nooverride'))
      }
      if (msg.method && n.method && n.method === 'use') {
        method = msg.method.toUpperCase() // use the msg parameter
      }
      var opts = {
        method: method,
        url: url,
        timeout: node.reqTimeout,
        followRedirect: nodeFollowRedirects,
        headers: {},
        encoding: null,
      }

      if (msg.payload && method == 'POST') {
        opts.body = JSON.stringify(query)
        opts.headers['content-type'] = 'application/json'
      }
      if (node.ret === 'obj') {
        opts.headers.accept = 'application/json, text/plain;q=0.9, */*;q=0.8'
      }

      if (this.credentials && this.credentials.user) {
        opts.auth = {
          user: this.credentials.user,
          pass: this.credentials.password,
          sendImmediately: false,
        }
      }

      if (tlsNode) {
        tlsNode.addTLSOptions(opts)
      }
      console.log(opts)
      request(opts, function(error, response, body) {
        node.status({})
        if (error) {
          if (error.code === 'ETIMEDOUT') {
            node.error(RED._('common.notification.errors.no-response'), msg)
            setTimeout(function() {
              node.status({
                fill: 'red',
                shape: 'ring',
                text: 'common.notification.errors.no-response',
              })
            }, 10)
          } else {
            node.error(error, msg)
            msg.payload = error.toString() + ' : ' + url
            msg.statusCode = error.code
            node.send(msg)
            node.status({
              fill: 'red',
              shape: 'ring',
              text: error.code,
            })
          }
        } else {
          msg.payload = body
          msg.headers = response.headers
          msg.statusCode = response.statusCode
          if (node.metric()) {
            // Calculate request time
            var diff = process.hrtime(preRequestTimestamp)
            var ms = diff[0] * 1e3 + diff[1] * 1e-6
            var metricRequestDurationMillis = ms.toFixed(3)
            node.metric('duration.millis', msg, metricRequestDurationMillis)
            if (response.connection && response.connection.bytesRead) {
              node.metric('size.bytes', msg, response.connection.bytesRead)
            }
          }

          if (node.ret !== 'bin') {
            msg.payload = msg.payload.toString('utf8') // txt

            if (node.ret === 'obj') {
              try {
                msg.payload = JSON.parse(msg.payload)
              } catch (e) {
                // obj
                node.warn(RED._('httpin.errors.json-error'))
              }
            }
          }
          msg.query = query
          msg.data = body
          node.send(msg)
        }
      })
    })
  }

  RED.nodes.registerType('filter', filter, {
    credentials: {
      user: {
        type: 'text',
      },
      password: {
        type: 'password',
      },
    },
  })
}
