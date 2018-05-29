const exec = require('child_process').exec;
const temporary = require('temporary');


/** @abstract */
class BuilderBase {

  /** @param {string} compilerPath */
  constructor(compilerPath) {

    /** @type {Array<string>} */
    this.compilerFlags = null;

    /** @type {string} */
    this.compilerPath = compilerPath;

    /** @type {Object<boolean|number|string>} */
    this.definesMap = null;

    /** @type {Array<string>} */
    this.externs = null;

    /** @type {Array<string>} */
    this.jvmFlags = null;

    /** @type {boolean} */
    this.logLevel = BuilderBase.LogLevel.SHORT;

    /** @type {number} */
    this.maxBuffer = 200 * 1024;
  }

  /**
   * @return {!Array<string>}
   * @private
   */
  _getAllCompilerFlags() {
    /** @type {!Array<string>} */
    const flags = [];

    if (this.definesMap) {
      for (let key in this.definesMap) {
        let escapedValue = this.definesMap[key];

        if ('string' == typeof escapedValue) {
          escapedValue = `'${escapedValue}'`;
        }

        flags.push(`--define ${key}=${escapedValue}`);
      }
    }

    return [
      ...flags,
      ...((this.externs || []).map(extern => `--externs "${extern}"`)),
      ...(this.compilerFlags || []),
    ];
  }

  /**
   * @param {JsModule} rootModule
   * @return {!Promise<{compilerArgs:!Array<string>,javaArgs:!Array<string>}>}
   * @protected
   */
  getArgs(rootModule) {
    return checkJavaVersion().
        then(() => javaSupports32BitMode()).
        then(supports => {
          let javaArgs = ['java'];

          if (supports) {
            javaArgs.push('-d32');
          }

          // Prefer the "client" VM.
          javaArgs.push('-client');

          // Add JVM flags, if any
          if (this.jvmFlags) {
            javaArgs = javaArgs.concat(this.jvmFlags);
          }

          // Add the application JAR.
          javaArgs.push(`-jar "${this.compilerPath}"`);

          /** @type {!Array<string>} */
          const compilerArgs = [
            ...rootModule.getDeps(true).map(jsSource =>
                `--js "${jsSource.path}"`),
            ...this._getAllCompilerFlags(),
          ];

          return {
            compilerArgs,
            javaArgs,
          };
        });
  }

  /**
   * @param {JsModule} rootModule
   * @return {!Promise<string>} Returns promise with compiled source,
   *                            as a string.
   * @protected
   */
  runCompiler(rootModule, cb) {
    return this.getArgs(rootModule).
        then(data => this._runCompilerCompile(data));
  }

  /**
   * @param {{compilerArgs:!Array<string>,javaArgs:!Array<string>}} data
   * @return {!Promise<string>}
   * @private
   */
  _runCompilerCompile(data) {
    const {compilerArgs, javaArgs} = data;

    let tempFile;

    try {
      tempFile = new temporary.File();
    } catch (e) {
      return Promise.reject(e);
    }

    return new Promise((resolve, reject) => {
      tempFile.writeFile(compilerArgs.join(' '), err => {
        if (err) {
          tempFile.unlink(err => console.error);
          reject(err);

          return;
        }

        const args = [
          ...javaArgs,
          ...compilerArgs,
        ];
        const command = [
          ...javaArgs,
          `--flagfile "${tempFile.path}"`,
        ].join(' ');
        let commandLog = '';

        if (BuilderBase.LogLevel.SHORT == this.logLevel) {
          let jsFlag = false;
          const commandArgs = [];

          args.forEach(arg => {
            if (-1 == arg.indexOf('--js ')) {
              commandArgs.push(arg);
            } else if (!jsFlag) {
              jsFlag = true;

              commandArgs.push('--js ...');
            }
          });

          commandLog = commandArgs.join(' ');
        } else if (BuilderBase.LogLevel.LONG == this.logLevel) {
          commandLog = args.join(' ');
        }

        if (commandLog) {
          console.log(`Compiling with the following command: ${commandLog}`);
        }

        exec(command, {
          maxBuffer: this.maxBuffer,
        }, (err, stdout, stderr) => {
          if (stderr) {
            console.error(stderr);
          }

          tempFile.unlink(err => console.error);

          if (err) {
            reject(err);
          } else {
            resolve(stdout);
          }
        });
      });
    });
  }
}
module.exports = BuilderBase;

/** @enum {number} */
BuilderBase.LogLevel = {
  NONE: 0,
  SHORT: 1,
  LONG: 2,
};


/**
 * Pulls just the major and minor version numbers from the first line of
 * 'java -version'. Versions are in the format of [0-9]+\.[0-9]+\..* See:
 * http://www.oracle.com/technetwork/java/javase/versioning-naming-139433.html
 * @const {!RegExp}
 */
const VERSION_REGEX = /\"([0-9]+)\.([0-9]+)/m;

/**
 * Determines whether the JVM supports 32-bit mode on the platform.
 * @return {!Promise<boolean>}
 */
const javaSupports32BitMode = () => new Promise((resolve, reject) =>
    exec('java -d32 -version', err => resolve(!err)));

/**
 * Get the version string from the Java VM.
 * @return {!Promise}
 */
const getJavaVersionString = () => new Promise((resolve, reject) =>
    exec('java -version', (err, stdout, stderr) =>
        err ? reject(err) : resolve(stdout || stderr)));

/**
 * Returns a 2-tuple for the current version of Java installed.
 * @param {string} versionString String of the Java version (e.g. '1.7.2-ea').
 * @return {Array<number>} The major and minor versions, as a 2-tuple
 *    (e.g. (1, 7)).
 */
const parseJavaVersion = versionString => {
  /** @type {Array<string>} */
  const match = VERSION_REGEX.exec(versionString);

  return match && match[2] ?
      [parseInt(match[1], 10), parseInt(match[2], 10)] : null;
};

/** @return {!Promise} */
const checkJavaVersion = () => getJavaVersionString().
    then(version => new Promise((resolve, reject) => {
      /** @type {Array<number>} */
      const javaVersion = parseJavaVersion(version);

      if (!javaVersion ||
          1 > javaVersion[0] ||
          (1 == javaVersion[0] && 6 > javaVersion[1])) {
        reject(new Error('Closure Compiler requires Java 1.6 or higher. ' +
            'Please visit http://www.java.com/getjava'));
      }

      resolve();
    }));
