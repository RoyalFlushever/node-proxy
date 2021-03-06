var http = require('http');
var https = require('https');
var net = require('net');
var pac = require('pac-resolver');
var url = require('url');
var https = require('https');
const
fs = require('fs');

var HttpsProxyAgent = require('https-proxy-agent');

function createProxyAgent(proxyhost, endpoint) {
	// HTTP/HTTPS proxy to connect to
	var proxy = proxyhost;// 'http://168.63.76.32:3128';

	// HTTPS endpoint for the proxy to connect to

	var opts = url.parse(endpoint);

	// create an instance of the `HttpsProxyAgent` class with the proxy server
	// information
	var agent = new HttpsProxyAgent(proxy);

	return agent;
}

var debugging = 0;

var regex_hostport = /^([^:]+)(:([0-9]+))?$/;
var regex_url = /\S+\b(\S+)/;

function getUrlHeader(data) {
	return regex_url.exec(data)[0];

}

function getHostPortFromString(hostString, defaultPort) {
	var host = hostString;
	var port = defaultPort;

	var result = regex_hostport.exec(hostString);
	if (result != null) {
		host = result[1];
		if (result[2] != null) {
			port = result[3];
		}
	}

	return ([ host, port ]);
}

var FindProxyForURL;

var authText;
var auth;

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

function printHeaderRequestHttp(userRequest) {
	var httpVersion = userRequest['httpVersion'];
	console.log(userRequest.method + ' ' + userRequest['url'] + " HTTP/" + httpVersion + "\r\n");
	console.log(JSON.stringify(userRequest.headers, null, 4));
}

function printHeaderResponsetHttp(response) {
	var httpVersion = response['httpVersion'];
	console.log("HTTP/" + httpVersion + ' ' + response['statusCode'] + ' ' + response['statusMessage'] + "\r\n");
	console.log(JSON.stringify(response.headers, null, 4));
}

function https_request(userRequest, userResponse) {

	printHeaderRequestHttp(userRequest);

	var hostport = getHostPortFromString(userRequest.headers['host'], 443);

	FindProxyForURL(userRequest.url, hostport[0], function(err, res) {
		if (err)
			console.log(err);

		// → "DIRECT"
		if (res == 'DIRECT') {
			var hostport = getHostPortFromString(userRequest.headers['host'], 443);

			// have to extract the path from the requested URL
			var path = userRequest.url;

			result = /^[a-zA-Z]+:\/\/[^\/]+(\/.*)?$/.exec(userRequest.url);
			if (result) {
				if (result[1].length > 0) {
					path = result[1];
				} else {
					path = "/";
				}
			}
			delete userRequest.headers["Proxy-Authorization"];
			var options = {
			    'host' : hostport[0],
			    'port' : hostport[1],
			    'method' : userRequest.method,
			    'path' : path,
			    'agent' : userRequest.agent,
			    'auth' : userRequest.auth,
			    'headers' : userRequest.headers

			};
		} else {

			var overHeader = userRequest.headers;
			overHeader["Proxy-Authorization"] = auth;
			var proxyHostport = getHostPortFromString(getUrlHeader(res), 443);

			var agent = createProxyAgent('http://' + proxyHostport[0] + ':' + proxyHostport[1], userRequest.url);

			var hostport = getHostPortFromString(userRequest.headers['host'], 443);

			var options = {
			    'host' : hostport[0],
			    'port' : hostport[1],
			    path : userRequest.url,
			    'agent' : agent,
			    headers : overHeader
			};
		}

		var proxyRequest = https.request(options, function(proxyResponse) {
			printHeaderResponsetHttp(proxyResponse);
			userResponse.writeHead(proxyResponse.statusCode, proxyResponse.headers);

			proxyResponse.on('data', function(chunk) {
				if (debugging) {
					console.log('  < ' + chunk);
				}
				userResponse.write(chunk);
			});

			proxyResponse.on('end', function() {
				if (debugging) {
					console.log('  < END');
				}
				userResponse.end();
			});
		});

		proxyRequest.on('error', function(error) {
			userResponse.writeHead(500);
			userResponse.write("<h1>500 Error</h1>\r\n" + "<p>Error was <pre>" + error + "</pre></p>\r\n" + "</body></html>\r\n");
			userResponse.end();
		});

		userRequest.on('data', function(chunk) {
			if (debugging) {
				console.log('  > ' + chunk);
			}
			proxyRequest.write(chunk);
		});

		userRequest.on('end', function() {
			proxyRequest.end();
		});
	});
}

