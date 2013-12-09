var async = require('async');
var exec = require('child_process').exec;


/**
 * @param {string} compilerPath
 * @constructor
 */
var BuilderBase = module.exports = function(compilerPath) {
  /** @private {Array.<string>} */
  this._compilerFlags = null;
  /** @type {string} */
  this.compilerPath = compilerPath;
  /** @private {Object.<boolean|number|string>} */
  this._definesMap = null;
  /** @private {Array.<string>} */
  this._externs = null;
  /** @private {Array.<string>} */
  this._jvmFlags = null;
  /** @private {number} */
  this._maxBuffer = 200 * 1024;
};


/**
 * Pulls just the major and minor version numbers from the first line of
 * 'java -version'. Versions are in the format of [0-9]+\.[0-9]+\..* See:
 * http://www.oracle.com/technetwork/java/javase/versioning-naming-139433.html
 * @const {RegExp}
 */
BuilderBase.VERSION_REGEX = /\"([0-9]+)\.([0-9]+)/m;

/**
 * Determines whether the JVM supports 32-bit mode on the platform.
 * @param {function(Error,boolean)} callback
 */
BuilderBase.javaSupports32BitMode = function(callback) {
  exec('java -d32 -version', function(err) {
    callback(null, !err);
  });
};

/**
 * Get the version string from the Java VM.
 * @param {function(Error,string)} callback
 */
BuilderBase.getJavaVersionString = function(callback) {
  exec('java -version', function(err, stdout, stderr) {
    callback(err, stdout || stderr);
  });
};

/**
 * Returns a 2-tuple for the current version of Java installed.
 * @param {string} versionString String of the Java version (e.g. '1.7.2-ea').
 * @return {Array.<number>?} The major and minor versions, as a 2-tuple
 *    (e.g. (1, 7)).
 */
BuilderBase.parseJavaVersion = function(versionString) {
  var match = BuilderBase.VERSION_REGEX.exec(versionString);

  if (match && match[2]) {
    return [parseInt(match[1], 10), parseInt(match[2], 10)];
  }

  return null;
};


/**
 * @return {!Array.<string>}
 */
BuilderBase.prototype.getAllCompilerFlags = function() {
  var flags = [];

  if (this._definesMap) {
    for (var key in this._definesMap) {
      var value = this._definesMap[key];
      var escapedValue = value;

      if ('string' == typeof escapedValue) {
        escapedValue = "\\'" + escapedValue + "\\'";
      }

      flags.push("--define " + key + "=" + escapedValue);
    }
  }

  if (this._externs) {
    this._externs.forEach(function(extern) {
      flags.push("--externs '" + extern + "'");
    });
  }

  if (this._compilerFlags) {
    flags = flags.concat(this._compilerFlags);
  }

  return flags;
};

/**
 * @param {function(Error)} callback
 */
BuilderBase.checkJavaVersion = function(callback) {
  BuilderBase.getJavaVersionString(function(err, version) {
    if (!err) {
      /** @type {Array.<number>} */
      var javaVersion = BuilderBase.parseJavaVersion(version);

      if (
        !javaVersion ||
        1 > javaVersion[0] ||
        (1 == javaVersion[0] && 6 > javaVersion[1])
      ) {
        err = new Error('Closure Compiler requires Java 1.6 or higher. ' +
          'Please visit http://www.java.com/getjava');
      }
    }

    callback(err);
  });
};

/**
 * @param {JsModule} rootModule
 * @param {function(Error,Array.<string>)} callback The first argument is error
 *    or null. The second argument is version.
 * @protected
 */
BuilderBase.prototype.getArgs = function(rootModule, callback) {
  var onJava32BitModeCheck = function(supports, callback) {
    var args = ['java'];

    if (supports) {
      args.push('-d32');
    }

    // Prefer the "client" VM.
    args.push('-client');

    // Add JVM flags, if any
    if (this._jvmFlags) {
      args = args.concat(this._jvmFlags);
    }

    // Add the application JAR.
    args.push("-jar '" + this.compilerPath + "'");

    rootModule.getDeps(true).forEach(function(jsSource) {
      args.push("--js '" + jsSource.path + "'");
    });

    var compilerFlags = this.getAllCompilerFlags();

    if (compilerFlags.length) {
      args = args.concat(compilerFlags);
    }

    callback(null, args);
  };

  async.compose(
    onJava32BitModeCheck.bind(this),
    BuilderBase.javaSupports32BitMode,
    function(emptyData, callback) {
      BuilderBase.checkJavaVersion(callback);
    }
  )(null, callback);
};

/**
 * @param {JsModule} rootModule
 * @param {function(Error,string)} callback The first argument is error or
 *    null. The second argument is the compiled source, as a string, or empty
 *    string if compilation failed.
 * @protected
 */
BuilderBase.prototype.runCompiler = function(rootModule, callback) {
  var compile = function(err, args) {
    if (err) {
      callback(err, '');
    } else {
      var command = args.join(' ');
      console.log('Compiling with the following command: ' + command);

      exec(command, {
        maxBuffer: this._maxBuffer
      }, function(err, stdout, stderr) {
        if (stderr) {
          console.error(stderr);
        }

        callback(err, stdout);
      });
    }
  };
  this.getArgs(rootModule, compile.bind(this));
};

/**
 * @return {Array.<string>}
 */
BuilderBase.prototype.getCompilerFlags = function() {
  return this._compilerFlags;
};

/**
 * @param {Array.<string>} flags
 */
BuilderBase.prototype.setCompilerFlags = function(flags) {
  this._compilerFlags = flags;
};

/**
 * @return {Object.<boolean|number|string>}
 */
BuilderBase.prototype.getDefinesMap = function() {
  return this._definesMap;
};

/**
 * @param {Object.<boolean|number|string>} definesMap
 */
BuilderBase.prototype.setDefinesMap = function(definesMap) {
  this._definesMap = definesMap;
};

/**
 * @return {Array.<string>}
 */
BuilderBase.prototype.getExterns = function() {
  return this._externs;
};

/**
 * @param {Array.<string>} externs
 */
BuilderBase.prototype.setExterns = function(externs) {
  this._externs = externs;
};

/**
 * @return {Array.<string>}
 */
BuilderBase.prototype.getJvmFlags = function() {
  return this._jvmFlags;
};

/**
 * @param {Array.<string>} flags
 */
BuilderBase.prototype.setJvmFlags = function(flags) {
  this._jvmFlags = flags;
};

/**
 * @return {number}
 */
BuilderBase.prototype.getMaxBuffer = function() {
  return this._maxBuffer;
};

/**
 * @param {number} maxBuffer
 */
BuilderBase.prototype.setMaxBuffer = function(maxBuffer) {
  this._maxBuffer = maxBuffer;
};
