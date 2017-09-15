const jsdocParser = require('./jsdocparser');
const time = require('./time');
const utils = require('./utils');


class RequireChecker {

  /**
   * @param {Array<string>} jsFiles
   * @param {Array<string>=} opt_externFiles
   */
  constructor(jsFiles, opt_externFiles) {

    /** @type {Array<string>} */
    this.excludeProvides = null;

    /** @type {Array<string>} */
    this.externFiles = opt_externFiles || [];

    /** @type {Array<string>} */
    this.jsFiles = jsFiles;

    /** @type {boolean} */
    this.logPrint = true;

    /** @type {boolean} */
    this.resultPrint = true;
  }

  /**
   * @param {Object<string,Array<string>>} missingRequiresMap
   * @param {Object<string,Array<string>>} unnecessaryRequiresMap
   * @private
   */
  _printResult(missingRequiresMap, unnecessaryRequiresMap) {
    const missingRequiresInfo = [];
    const unnecessaryRequiresInfo = [];
    const sortFunc = (a, b) => a.path > b.path ? 1 : a.path < b.path ? -1 : 0;

    for (let path in missingRequiresMap) {
      missingRequiresInfo.push({
        path: path,
        missingRequires: missingRequiresMap[path],
      });
    }

    for (let path in unnecessaryRequiresMap) {
      unnecessaryRequiresInfo.push({
        path: path,
        missingRequires: unnecessaryRequiresMap[path],
      });
    }

    missingRequiresInfo.sort(sortFunc);
    unnecessaryRequiresInfo.sort(sortFunc);

    console.log(`Missing requires: ${missingRequiresInfo.length}`);

    missingRequiresInfo.forEach(item => {
      console.log(item.path);
      item.missingRequires.forEach(require => console.log('\t' + require));
    });

    if (missingRequiresInfo.length) {
      console.log('\n');
    }

    console.log(`Unnecessary requires: ${unnecessaryRequiresInfo.length}`);

    unnecessaryRequiresInfo.forEach(item => {
      console.log(item.path);
      item.missingRequires.forEach(require => console.log('\t' + require));
    });
  }

  /**
   * @param {Source} jsSource
   * @param {Array<string>} provides
   * @return {!Object}
   */
  getWrongRequiresInFile(jsSource, provides) {
    const missingRequires = [];
    const unnecessaryRequires = [];
    const syntaxTree = jsSource.syntaxTree;

    if (syntaxTree) {
      let usedNamespacesMap = {};
      let jsdocTypesMap = {};

      if (syntaxTree.tokens) {
        usedNamespacesMap = getFileIdsMap(syntaxTree.tokens);
        const map = {};
        /** @type {!Object<string,string>} */
        const jsCache = {};

        for (let id in usedNamespacesMap) {
          if (jsCache[id]) {
            map[jsCache[id]] = 1;
          } else if (undefined === jsCache[id]) {
            jsCache[id] = null;

            provides.every(provide => {
              if (0 == id.indexOf(provide) && (id.length == provide.length ||
                      /[^\w\$]/.test(id[provide.length]))) {
                jsCache[id] = provide;
                map[provide] = 1;

                return false;
              }

              return true;
            });
          }
        }

        usedNamespacesMap = map;
      }

      if (syntaxTree.comments) {
        syntaxTree.comments.forEach(comment => {
          if ('Block' == comment.type && /^\*[^\*]/.test(comment.value)) {
            jsdocParser.getTypes(comment.value).forEach(type => {
              jsdocTypesMap[type] = 1;
            });
          }
        });

        const map = {};
        /** @type {!Object<string,string>} */
        const docCache = {};

        for (let id in jsdocTypesMap) {
          if (docCache[id]) {
            map[docCache[id]] = 1;
          } else if (undefined === docCache[id]) {
            docCache[id] = null;

            provides.every(provide => {
              const escaped = provide.replace('.', '\\.').replace('$', '\\$');
              const regExp = new RegExp(
                  '[^A-Za-z0-9_\.\$]' + escaped + '[^A-Za-z0-9_\$]');

              if (-1 < ` ${id} `.search(regExp)) {
                docCache[id] = provide;
                map[provide] = 1;

                return false;
              }

              return true;
            });
          }
        }

        jsdocTypesMap = map;
      }

      jsSource.requires.forEach(require => {
        if (!usedNamespacesMap[require] && !jsdocTypesMap[require]) {
          unnecessaryRequires.push(require);
        }
      });

      const provideRequireMap = {};

      jsSource.provides.concat(jsSource.requires).forEach(id => {
        provideRequireMap[id] = 1;
      });

      for (let id in usedNamespacesMap) {
        if (!provideRequireMap[id]) {
          missingRequires.push(id);
        }
      }

      missingRequires.sort();
      unnecessaryRequires.sort();
    }

    return {
      missingRequires,
      unnecessaryRequires,
    };
  }

  /**
   * @return {!Promise<{missingRequiresMap:!Object<string,!Array<string>>,
   *    unnecessaryRequiresMap:!Object<string,Array<string>>}>}
   */
  getWrongRequires() {
    time.start(this.logPrint);

    let jsSources;

    try {
      jsSources = utils.findSourcesByJsFiles(this.jsFiles, null, true);
    } catch (e) {
      return Promise.reject(e);
    }

    let externSources = [];

    if (this.externFiles.length) {
      try {
        externSources = utils.findSourcesByJsFiles(
            this.externFiles, null, true);
      } catch (e) {
        return Promise.reject(e);
      }
    }

    time.tick('Search sources by JS files');

    const providesMap = {};
    const provides = [];

    jsSources.concat(externSources).forEach(jsSource =>
        jsSource.provides.forEach(provide => {
          providesMap[provide] = 1;
        }));

    if (this.excludeProvides) {
      this.excludeProvides.forEach(provide => {
        if (providesMap[provide]) {
          delete providesMap[provide];
        }
      });
    }

    for (let provide in providesMap) {
      provides.push(provide);
    }

    provides.sort((a, b) => a < b ? 1 : a > b ? -1 : 0);

    const missingRequiresMap = {};
    const unnecessaryRequiresMap = {};

    time.tick('Sources found');

    jsSources.forEach(jsSource => {
      const {missingRequires, unnecessaryRequires} =
          this.getWrongRequiresInFile(jsSource, provides);

      if (missingRequires.length) {
        missingRequiresMap[jsSource.path] = missingRequires;
      }

      if (unnecessaryRequires.length) {
        unnecessaryRequiresMap[jsSource.path] = unnecessaryRequires;
      }
    });

    time.tick('Wrong requires found.');
    time.total('Total time. Compiling finished.');

    if (this.resultPrint) {
      this._printResult(missingRequiresMap, unnecessaryRequiresMap);
    }

    return Promise.resolve({
      missingRequiresMap,
      unnecessaryRequiresMap,
    });
  }
}
module.exports = RequireChecker;


/**
 * @param {Array<Object<string,{type:string,value:string}>>} tokens
 * @return {Object<string,number>}
 */
const getFileIdsMap = tokens => {
  const idsMap = {};
  let id = [];

  tokens.forEach(token => {
    if ('Identifier' == token.type) {
      id.push(token.value);
    } else if (('Punctuator' != token.type || '.' != token.value) &&
        id.length) {
      const index = id.indexOf('prototype');

      if (-1 < index) {
        id.splice(index, id.length - index);
      }

      const fullId = id.join('.');

      if (!idsMap[fullId]) {
        idsMap[fullId] = 1;
      }

      id = [];
    }
  });

  return idsMap;
};
