import {
  ensure_environment,
  setup_plugin_venv,
  get_release_download_url,
  pip_install,
  isValidPythonPath,
} from './setup.js';

import {
  stateless_run_file,
  stateless_run_func,
  resolve_python_env,
} from './run.js';

export class Py {
  static resolve_python_env = resolve_python_env;
  static pip_install = pip_install;
  static stateless_run_file = stateless_run_file;
  static stateless_run_func = stateless_run_func;
  static isValidPythonPath = isValidPythonPath;

  static Setup = {
    ensure_environment,
    setup_plugin_venv,
    get_release_download_url,
  };
}

export default Py;
