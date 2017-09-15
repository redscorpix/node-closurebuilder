const DepsTree = require('./depstree');
const path = require('path');


class JsModule {

  /**
   * @param {string} name
   * @param {JsModule?} parent
   * @param {Array<Source>} jsSources
   * @param {Array<Source>} inputSources
   */
  constructor(name, parent, jsSources, inputSources) {

    /** @private {Array<!Source>} */
    this._deps = [];

    /** @private {Array<!Source>} */
    this._inputSources = inputSources;

    /** @private {Array<!Source>} */
    this._jsSources = jsSources;

    /** @type {string} */
    this.name = name;

    /** @type {JsModule?} */
    this._parent = parent;

    /** @private {Array<JsModule>} */
    this._subModules = [];

    /** @type {string|function(ModuleBuilder,JsModule,JsModule=)|null} */
    this.wrapper = null;
  }

  /**
   * Returns true if the given Source is the Closure base.js source.
   * @param {!Source} jsSource
   * @return {boolean}
   */
  static isClosureBaseFile(jsSource) {
    return 'base.js' == path.basename(jsSource.path) &&
        jsSource.provides && 'goog' == jsSource.provides[0];
  }

  /**
   * @return {!Promise<!Source>}
   * @private
   */
  _getBaseFileSource() {
    /** @type {!Array<!Source>} */
    const baseFileSources = this._jsSources.filter(jsSource =>
        JsModule.isClosureBaseFile(jsSource));

    if (1 == baseFileSources.length) {
      return Promise.resolve(baseFileSources[0]);
    }

    const errorMessage = baseFileSources.length ?
        [
          'More than one Closure base.js files found at these paths:',
          ...baseFileSources.map(baseFile => baseFile.path),
        ].join('\n') :
        'No Closure base.js file found.';
    return Promise.reject(new Error(errorMessage));
  }

  /** @return {!Promise} */
  calculateDeps() {
    try {
      const tree = new DepsTree(this._jsSources);
      this._deps = this._deps.concat(tree.getDependencies(this._inputSources));
    } catch (e) {
      return Promise.reject(e);
    }

    return Promise.all(this._subModules.map(subModule =>
        subModule.calculateDeps()));
  }

  /**
   * @param {boolean=} opt_withSubmodules
   * @return {!Array<Source>}
   */
  getDeps(opt_withSubmodules) {
    const allDeps = [];

    this._deps.forEach(dep => {
      if (-1 == allDeps.indexOf(dep)) {
        allDeps.push(dep);
      }
    });

    if (opt_withSubmodules) {
      this._subModules.forEach(subModule =>
          subModule.getDeps(true).forEach(subDep => {
            if (-1 == allDeps.indexOf(subDep)) {
              allDeps.push(subDep);
            }
          }));
    }

    return allDeps;
  }

  normalizeDeps() {
    /** @type {Array<Array<!Source>>} */
    const subDeps = this._subModules.map(subModule => subModule.getDeps(true));
    const sharingDeps = [];

    for (let i = 0; i < subDeps.length; i++) {
      for (let j = 0; j < subDeps[i].length; j++) {
        const subDep = subDeps[i][j];
        let sharing = -1 < this._deps.indexOf(subDep);

        for (let k = i + 1; k < subDeps.length; k++) {
          const index = subDeps[k].indexOf(subDep);

          if (-1 < index) {
            sharing = true;
            subDeps[k].splice(index, 1);
          }
        }

        if (sharing) {
          sharingDeps.push(subDep);
        }
      }
    }

    sharingDeps.forEach(dep => {
      if (-1 == this._deps.indexOf(dep)) {
        this._deps.push(dep);
      }
    });

    this._subModules.forEach(subModule => {
      sharingDeps.forEach(dep => subModule.removeDep(dep));
      subModule.normalizeDeps();
    });
  }

  /**
   * @param {Source} dep
   * @return {boolean}
   */
  removeDep(dep) {
    let removed = false;
    const index = this._deps.indexOf(dep);

    if (-1 < index) {
      removed = true;
      this._deps.splice(index, 1);
    }

    this._subModules.forEach(subModule => {
      removed = subModule.removeDep(dep) || removed;
    });

    return removed;
  }

  /** @return {string} */
  getModuleFlagValue() {
    return this.name + ':' + this.getDeps().length +
        (this._parent ? ':' + this._parent.name : '');
  };

  /** @return {JsModule} */
  getParent() {
    return this._parent;
  }

  /** @param {!JsModule} subModule */
  addSubModule(subModule) {
    this._subModules.push(subModule);
  }

  /** @param {!Array<!JsModule>} subModules */
  addSubModules(subModules) {
    this._subModules = [
      ...this._subModules,
      ...subModules,
    ];
  }

  /** @return {Array<!JsModule>} */
  getSubModules() {
    return this._subModules;
  }

  /** @return {!Promise} */
  build() {
    return this._getBaseFileSource().
        then(baseSource => this._deps.push(baseSource)).
        then(() => this.calculateDeps()).
        then(() => this.normalizeDeps());
  }
}
module.exports = JsModule;
