const Source = require('./source');
const fs = require('fs');
const utils = require('./utils');


class Cache {

  /** @param {string} file */
  constructor(file) {

    /** @type {string} */
    this.file = file;

    /** @private {Object<string,string>} */
    this._modifiedDates = {};

    /** @private {Object<string,Source>} */
    this._sourcesMap = {};

    try {
      if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, 'utf8');
        const json = JSON.parse(content);

        if ('object' == typeof json) {
          for (let jsFile in json) {
            const jsonSource = json[jsFile];

            if (jsonSource.provides &&
                jsonSource.requires &&
                jsonSource.modifiedDates) {
              this._modifiedDates[jsFile] = jsonSource.modifiedDates;
              this._sourcesMap[jsFile] = new Source(jsFile, jsonSource.provides,
                  jsonSource.requires, !!jsonSource.isModule, null);
            }
          }
        }
      }
    } catch (e) { }
  }

  /**
   * @param {string} path
   * @return {Source}
   */
  getSource(path) {
    if (this._sourcesMap[path]) {
      if (this._modifiedDates[path] == (+fs.statSync(path).mtime)) {
        return this._sourcesMap[path];
      }

      this.removeSource(path);
    }

    return null;
  }

  /** @param {string} path */
  removeSource(path) {
    delete this._modifiedDates[path];
    delete this._sourcesMap[path];
  }

  /**
   * @param {string} path
   * @param {Source} source
   */
  setSource(path, source) {
    this._sourcesMap[path] = source;
  }

  /** @return {!Promise} */
  save() {
    const json = {};

    for (let jsFile in this._sourcesMap) {
      let exists = false;
      let modifiedDates = null;

      try {
        exists = fs.existsSync(jsFile);

        if (exists) {
          modifiedDates = +fs.statSync(jsFile).mtime;
        }
      } catch (e) {}

      if (exists && modifiedDates) {
        json[jsFile] = {
          isModule: this._sourcesMap[jsFile].isModule,
          modifiedDates,
          provides: this._sourcesMap[jsFile].provides,
          requires: this._sourcesMap[jsFile].requires,
        };
      }
    }

    return utils.writeFile(JSON.stringify(json), this.file);
  }
}
module.exports = Cache;
