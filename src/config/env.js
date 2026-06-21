const path = require('path');
const dotenv = require('dotenv');

const rootDir = path.join(__dirname, '..', '..');
const envArg = process.argv.find((arg) => arg.startsWith('--env='));
const overrideFile = envArg ? envArg.slice('--env='.length) : null;

// Load the shared/server configuration first.
dotenv.config({ path: path.join(rootDir, '.env') });

// A selected environment file only overrides values for this process.
if (overrideFile) {
  dotenv.config({
    path: path.resolve(rootDir, overrideFile),
    override: true
  });
}

