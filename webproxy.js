var http = require("http");
var net = require("net");
var fs = require("fs");

var debugging = 0;

var regex_hostport = /^([^:]+)(:([0-9]+))?$/;

var d = new Date();

var log_file = "./logs/log_" + d.getFullYear().toString() + d.getMonth() + 1 + d.getDate().toString() + "_" + d.getHours() + d.getMinutes() + ".txt";

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

  return [host, port];
}

// handle a HTTP proxy request
function httpUserRequest(userRequest, userResponse) {
  if (debugging) {
    fs.appendFile(log_file, "\n   > request: " + userRequest.url, (err) => {
      if (err) throw err;
    });
    console.log("  > request: %s", userRequest.url);
  }

  var httpVersion = userRequest["httpVersion"];
  var hostport = getHostPortFromString(userRequest.headers["host"], 80);

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

  var options = {
    host: hostport[0],
    port: hostport[1],
    method: userRequest.method,
    path: path,
    agent: userRequest.agent,
    auth: userRequest.auth,
    headers: userRequest.headers
  };

  if (debugging) {
    fs.appendFile(log_file, "\n   > options: " + JSON.stringify(options, null, 2), (err) => {
      if (err) throw err;
    });
    console.log("  > options: %s", JSON.stringify(options, null, 2));
  }

  var proxyRequest = http.request(options, function(proxyResponse) {
    if (debugging) {
      fs.appendFile(log_file, "\n  > request headers: " + JSON.stringify(options["headers"], null, 2), (err) => {
        if (err) throw err;
      });
      console.log(
        "  > request headers: %s",
        JSON.stringify(options["headers"], null, 2)
      );
    }

    if (debugging) {
      fs.appendFile(log_file, "\n   < response " + proxyResponse.statusCode + " headers: " + JSON.stringify(proxyResponse.headers, null, 2), (err) => {
        if (err) throw err;
      });
      console.log(
        "  < response %d headers: %s",
        proxyResponse.statusCode,
        JSON.stringify(proxyResponse.headers, null, 2)
      );
    }

    userResponse.writeHead(proxyResponse.statusCode, proxyResponse.headers);
    proxyResponse.setEncoding('utf8');
    let proxyRawData = '';

    proxyResponse.on("data", function(chunk) {
      if (debugging) {
        fs.appendFile(log_file, "\n  > chunk = " + chunk.length + " bytes "  + "\n" + chunk, (err) => {
          if (err) throw err;
        });
        proxyRawData += chunk;
        console.log("  < chunk = %d bytes", chunk.length);
      }
      userResponse.write(chunk);
    });

    proxyResponse.on("end", function() {
      if (debugging) {
        fs.appendFile(log_file, "\n  < END", (err) => {
          if (err) throw err;
        });
        console.log("  < END");
      }
      try {
        const parsedData = JSON.parse(proxyRawData);
        console.log(parsedData);
      } catch (e) {
        console.error(e.message);
      }
      userResponse.end();
    });
  });

  proxyRequest.on("error", function(error) {
    userResponse.writeHead(500);
    userResponse.write(
      "<h1>500 Error</h1>\r\n" +
        "<p>Error was <pre>" +
        error +
        "</pre></p>\r\n" +
        "</body></html>\r\n"
    );
    userResponse.end();
  });

  userRequest.addListener("data", function(chunk) {
    if (debugging) {
      fs.appendFile(log_file, "\n  > chunk = " + chunk.length + " bytes " + "\n" + chunk, (err) => {
        if (err) throw err;
      });
      console.log("  > chunk = %d bytes", chunk.length);
    }
    proxyRequest.write(chunk);
  });

  userRequest.addListener("end", function() {
    proxyRequest.end();
  });
}

function main() {
  var port = 5555; // default port if none on command line
  

  // check for any command line arguments
  for (var argn = 2; argn < process.argv.length; argn++) {
    if (process.argv[argn] === "-p") {
      port = parseInt(process.argv[argn + 1]);
      argn++;
      continue;
    }

    if (process.argv[argn] === "-d") {
      debugging = 1;
      continue;
    }
  }

  if (debugging) {
    fs.appendFile(log_file, "\nserver listening on port " + port, (err) => {
      if (err) throw err;
    });
    console.log("server listening on port " + port);
  }

  // start HTTP server with custom request handler callback function
  var server = http.createServer(httpUserRequest).listen(port);

  // add handler for HTTPS (which issues a CONNECT to the proxy)
  server.addListener("connect", function(request, socketRequest, bodyhead) {
    var url = request["url"];
    var httpVersion = request["httpVersion"];

    var hostport = getHostPortFromString(url, 443);

    if (debugging) {
      fs.appendFile(log_file, "\n  = will connect to " + hostport[0] + ":" + hostport[1], (err) => {
        if (err) throw err;
      });
      console.log("  = will connect to %s:%s", hostport[0], hostport[1]);
    }

    // set up TCP connection
    var proxySocket = new net.Socket();
    proxySocket.connect(parseInt(hostport[1]), hostport[0], function() {
      if (debugging) {
        fs.appendFile(log_file, "\n    < connected to " + hostport[0] + ":" + hostport[1], (err) => {
          if (err) throw err;
        });
        fs.appendFile(log_file, "\n    > writing head of length " + bodyhead.length, (err) => {
          if (err) throw err;
        });
        
        console.log("  < connected to %s/%s", hostport[0], hostport[1]);
        console.log("  > writing head of length %d", bodyhead.length);
      }

      proxySocket.write(bodyhead);

      // tell the caller the connection was successfully established
      socketRequest.write(
        "HTTP/" + httpVersion + " 200 Connection established\r\n\r\n"
      );
    });

    proxySocket.on("data", function(chunk) {
      if (debugging) {
        fs.appendFile(log_file, "\n   < data length =  " + chunk.length + "\n" + chunk, (err) => {
          if (err) throw err;
        });
        console.log("  < data length = %d", chunk.length);
      }

      socketRequest.write(chunk);
    });

    proxySocket.on("end", function() {
      if (debugging) {
        fs.appendFile(log_file, "\n  < end", (err) => {
          if (err) throw err;
        });
        console.log("  < end");
      }

      socketRequest.end();
    });

    socketRequest.on("data", function(chunk) {
      if (debugging) {
        fs.appendFile(log_file, "\n  > data length = " + chunk.length + "\n" + chunk, (err) => {
          if (err) throw err;
        });
        console.log("  > data length = %d", chunk.length);
      }

      proxySocket.write(chunk);
    });

    socketRequest.on("end", function() {
      if (debugging) {
        fs.appendFile(log_file, "\n  < end", (err) => {
          if (err) throw err;
        });
        console.log("  < end");
      }

      proxySocket.end();
    });

    proxySocket.on("error", function(err) {
      socketRequest.write(
        "HTTP/" + httpVersion + " 500 Connection error\r\n\r\n"
      );
      if (debugging) {
        fs.appendFile(log_file, "\n   < ERR: " + err, (error) => {
          if (error) throw error;
        });
        console.log("  < ERR: %s", err);
      }
      socketRequest.end();
    });

    socketRequest.on("error", function(err) {
      if (debugging) {
        fs.appendFile(log_file, "\n   < ERR: " + err, (error) => {
          if (error) throw error;
        });
        console.log("  < ERR: %s", err);
      }
      proxySocket.end();
    });
  }); // HTTPS connect listener
}

main();