var https_decode = 0;

// handle a HTTP proxy request
function httpUserRequest(userRequest, userResponse) {

	printHeaderRequestHttp(userRequest);
	var hostport = getHostPortFromString(userRequest.headers['host'], 80);

	FindProxyForURL(userRequest.url, hostport[0], function(err, res) {
		if (err)
			console.log(err);

		// → "DIRECT"
		if (res == 'DIRECT') {
			var hostport = getHostPortFromString(userRequest.headers['host'], 80);

			// have to extract the path from the requested URL
			var path = userRequest.url;

			result = /^[a-zA-Z]+:\/\/[^\/]+(\/.*)?$/.exec(userRequest.url);
			if (result) {
				if (result[1].length > 0) {
					path = result[1];
				} else {
					path = "/";
				}
			}
			delete userRequest.headers["Proxy-Authorization"];
			var options = {
			    'host' : hostport[0],
			    'port' : hostport[1],
			    'method' : userRequest.method,
			    'path' : path,
			    'agent' : userRequest.agent,
			    'auth' : userRequest.auth,
			    'headers' : userRequest.headers
			};
		} else {

			var overHeader = userRequest.headers;
			overHeader["Proxy-Authorization"] = auth;
			var hostport = getHostPortFromString(getUrlHeader(res), 80);
			var options = {
			    'host' : hostport[0],
			    'port' : hostport[1],
			    path : userRequest.url,
			    headers : overHeader
			};
		}

		var proxyRequest = http.request(options, function(proxyResponse) {
			printHeaderResponsetHttp(proxyResponse);
			userResponse.writeHead(proxyResponse.statusCode, proxyResponse.headers);

			proxyResponse.on('data', function(chunk) {
				if (debugging) {
					console.log('  < ' + chunk);
				}
				userResponse.write(chunk);
			});

			proxyResponse.on('end', function() {
				if (debugging) {
					console.log('  < END');
				}
				userResponse.end();
			});
		});

		proxyRequest.on('error', function(error) {
			userResponse.writeHead(500);
			userResponse.write("<h1>500 Error</h1>\r\n" + "<p>Error was <pre>" + error + "</pre></p>\r\n" + "</body></html>\r\n");
			userResponse.end();
		});

		userRequest.on('data', function(chunk) {
			if (debugging) {
				console.log('  > ' + chunk);
			}
			proxyRequest.write(chunk);
		});

		userRequest.on('end', function() {
			proxyRequest.end();
		});
	});
}

var options_certificat;

