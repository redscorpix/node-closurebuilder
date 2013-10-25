/**
 * Utility to use the Closure Compiler CLI from Node.js.
 */

var exec = require('child_process').exec;


/**
 * @param {string} compilerJarPath Path to the Closure compiler .jar file.
 * @param {Array.<string>} sourcePaths Source paths to build, in order.
 * @constructor
 */
var JsCompiler = exports.JsCompiler = function(compilerJarPath, sourcePaths) {
  /**
   * @type {string}
   */
  this.compilerJarPath = compilerJarPath;

  /**
   * @type {Array.<string>}
   */
  this.sourcePaths = sourcePaths;
};


/**
 * Pulls just the major and minor version numbers from the first line of
 * 'java -version'. Versions are in the format of [0-9]+\.[0-9]+\..* See:
 * http://www.oracle.com/technetwork/java/javase/versioning-naming-139433.html
 * @const {RegExp}
 */
JsCompiler.VERSION_REGEX = /\"([0-9]+)\.([0-9]+)/m;

/**
 * @typedef {{
 *  name: string,
 *  wrapper: string
 * }}
 */
JsCompiler.Module;


/**
 * Determines whether the JVM supports 32-bit mode on the platform.
 * @param {function(boolean)} callback
 */
JsCompiler.javaSupports32BitMode = function(callback) {
  exec('java -d32 -version', function(error) {
    callback(!error);
  });
};

/**
 * Get the version string from the Java VM.
 * @param {function(string)} callback
 */
JsCompiler.getJavaVersionString = function(callback) {
  exec('java -version', function(error, stdout, stderr) {
    if (error) {
      process.stdout.write(error);
    }

    callback(stdout || stderr);
  });
};

/**
 * Returns a 2-tuple for the current version of Java installed.
 * @param {string} versionString String of the Java version (e.g. '1.7.2-ea').
 * @return {Array.<number>?} The major and minor versions, as a 2-tuple
 *    (e.g. (1, 7)).
 */
JsCompiler.parseJavaVersion = function(versionString) {
  var match = JsCompiler.VERSION_REGEX.exec(versionString);

  if (match && match[2]) {
    return [parseInt(match[1], 10), parseInt(match[2], 10)];
  }

  return null;
};


/**
 * @private {Array.<string>}
 */
JsCompiler.prototype._compilerFlags = null;

/**
 * @private {Array.<string>}
 */
JsCompiler.prototype._jvmFlags = null;

/**
 * @private {number}
 */
JsCompiler.prototype._maxBuffer = 200 * 1024;

/**
 * @private {string}
 */
JsCompiler.prototype._moduleOutputPathPrefix = '';

/**
 * @private {Array.<JsCompiler.Module>}
 */
JsCompiler.prototype._modules = null;


/**
 * Assembles arguments for call to JsCompiler.
 * @param {string} outputPathPrefix
 * @param {function(Error,string)} callback The first argument is error or
 *    null. The second argument is version.
 */
JsCompiler.prototype._getArgs = function(callback) {
  var self = this;

  JsCompiler.getJavaVersionString(function(version) {
    /** @type {Array.<number>} */
    var javaVersion = JsCompiler.parseJavaVersion(version);

    if (
      !javaVersion ||
      1 > javaVersion[0] ||
      (1 == javaVersion[0] && 6 > javaVersion[1])
    ) {
      callback(new Error('Closure Compiler requires Java 1.6 or higher. Please ' +
        'visit http://www.java.com/getjava'), '');
      return;
    }

    var args = ['java'];

    // Add JVM flags we believe will produce the best performance. See
    // https://groups.google.com/forum/#!topic/closure-library-discuss/7w_O9-vzlj4

    // Attempt 32-bit mode if available (Java 7 on Mac OS X does not support
    // 32-bit mode, for example).
    JsCompiler.javaSupports32BitMode(function(supports) {
      if (supports) {
        args.push('-d32');
      }

      // Prefer the "client" VM.
      args.push('-client');

      // Add JVM flags, if any
      if (self._jvmFlags) {
        args = args.concat(self._jvmFlags);
      }

      // Add the application JAR.
      args.push("-jar '" + self.compilerJarPath + "'");

      if (self._modules) {
        self._modules.forEach(function(jsModule, i) {
          args.push('--module ' + jsModule.name);
          args.push('--module_wrapper ' + jsModule.wrapper);
        });

        if (self._moduleOutputPathPrefix) {
          args.push("--module_output_path_prefix '" +
            self._moduleOutputPathPrefix + "'");
        }
      }

      self.sourcePaths.forEach(function(path) {
        args.push("--js '" + path + "'");
      });

      // Add compiler flags, if any.
      if (self._compilerFlags) {
        args = args.concat(self._compilerFlags);
      }

      callback(null, args.join(' '));
    });
  });
};

/**
 * @return {Array.<string>}
 */
JsCompiler.prototype.getCompilerFlags = function() {
  return this._compilerFlags;
};

/**
 * @param {!Array.<string>} flags
 */
JsCompiler.prototype.setCompilerFlags = function(flags) {
  this._compilerFlags = flags;
};

/**
 * @return {Array.<string>}
 */
JsCompiler.prototype.getJvmFlags = function() {
  return this._jvmFlags;
};

/**
 * @param {!Array.<string>} flags
 */
JsCompiler.prototype.setJvmFlags = function(flags) {
  this._jvmFlags = flags;
};

/**
 * @return {number}
 */
JsCompiler.prototype.getMaxBuffer = function() {
  return this._maxBuffer;
};

/**
 * @param {number} maxBuffer
 */
JsCompiler.prototype.setMaxBuffer = function(maxBuffer) {
  this._maxBuffer = maxBuffer;
};

/**
 * @return {string}
 */
JsCompiler.prototype.getModuleOutputPathPrefix = function() {
  return this._moduleOutputPathPrefix;
};

/**
 * @param {string} pathPrefix
 */
JsCompiler.prototype.setModuleOutputPathPrefix = function(pathPrefix) {
  this._moduleOutputPathPrefix = pathPrefix;
};

/**
 * @return {Array.<JsCompiler.Module>}
 */
JsCompiler.prototype.getModules = function() {
  return this._modules;
};

/**
 * @param {!Array.<JsCompiler.Module>} modules
 */
JsCompiler.prototype.setModules = function(modules) {
  this._modules = modules;
};

/**
 * @param {function(Error,string)} callback The first argument is error or
 *    null. The second argument is the compiled source, as a string, or empty
 *    string if compilation failed.
 */
JsCompiler.prototype.compile = function(callback) {
  this._getArgs(function(err, command) {
    if (err) {
      callback(err, '');
    } else {
      console.log('Compiling with the following command: ' + command);

      exec(command, {
        maxBuffer: this._maxBuffer
      }, function(err, stdout) {
        callback(err, stdout);
      });
    }
  });
};
