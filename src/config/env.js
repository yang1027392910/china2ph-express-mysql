const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

const rootDir = path.join(__dirname, '..', '..');
const envArg = process.argv.find((arg) => arg.startsWith('--env='));
const overrideFile = envArg ? envArg.slice('--env='.length) : null;
const isPm2Process = process.env.pm_id !== undefined || process.env.name !== undefined;
const selectedEnvFile = overrideFile || (isPm2Process ? '.env.production' : null);

// Load the shared/server configuration first.
dotenv.config({ path: path.join(rootDir, '.env') });

// A selected environment file only overrides values for this process.
if (selectedEnvFile) {
  const selectedEnvPath = path.resolve(rootDir, selectedEnvFile);

  if (fs.existsSync(selectedEnvPath)) {
    dotenv.config({
      path: selectedEnvPath,
      override: true
    });
  }
}

if (!process.env.NODE_ENV) {
  if (selectedEnvFile === '.env.production') {
    process.env.NODE_ENV = 'production';
  } else if (selectedEnvFile === '.env.local') {
    process.env.NODE_ENV = 'development';
  }
}