function main() {

	var port = 5555; // default port if none on command line
	// check for any command line arguments

	var urlProxyPac = "";
	var password;
	var login;

	var certificatKey = "server.key";
	var certificat = "server.crt";

	for (var argn = 2; argn < process.argv.length; argn++) {
		if (process.argv[argn] === '-p') {
			port = parseInt(process.argv[argn + 1]);
			argn++;
			continue;
		}

		if (process.argv[argn] === '-P') {
			urlProxyPac = process.argv[argn + 1];
			argn++;
			continue;
		}

		if (process.argv[argn] === '-l') {
			login = process.argv[argn + 1];
			argn++;
			continue;
		}

		if (process.argv[argn] === '-pass') {
			password = process.argv[argn + 1];
			argn++;
			continue;
		}

		if (process.argv[argn] === '-cert') {
			certificat = process.argv[argn + 1];
			argn++;
			continue;
		}

		if (process.argv[argn] === '-certKey') {
			certificatKey = process.argv[argn + 1];
			argn++;
			continue;
		}

		if (process.argv[argn] === '-d') {
			debugging = 1;
			continue;
		}

		if (process.argv[argn] === '-https') {
			https_decode = 1;
			continue;
		}
	}

	auth = 'Basic ' + new Buffer(login + ":" + password).toString('base64');

	var request = http.get(urlProxyPac, function(response) {

		var allresponse = "";
		response.on('data', function(chunk) {

			allresponse = allresponse + chunk;
		});
		response.on('end', function() {
			FindProxyForURL = pac("" + allresponse);
			console.log("FindProxyForURL OK for " + urlProxyPac);

			options_certificat = {
			    key : fs.readFileSync(certificatKey),
			    cert : fs.readFileSync(certificat)
			};

			var httpsserver = https.createServer(options_certificat, https_request);
			// HTTPS connect listener
			httpsserver.listen(port + 1);

			console.log("TCP server accepting connection on port: " + (port + 1));
		});

	});

	if (debugging) {
		console.log('webproxy server listening on port ' + (port));
	}

	// start HTTP server with custom request handler callback function
	var server = http.createServer(httpUserRequest);

	// add handler for HTTPS (which issues a CONNECT to the proxy)
	server.on('connect', function(request, socketRequest, bodyhead) {
		var url = request['url'];
		var httpVersion = request['httpVersion'];

		var hostport = getHostPortFromString(url, 443);

		FindProxyForURL(request.url, hostport[0], function(err, res) {
			if (err)
				console.log(err);

			// → "DIRECT"

			if (!(res == 'DIRECT')) {
				hostport = getHostPortFromString(getUrlHeader(res), 80);
			}

			// set up TCP connection
			var proxySocket = new net.Socket();

			if (https_decode) {
				hostport[1] = (port + 1) + '';
				hostport[0] = "localhost";
				res = 'DIRECT'; // do not issue Connect header to https decoder
			}

			proxySocket.connect(parseInt(hostport[1]), hostport[0], function() {
				if (debugging)
					console.log('  < connected to %s/%s', hostport[0], hostport[1]);

				if (debugging) {
					console.log('  > writing head of length %d', bodyhead.length);
				}

				if (res == 'DIRECT') {

					proxySocket.write(bodyhead);

					// tell the caller the connection was successfully
					// established
					socketRequest.write("HTTP/" + httpVersion + " 200 Connection established\r\n\r\n");
				} else {
					var httpConnect = 'CONNECT ' + request['url'] + " HTTP/" + httpVersion + "\r\n";
					for ( var h in request.headers) {
						httpConnect += h + ': ' + request.headers[h] + "\r\n";
					}
					httpConnect += "Proxy-Authorization: " + auth + "\r\n";
					httpConnect += "\r\n";
					proxySocket.write(httpConnect);
					proxySocket.write(bodyhead);

				}
			});

			proxySocket.on('data', function(chunk) {
				socketRequest.write(chunk);

			});

			proxySocket.on('end', function() {
				socketRequest.end();

			});

			socketRequest.on('data', function(chunk) {
				proxySocket.write(chunk);

			});

			socketRequest.on('end', function() {

				proxySocket.end();
			});

			proxySocket.on('error', function(err) {
				socketRequest.write("HTTP/" + httpVersion + " 500 Connection error\r\n\r\n");
				if (debugging) {
					console.log('  < ERR: %s', err);
				}
				socketRequest.end();
			});

			socketRequest.on('error', function(err) {
				proxySocket.end();
				if (debugging) {
					console.log('  > ERR: %s', err);
				}
			});

		});
	}); // HTTPS connect listener
	server.listen(port);

	console.log("TCP server accepting connection on port: " + port);
}

main();
